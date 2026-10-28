import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPersonalityById = vi.fn();
const mockGetRelevantPersonalityMemory = vi.fn();
const mockUpsertMemoryFact = vi.fn();
const mockBuildPersonaPromptPackage = vi.fn();
const mockGenerateChatCompletionWithMeta = vi.fn();
const mockMoodFromLabel = vi.fn();
const mockMoodToLabel = vi.fn();
const mockMoodToPromptFragment = vi.fn();
const mockUpdateMoodState = vi.fn();
const mockGenerateSpeechAudio = vi.fn();

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityById: mockGetPersonalityById,
}));

vi.mock("../models/memoryModel.js", () => ({
  getRelevantPersonalityMemory: mockGetRelevantPersonalityMemory,
  upsertMemoryFact: mockUpsertMemoryFact,
}));

vi.mock("../services/llmService.js", () => ({
  buildPersonaPromptPackage: mockBuildPersonaPromptPackage,
  generateChatCompletionWithMeta: mockGenerateChatCompletionWithMeta,
}));

vi.mock("../services/moodEngine.js", () => ({
  moodFromLabel: mockMoodFromLabel,
  moodToLabel: mockMoodToLabel,
  moodToPromptFragment: mockMoodToPromptFragment,
  updateMoodState: mockUpdateMoodState,
}));

vi.mock("../services/ttsService.js", () => ({
  generateSpeechAudio: mockGenerateSpeechAudio,
}));

const { resetVoiceAudioStore } = await import("../services/voiceAudioStore.js");
const { voiceAudioHandler, voiceTurnHandler } = await import("../controllers/voiceTurnController.js");
const internalRoutes = (await import("../routes/internalChatRoutes.js")).default;

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  res.setHeader = vi.fn((name, value) => {
    res.headers[name] = value;
  });
  res.send = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

function personality() {
  return {
    id: 7,
    name: "Ara",
    mood: "calm",
    moodState: { valence: 0.2, arousal: -0.1, dominance: 0.3 },
    moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    voiceProfile: { engine: "cartesia", cartesiaVoiceId: "voice-from-persona", cartesiaModel: "sonic-3" },
  };
}

describe("voice turn route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetVoiceAudioStore();
    mockGetPersonalityById.mockReturnValue(personality());
    mockGetRelevantPersonalityMemory.mockResolvedValue([{ content: "likes rain", importance: 5 }]);
    mockBuildPersonaPromptPackage.mockReturnValue({ prompt: "YOU ARE ARA" });
    mockMoodFromLabel.mockReturnValue({ valence: 0, arousal: 0, dominance: 0 });
    mockMoodToLabel.mockReturnValue("calm");
    mockMoodToPromptFragment.mockReturnValue("MOOD FRAGMENT");
    mockGenerateChatCompletionWithMeta.mockResolvedValue({
      reply: "The harbor can wait.",
      model: "llama3.1",
      usage: { total_tokens: 12 },
    });
    mockGenerateSpeechAudio.mockResolvedValue({
      buffer: Buffer.from("audio-bytes"),
      contentType: "audio/mpeg",
      engine: "cartesia",
    });
  });

  it("returns reply text and an internal audio URL without writing mood or memory", async () => {
    const res = mockRes();
    await voiceTurnHandler({
      body: {
        personalityId: 7,
        transcript: "what is the harbor plan",
        messages: [{ role: "assistant", content: "Earlier note." }],
        voiceProfile: { engine: "elevenlabs" },
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.text).toBe("The harbor can wait.");
    expect(res.body.audioUrl).toMatch(/^\/api\/internal\/voice-audio\/[a-f0-9]{32}$/);
    expect(res.body.contentType).toBe("audio/mpeg");
    expect(res.body.personalityId).toBe(7);

    expect(mockUpdateMoodState).not.toHaveBeenCalled();
    expect(mockUpsertMemoryFact).not.toHaveBeenCalled();
    expect(mockGenerateChatCompletionWithMeta).toHaveBeenCalledTimes(1);
    const [llmMessages] = mockGenerateChatCompletionWithMeta.mock.calls[0];
    expect(llmMessages.at(-1)).toEqual({ role: "user", content: "what is the harbor plan" });
    expect(llmMessages.some((message) => message.content === "Earlier note.")).toBe(true);

    expect(mockGenerateSpeechAudio).toHaveBeenCalledTimes(1);
    const speechArgs = mockGenerateSpeechAudio.mock.calls[0][0];
    expect(speechArgs.text).toBe("The harbor can wait.");
    expect(speechArgs.voiceProfile.engine).toBe("cartesia");
    expect(speechArgs.voiceProfile.cartesiaVoiceId).toBe("voice-from-persona");

    const audioRes = mockRes();
    const id = res.body.audioUrl.split("/").pop();
    voiceAudioHandler({ params: { id } }, audioRes);
    expect(audioRes.statusCode).toBe(200);
    expect(Buffer.from(audioRes.body).toString()).toBe("audio-bytes");
    expect(audioRes.headers["Content-Type"]).toBe("audio/mpeg");
    expect(audioRes.headers["Cache-Control"]).toBe("no-store");
  });

  it("does not store audio when synthesis fails", async () => {
    const error = new Error("Speech generation failed.");
    error.statusCode = 502;
    mockGenerateSpeechAudio.mockRejectedValue(error);
    const res = mockRes();
    const next = vi.fn();

    await voiceTurnHandler({
      body: { personalityId: 7, transcript: "hello" },
    }, res, next);

    expect(res.statusCode).toBe(502);
    expect(next).not.toHaveBeenCalled();
    const audioRes = mockRes();
    voiceAudioHandler({ params: { id: "missing" } }, audioRes);
    expect(audioRes.statusCode).toBe(404);
  });

  it("rejects an empty transcript before the brain runs", async () => {
    const res = mockRes();
    await voiceTurnHandler({
      body: { personalityId: 7, transcript: "   " },
    }, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(mockGenerateChatCompletionWithMeta).not.toHaveBeenCalled();
    expect(mockGenerateSpeechAudio).not.toHaveBeenCalled();
  });

  it("keeps the voice route behind internal auth and off the session module", () => {
    const voiceTurn = internalRoutes.stack.find((layer) => layer.route?.path === "/voice-turn");
    const voiceAudio = internalRoutes.stack.find((layer) => layer.route?.path === "/voice-audio/:id");
    expect(voiceTurn.route.methods.post).toBe(true);
    expect(voiceTurn.route.stack[0].handle.name).toBe("requireInternalAuth");
    expect(voiceAudio.route.methods.get).toBe(true);
    expect(voiceAudio.route.stack[0].handle.name).toBe("requireInternalAuth");

    const sessionSource = readFileSync(new URL("../services/livekitVoiceSession.js", import.meta.url), "utf8");
    const routeSource = readFileSync(new URL("../controllers/voiceTurnController.js", import.meta.url), "utf8");
    expect(sessionSource).not.toMatch(/llmService|moodEngine|memoryModel|ttsService|internalChat|voiceTurnController/);
    expect(routeSource).not.toMatch(/livekitVoiceSession/);
  });
});
