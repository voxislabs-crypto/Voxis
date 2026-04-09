import { describe, expect, it } from "vitest";

import { compileProsodyEnvelope, applyProsodyToKokoroText } from "../services/prosodyCompiler.js";

describe("prosodyCompiler", () => {
  it("compiles a bounded prosody envelope from mood and template", () => {
    const envelope = compileProsodyEnvelope({
      personality: {
        prosodyTemplate: {
          cadence: { label: "rapid", avgPauseSeconds: 0.19 },
          rhythm: { label: "dense", speechDensity: 0.82 },
        },
      },
      mood: { arousal: 0.7, dominance: 0.5 },
      voiceProfile: { rate: 1, stability: 0.5, style: 0.5 },
      directedText: "This is a test line.",
      speechHint: "high-energy line",
    });

    expect(envelope.targetRate).toBeGreaterThan(1);
    expect(envelope.provider.elevenlabs.style).toBeGreaterThan(0.5);
    expect(envelope.provider.elevenlabs.stability).toBeLessThan(0.6);
    expect(envelope.confidence).toBeGreaterThan(0.4);
  });

  it("applies measured kokoro phrasing cues without empty output", () => {
    const result = applyProsodyToKokoroText("I understand. We proceed carefully.", {
      phrasing: "measured",
      provider: { kokoro: { pauseSeconds: 0.5 } },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.includes("..." )).toBe(true);
  });
});
