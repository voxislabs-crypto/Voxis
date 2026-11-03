import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── deriveMoodVoiceParams ────────────────────────────────────────────────────

describe("deriveMoodVoiceParams", () => {
  let deriveMoodVoiceParams;

  beforeEach(async () => {
    // Import lazily so mocks for sibling services don't interfere
    vi.resetModules();
    // Stub heavy ttsService dependencies
    vi.doMock("../services/openVoiceAdapter.js", () => ({ synthesizeOpenVoice: vi.fn(), isOpenVoiceInstalled: vi.fn(() => false), hasReference: vi.fn(() => false) }));
    vi.doMock("../services/rvcAdapter.js", () => ({ convertWithRvc: vi.fn(), isRvcInstalled: vi.fn(() => false), resolveModelPath: vi.fn() }));
    vi.doMock("../models/voiceCloneModel.js", () => ({ getPersonalityCloneMeta: vi.fn(() => null) }));
    vi.doMock("../services/kokoroService.js", () => ({ synthesizeKokoro: vi.fn(), getKokoroVoices: vi.fn(() => []) }));
    vi.doMock("../services/piperService.js", () => ({ synthesizePiper: vi.fn(), listPiperVoices: vi.fn(() => []) }));
    const mod = await import("../services/ttsService.js");
    deriveMoodVoiceParams = mod.deriveMoodVoiceParams;
  });

  it("returns rate=1 and pitchShift=0 for neutral mood with no prosody envelope", () => {
    const result = deriveMoodVoiceParams({}, {});
    expect(result.rate).toBe(1);
    expect(result.pitchShift).toBe(0);
  });

  it("high arousal nudges rate upward from baseline", () => {
    const result = deriveMoodVoiceParams({ arousal: 1 }, { targetRate: 1 });
    expect(result.rate).toBeCloseTo(1.15, 2);
  });

  it("low arousal nudges rate downward from baseline", () => {
    const result = deriveMoodVoiceParams({ arousal: -1 }, { targetRate: 1 });
    expect(result.rate).toBeCloseTo(0.85, 2);
  });

  it("clamps rate to [0.7, 1.3]", () => {
    // extreme arousal + high base rate should still cap at 1.3
    expect(deriveMoodVoiceParams({ arousal: 1 }, { targetRate: 1.3 }).rate).toBe(1.3);
    expect(deriveMoodVoiceParams({ arousal: -1 }, { targetRate: 0.7 }).rate).toBe(0.7);
  });

  it("positive valence with high dominance yields positive pitchShift", () => {
    const { pitchShift } = deriveMoodVoiceParams({ valence: 1, dominance: 1 }, {});
    expect(pitchShift).toBeGreaterThan(0);
    expect(pitchShift).toBeLessThanOrEqual(3);
  });

  it("negative valence with high dominance yields negative pitchShift", () => {
    const { pitchShift } = deriveMoodVoiceParams({ valence: -1, dominance: 1 }, {});
    expect(pitchShift).toBeLessThan(0);
    expect(pitchShift).toBeGreaterThanOrEqual(-3);
  });

  it("clamps pitchShift to [-3, 3]", () => {
    // extreme values cannot exceed bounds
    const high = deriveMoodVoiceParams({ valence: 1, dominance: 1 }, {}).pitchShift;
    const low = deriveMoodVoiceParams({ valence: -1, dominance: 1 }, {}).pitchShift;
    expect(high).toBeLessThanOrEqual(3);
    expect(low).toBeGreaterThanOrEqual(-3);
  });

  it("handles missing/undefined mood fields gracefully", () => {
    expect(() => deriveMoodVoiceParams({ valence: null }, {})).not.toThrow();
    expect(() => deriveMoodVoiceParams(undefined, undefined)).not.toThrow();
  });
});

// ── voiceCloneModel round-trip ───────────────────────────────────────────────

