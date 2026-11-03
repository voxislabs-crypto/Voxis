import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPersonalityById = vi.fn();
const mockGenerateSpeechAudio = vi.fn();
const mockIsTtsConfigured = vi.fn();
const mockSanitizeVoiceProfile = vi.fn();

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityById: mockGetPersonalityById,
}));

vi.mock("../services/ttsService.js", () => ({
  generateSpeechAudio: mockGenerateSpeechAudio,
  isTtsConfigured: mockIsTtsConfigured,
}));

vi.mock("../services/voiceProfileSanitizer.js", () => ({
  sanitizeVoiceProfile: mockSanitizeVoiceProfile,
}));

function createStreamingResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    writableEnded: false,
  };
}

function parseNdjsonWrites(res) {
  return res.write.mock.calls
    .map(([chunk]) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk));
}

describe("performanceController", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetPersonalityById.mockReset();
    mockGenerateSpeechAudio.mockReset();
    mockIsTtsConfigured.mockReset();
    mockSanitizeVoiceProfile.mockReset();

    mockGetPersonalityById.mockReturnValue({
      id: 42,
      name: "P.Rick",
      voiceProfile: { engine: "cartesia", providerVoice: "voice-1", cartesiaModel: "sonic-2" },
    });
    mockIsTtsConfigured.mockReturnValue(true);
    mockSanitizeVoiceProfile.mockImplementation((input, fallback) => ({
      ...(fallback || {}),
      ...(input || {}),
    }));
    mockGenerateSpeechAudio.mockImplementation(async ({ text, speechHint }) => ({
      buffer: Buffer.from(`audio:${text}`),
      contentType: "audio/mpeg",
      engine: "cartesia",
      sfx: text.includes("Wuzzup") ? ["burp"] : [],
      speechHint,
    }));
  });

  it("streams merged mirrored EPF segments with audio-direction speech hints", async () => {
    const mirroredEpf = [
      "[[A0]]",
      "[[B1]]",
      "[20.0:] Oh jeez, 'Wuzzup!'? Is this a time warp?",
      "[:] Wow, groundbreaking... you're really pushing the envelope of human greeting.",
      "[[C2]]",
      "[50.0:] Wuzzup! Really? That's your plan?",
      "[:] (Wuzzup!)",
      "bpm: 120.0",
      "duration_secs: 150.0",
      "[[A0]]",
      "[0.0:] An erratic and hyper-intelligent Experimental Hip-Hop intro defined by its sudden shifts in texture.",
      "[[B1]]",
      "[20.0:] A high-octane Hyperpop-influenced verse defined by its rapid-fire vocal delivery.",
      "[[C2]]",
      "[50.0:] A massive, anthemic Wonky Rap chorus defined by its heavy low-end and infectious, leaning rhythm.",
    ].join("\n");

    const { performanceHandler } = await import("../controllers/performanceController.js");

    const req = {
      voxisUser: { id: 7 },
      params: { id: "42" },
      body: {
        text: mirroredEpf,
        voiceProfile: { engine: "cartesia", providerVoice: "voice-1", cartesiaModel: "sonic-2" },
      },
    };
    const res = createStreamingResponse();
    const next = vi.fn();

    await performanceHandler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/x-ndjson; charset=utf-8");

    const events = parseNdjsonWrites(res);
    expect(events[0]).toMatchObject({
      type: "script",
      script: {
        totalDuration: 150,
        segments: [
          expect.objectContaining({ id: "A0", audioDirection: expect.stringContaining("Experimental Hip-Hop intro") }),
          expect.objectContaining({ id: "B1", audioDirection: expect.stringContaining("Hyperpop-influenced verse") }),
          expect.objectContaining({ id: "C2", audioDirection: expect.stringContaining("Wonky Rap chorus") }),
        ],
      },
    });

    const segmentEvents = events.filter((event) => event.type === "segment");
    expect(segmentEvents).toEqual([
      expect.objectContaining({ segmentId: "B1", startTime: 20, totalLines: 2, moodLoop: "hype" }),
      expect.objectContaining({ segmentId: "C2", startTime: 50, totalLines: 1, moodLoop: "chorus" }),
    ]);

    const sfxEvents = events.filter((event) => event.type === "sfx");
    expect(sfxEvents).toHaveLength(2);
    expect(sfxEvents.every((event) => event.sound === "burp")).toBe(true);

    const audioEvents = events.filter((event) => event.type === "audio");
    expect(audioEvents).toHaveLength(3);
    expect(audioEvents.map((event) => event.segmentId)).toEqual(["B1", "B1", "C2"]);

    expect(mockGenerateSpeechAudio).toHaveBeenCalledTimes(3);
    expect(mockGenerateSpeechAudio.mock.calls[0][0]).toMatchObject({
      text: "Oh jeez, 'Wuzzup!'? Is this a time warp?",
      speechHint: expect.stringContaining("Hyperpop-influenced verse"),
    });
    expect(mockGenerateSpeechAudio.mock.calls[2][0]).toMatchObject({
      text: "Wuzzup! Really? That's your plan?",
      speechHint: expect.stringContaining("Wonky Rap chorus"),
    });

    expect(events.at(-1)).toEqual({ type: "done", totalSegments: 2, totalLines: 3 });
  });
});
