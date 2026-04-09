import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ttsService Piper voice discovery", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "voxis-piper-voices-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists local Piper voices and speaker metadata from discovered models", async () => {
    const modelPath = path.join(tempDir, "en_US-lessac-medium.onnx");
    await writeFile(modelPath, "fake-model");
    await writeFile(
      `${modelPath}.json`,
      JSON.stringify({
        speaker_id_map: {
          default: 0,
          bright: 1,
        },
      }),
    );

    const { listPiperVoiceOptions } = await import("../services/ttsService.js");
    const result = await listPiperVoiceOptions({ searchDirs: [tempDir] });

    expect(result.voices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "en_US-lessac-medium",
          path: modelPath,
          speakerCount: 2,
          speakers: [
            { id: 0, label: "default" },
            { id: 1, label: "bright" },
          ],
        }),
      ]),
    );
  });

  it("prepares directed text and mood-adjusted voice settings for synthesis", async () => {
    const { prepareSpeechSynthesis } = await import("../services/ttsService.js");

    const result = prepareSpeechSynthesis({
      personality: {
        traits: ["sarcastic", "commanding", "chaotic"],
        behaviorRules: ["Use obvious callouts for emphasis"],
        notablePhrases: [],
        moodState: { arousal: 0.8, dominance: 0.7 },
        expressionStyle: { energy: "high", sentenceStyle: "sharp", rules: ["dry wit"] },
      },
      text: "Yeah, genius, that is exactly what I said.",
      voiceProfile: { rate: 1, pitch: 1 },
      speechHint: "rapid and sharp delivery",
    });

    expect(result.directedText).toContain("GENIUS");
    expect(result.directedText.endsWith("!")).toBe(true);
    expect(result.adjustedVoiceProfile.rate).toBeGreaterThan(1);
    expect(result.adjustedVoiceProfile.pitch).toBeLessThan(1);
    expect(result.prosodyEnvelope).toEqual(
      expect.objectContaining({
        phrasing: expect.any(String),
        intensity: expect.any(Number),
        confidence: expect.any(Number),
      }),
    );
  });

  it("classifies technical turns as precision contexts for TTS stylization", async () => {
    const { prepareSpeechSynthesis } = await import("../services/ttsService.js");

    const result = prepareSpeechSynthesis({
      personality: {
        traits: ["sarcastic", "commanding"],
        moodState: { arousal: 0.8, dominance: 0.7 },
        expressionStyle: { energy: "very_high", sentenceStyle: "sharp", rules: ["dry wit"] },
      },
      text: "Maybe set PORT=3101 and keep the JSON payload unchanged.",
      voiceProfile: { rate: 1, pitch: 1 },
      speechHint: "deployment instructions",
    });

    expect(result.speechContext).toEqual(
      expect.objectContaining({
        category: "precision",
        styleMode: "precision",
      }),
    );
    expect(result.directedText).toBe("Maybe set PORT=3101 and keep the JSON payload unchanged.");
    expect(result.prosodyEnvelope.emphasis.count).toBe(0);
  });

  it("builds identity-preserving fallback voices for Kokoro and cloud", async () => {
    const { buildFallbackVoiceProfile, getEngineCapabilities } = await import("../services/ttsService.js");

    const personality = { speechStyle: "measured and clear" };
    const baseProfile = {
      preferredVoice: "deep mentor",
      selectedVoiceLabel: "baritone",
      selectedVoiceSample: { voiceLabel: "baritone", voiceBand: "low", voiceQuality: "clear" },
    };

    const kokoroProfile = buildFallbackVoiceProfile("kokoro", baseProfile, personality);
    const cloudProfile = buildFallbackVoiceProfile("cloud", baseProfile, personality);

    expect(kokoroProfile.kokoroVoice).toBe("am_onyx");
    expect(cloudProfile.providerVoice).toBe("onyx");
    expect(getEngineCapabilities("piper")).toEqual(
      expect.objectContaining({
        textShaping: true,
        nativeControls: expect.arrayContaining(["lengthScale"]),
      }),
    );
  });
});