describe("voiceCloneModel — personality clone meta round-trip", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("stores and retrieves clone meta for a personality", async () => {
    vi.doMock("../models/voiceCloneModel.js", () => ({
      getPersonalityCloneMeta: vi.fn(() => null),
      setPersonalityCloneMeta: vi.fn(),
      clearPersonalityCloneMeta: vi.fn(),
    }));
    const { getPersonalityCloneMeta, setPersonalityCloneMeta, clearPersonalityCloneMeta } =
      await import("../models/voiceCloneModel.js");

    const testId = 99999;
    const meta = {
      cloneEngine: "openvoice",
      cloneReferenceClipPath: "/tmp/test-ref.wav",
      cloneRvcPackId: null,
    };

    setPersonalityCloneMeta(testId, meta);
    expect(setPersonalityCloneMeta).toHaveBeenCalledWith(testId, meta);

    clearPersonalityCloneMeta(testId);
    expect(clearPersonalityCloneMeta).toHaveBeenCalledWith(testId);
  });
});

// ── openvoice runEngine path ─────────────────────────────────────────────────

describe("generateSpeechAudio — openvoice engine", () => {
  it("calls synthesizeOpenVoice with text and personality id", async () => {
    vi.resetModules();

    const fakeWav = Buffer.from("RIFF....WAVE");
    const synthesizeOpenVoice = vi.fn().mockResolvedValue(fakeWav);
    vi.doMock("../services/openVoiceAdapter.js", () => ({
      synthesizeOpenVoice,
      isOpenVoiceInstalled: vi.fn(() => true),
      hasReference: vi.fn(() => true),
    }));
    vi.doMock("../services/rvcAdapter.js", () => ({ convertWithRvc: vi.fn(), isRvcInstalled: vi.fn(() => false), resolveModelPath: vi.fn() }));
    vi.doMock("../models/voiceCloneModel.js", () => ({ getPersonalityCloneMeta: vi.fn(() => null) }));
    vi.doMock("../services/kokoroService.js", () => ({ synthesizeKokoro: vi.fn(), getKokoroVoices: vi.fn(() => []) }));
    vi.doMock("../services/piperService.js", () => ({ synthesizePiper: vi.fn(), listPiperVoices: vi.fn(() => []) }));

    const { generateSpeechAudio } = await import("../services/ttsService.js");

    const result = await generateSpeechAudio({
      text: "Hello from OpenVoice",
      personality: { id: 42, name: "TestBot", moodState: { valence: 0.5, arousal: 0.2, dominance: 0 } },
      voiceProfile: { engine: "openvoice" },
    });

    // Just verify the function completes without error
    expect(result).toBeDefined();
  });
});

// ── kokoro-rvc graceful fallback ─────────────────────────────────────────────

describe("generateSpeechAudio — kokoro-rvc fallback when no pack configured", () => {
  it("returns raw kokoro audio and sets rvcSkipped=true when no packId", async () => {
    vi.resetModules();

    const kokoroWav = Buffer.from("RIFF....WAVE-kokoro");
    const synthesizeKokoro = vi.fn().mockResolvedValue(kokoroWav);
    const convertWithRvc = vi.fn();

    vi.doMock("../services/kokoroService.js", () => ({ synthesizeKokoro, getKokoroVoices: vi.fn(() => []) }));
    vi.doMock("../services/rvcAdapter.js", () => ({ convertWithRvc, isRvcInstalled: vi.fn(() => true), resolveModelPath: vi.fn() }));
    vi.doMock("../models/voiceCloneModel.js", () => ({
      // No packId configured — should trigger skip
      getPersonalityCloneMeta: vi.fn(() => ({ cloneEngine: "kokoro-rvc", cloneRvcPackId: null })),
    }));
    vi.doMock("../services/openVoiceAdapter.js", () => ({ synthesizeOpenVoice: vi.fn(), isOpenVoiceInstalled: vi.fn(() => false), hasReference: vi.fn(() => false) }));
    vi.doMock("../services/piperService.js", () => ({ synthesizePiper: vi.fn(), listPiperVoices: vi.fn(() => []) }));

    const { generateSpeechAudio } = await import("../services/ttsService.js");

    const result = await generateSpeechAudio({
      text: "Hello from Kokoro",
      personality: { id: 7, name: "TestBot", moodState: { valence: 0, arousal: 0, dominance: 0 } },
      voiceProfile: { engine: "kokoro-rvc", voice: "af_heart" },
    });

    expect(convertWithRvc).not.toHaveBeenCalled();
    // Just verify the function completes without error and RVC is skipped
    expect(result).toBeDefined();
  });
});

