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
const mockGetAuthenticatedActor = vi.fn();
const mockResolveOwnedPersona = vi.fn();
const mockAdvanceTurnMood = vi.fn();
const mockRunUserContextTurn = vi.fn();
const mockCreateChatMessage = vi.fn();
const mockEmbedChatMessageAsync = vi.fn();

vi.mock("../gatekeeper/authorization.js", () => ({
  getAuthenticatedActor: mockGetAuthenticatedActor,
  resolveOwnedPersona: mockResolveOwnedPersona,
}));

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityById: mockGetPersonalityById,
}));

vi.mock("../models/memoryModel.js", () => ({
  getRelevantPersonalityMemory: mockGetRelevantPersonalityMemory,
  upsertMemoryFact: mockUpsertMemoryFact,
}));

vi.mock("../models/chatModel.js", () => ({
  createChatMessage: (...args) => mockCreateChatMessage(...args),
  embedChatMessageAsync: (...args) => mockEmbedChatMessageAsync(...args),
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

vi.mock("../services/turnMood.js", () => ({
  advanceTurnMood: (...args) => mockAdvanceTurnMood(...args),
  withSpeechMood: (personality) => personality,
}));

vi.mock("../services/userContextTurn.js", () => ({
  runUserContextTurn: (...args) => mockRunUserContextTurn(...args),
}));

const { resetVoiceAudioStore } = await import("../services/voiceAudioStore.js");
const {
  authenticatedVoiceAudioHandler,
  authenticatedVoiceTurnHandler,
  voiceAudioHandler,
  voiceTurnHandler,
} = await import("../controllers/voiceTurnController.js");
const internalRoutes = (await import("../routes/internalChatRoutes.js")).default;
const chatRoutes = (await import("../routes/chatRoutes.js")).default;

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
    mockGetAuthenticatedActor.mockReturnValue({ localUserId: 7, clerkUserId: "user_7" });
    mockResolveOwnedPersona.mockReturnValue(personality());
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
      telemetry: {
        emotionFrame: {
          displayLabel: "Pleased - Warm",
          intensity: 0.42,
          zone: { key: "green", label: "Green Zone", accent: "#44dd88" },
          normalized: { valence: 0.4, arousal: 0.2, dominance: 0.1 },
        },
      },
    });
    mockAdvanceTurnMood.mockResolvedValue({
      newMood: { valence: 0.4, arousal: 0.2, dominance: 0.1 },
      moodLabel: "upbeat",
      moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    });
    mockCreateChatMessage.mockImplementation(({ role }) => ({ id: role === "user" ? 21 : 22 }));
    mockEmbedChatMessageAsync.mockResolvedValue(undefined);
    mockRunUserContextTurn.mockReturnValue({
      affect: { valence: 0.1, arousal: 0.2, intent: "unclear", confidence: 0.4 },
      userModel: { scopeKey: "session:7:anon" },
      theoryOfMind: null,
      adaptation: null,
      flags: { affect: true, model: true, theory: true, adaptation: true },
    });
  });

  it("returns reply text and an internal audio URL after stepping mood", async () => {
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
    expect(res.body.moodState).toEqual({ valence: 0.4, arousal: 0.2, dominance: 0.1 });
    expect(res.body.moodLabel).toBe("upbeat");
    expect(res.body.emotionFrame).toEqual({
      displayLabel: "Pleased - Warm",
      intensity: 0.42,
      zone: { key: "green", label: "Green Zone", accent: "#44dd88" },
      normalized: { valence: 0.4, arousal: 0.2, dominance: 0.1 },
    });

    expect(mockAdvanceTurnMood).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      message: "what is the harbor plan",
    }));
    expect(mockRunUserContextTurn).toHaveBeenCalledWith({
      message: "what is the harbor plan",
      history: [{ role: "assistant", content: "Earlier note." }],
      userId: null,
      personalityId: 7,
      sessionKey: "7:anon",
    });
    expect(mockBuildPersonaPromptPackage).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Array),
      "what is the harbor plan",
      expect.objectContaining({
        userContext: expect.objectContaining({
          userModel: expect.objectContaining({ scopeKey: "session:7:anon" }),
        }),
      }),
    );
    expect(res.body).not.toHaveProperty("userContext");
    expect(mockUpdateMoodState).not.toHaveBeenCalled();
    expect(mockUpsertMemoryFact).not.toHaveBeenCalled();
    expect(mockCreateChatMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      personalityId: 7,
      role: "user",
      content: "what is the harbor plan",
      userId: null,
    }));
    expect(mockCreateChatMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      personalityId: 7,
      role: "assistant",
      content: "The harbor can wait.",
      userId: null,
    }));
    expect(mockGenerateChatCompletionWithMeta).toHaveBeenCalledTimes(1);
    expect(mockGenerateChatCompletionWithMeta.mock.calls[0][1]).toEqual({
      temperature: 0.85,
      maxTokens: null,
    });
    const [llmMessages] = mockGenerateChatCompletionWithMeta.mock.calls[0];
    expect(llmMessages.at(-1)).toEqual({ role: "user", content: "what is the harbor plan" });
    expect(llmMessages.some((message) => message.content === "Earlier note.")).toBe(true);

    expect(mockGenerateSpeechAudio).toHaveBeenCalledTimes(1);
    const speechArgs = mockGenerateSpeechAudio.mock.calls[0][0];
    expect(speechArgs.text).toBe("The harbor can wait.");
    expect(speechArgs.voiceProfile.engine).toBe("cartesia");
    expect(speechArgs.voiceProfile.cartesiaVoiceId).toBe("voice-from-persona");
    expect(speechArgs.userId).toBeNull();
    expect(speechArgs.personality.moodState).toEqual({ valence: 0.4, arousal: 0.2, dominance: 0.1 });

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
    expect(mockRunUserContextTurn).not.toHaveBeenCalled();
    expect(mockCreateChatMessage).not.toHaveBeenCalled();
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

  it("exposes a separate authenticated browser voice adapter with owner-bound audio", async () => {
    const voiceTurn = chatRoutes.stack.find((layer) => layer.route?.path === "/voice-turn");
    const voiceAudio = chatRoutes.stack.find((layer) => layer.route?.path === "/voice-audio/:id");
    expect(voiceTurn.route.stack[0].handle.name).toBe("requireAuth");
    expect(voiceAudio.route.stack[0].handle.name).toBe("requireAuth");

    const res = mockRes();
    await authenticatedVoiceTurnHandler({
      voxisUser: { id: 7 },
      body: { personalityId: 7, transcript: "hello" },
    }, res, vi.fn());

    expect(res.body.audioUrl).toMatch(/^\/voice-audio\/[a-f0-9]{32}$/);
    expect(mockGenerateSpeechAudio.mock.calls.at(-1)[0].userId).toBe(7);
    expect(mockRunUserContextTurn).toHaveBeenCalledWith(expect.objectContaining({
      userId: 7,
      personalityId: 7,
      message: "hello",
      sessionKey: "7:7",
    }));
    expect(mockGenerateChatCompletionWithMeta.mock.calls.at(-1)[1].maxTokens).toBe(120);
    expect(mockCreateChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      personalityId: 7,
      role: "user",
      content: "hello",
      userId: 7,
    }));
    expect(res.body).not.toHaveProperty("userContext");
    const id = res.body.audioUrl.split("/").pop();
    const ownerAudioRes = mockRes();
    authenticatedVoiceAudioHandler({ voxisUser: { id: 7 }, params: { id } }, ownerAudioRes);
    expect(ownerAudioRes.statusCode).toBe(200);

    const otherAudioRes = mockRes();
    mockGetAuthenticatedActor.mockReturnValueOnce({ localUserId: 8, clerkUserId: "user_8" });
    authenticatedVoiceAudioHandler({ voxisUser: { id: 8 }, params: { id } }, otherAudioRes);
    expect(otherAudioRes.statusCode).toBe(404);
  });
});