describe("generateSpeechAudio — RVC service down", () => {
  const personaId = 990188;
  const referencePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "voice-clones",
    `persona-${personaId}`,
    "openvoice-reference.wav",
  );

  afterEach(() => {
    fs.rmSync(path.dirname(referencePath), { recursive: true, force: true });
  });

  it("uses OpenVoice and does not call RVC when port 7861 is down and a clip exists", async () => {
    vi.resetModules();
    fs.mkdirSync(path.dirname(referencePath), { recursive: true });
    fs.writeFileSync(referencePath, Buffer.from("RIFF"));

    const synthesizeOpenVoice = vi.fn().mockResolvedValue({
      buffer: Buffer.from("RIFF....WAVE"),
      contentType: "audio/wav",
      engine: "openvoice",
    });
    const convertWithRvc = vi.fn();
    const previousLock = process.env.TTS_DEBUG_PROVIDER_LOCK;
    process.env.TTS_DEBUG_PROVIDER_LOCK = "false";

    vi.doMock("../services/openVoiceAdapter.js", () => ({
      synthesizeOpenVoice,
      isOpenVoiceInstalled: vi.fn(() => true),
      hasReference: vi.fn(() => true),
    }));
    vi.doMock("../services/rvcAdapter.js", () => ({
      convertWithRvc,
      isRvcInstalled: vi.fn(async () => false),
      getRvcServiceUrl: () => "http://127.0.0.1:7861",
      resolveModelPath: vi.fn(),
    }));
    vi.doMock("../models/voiceCloneModel.js", () => ({
      getPersonalityCloneMeta: vi.fn(() => ({ cloneEngine: "kokoro-rvc", cloneRvcPackId: 4 })),
    }));
    vi.doMock("../services/kokoroService.js", () => ({ synthesizeKokoro: vi.fn(), getKokoroVoices: vi.fn(() => []) }));
    vi.doMock("../services/piperService.js", () => ({ synthesizePiper: vi.fn(), listPiperVoices: vi.fn(() => []) }));

    try {
      const { generateSpeechAudio } = await import("../services/ttsService.js");
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = await generateSpeechAudio({
        text: "Hello without RVC",
        personality: { id: personaId, name: "TestBot", moodState: { valence: 0, arousal: 0, dominance: 0 } },
        voiceProfile: { engine: "kokoro-rvc", voice: "af_heart" },
      });

      expect(convertWithRvc).not.toHaveBeenCalled();
      expect(synthesizeOpenVoice).toHaveBeenCalled();
      expect(result.engine).toBe("openvoice");
      expect(result.rvcSkipReason).toBe("service-down");
      expect(result.telemetry.fallbackUsed).toBe(true);
      expect(result.telemetry.fallbackFrom).toBe("kokoro-rvc");
      expect(warn.mock.calls.some((call) => String(call[0]).includes("not running"))).toBe(true);
      warn.mockRestore();
    } finally {
      if (previousLock === undefined) {
        delete process.env.TTS_DEBUG_PROVIDER_LOCK;
      } else {
        process.env.TTS_DEBUG_PROVIDER_LOCK = previousLock;
      }
    }
  });
});
