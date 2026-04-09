import { describe, expect, it } from "vitest";

import {
  compileProsodyEnvelope,
  applyProsodyToElevenLabsText,
  applyProsodyToKokoroText,
} from "../services/prosodyCompiler.js";

describe("prosodyCompiler", () => {
  it("compiles a bounded prosody envelope from mood and template", () => {
    const envelope = compileProsodyEnvelope({
      personality: {
        prosodyTemplate: {
          cadence: { label: "rapid", avgPauseSeconds: 0.19 },
          rhythm: { label: "dense", speechDensity: 0.82 },
        },
        notablePhrases: ["exactly right"],
        behaviorRules: ["Stress important conclusions clearly"],
      },
      mood: { arousal: 0.7, dominance: 0.5 },
      voiceProfile: { rate: 1, stability: 0.5, style: 0.5 },
      directedText: "This is exactly the important test line.",
      speechHint: "high-energy line",
    });

    expect(envelope.targetRate).toBeGreaterThan(1);
    expect(envelope.provider.elevenlabs.style).toBeGreaterThan(0.5);
    expect(envelope.provider.elevenlabs.stability).toBeLessThan(0.6);
    expect(envelope.confidence).toBeGreaterThan(0.4);
    expect(envelope.emphasis.count).toBeGreaterThan(0);
  });

  it("applies emphasis shaping to ElevenLabs text without empty output", () => {
    const result = applyProsodyToElevenLabsText("This is exactly the important test line.", {
      provider: { elevenlabs: { emphasisMode: "ellipses" } },
      emphasis: { words: [{ term: "important", strength: 0.8 }] },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("IMPORTANT");
  });

  it("applies measured kokoro phrasing cues without empty output", () => {
    const result = applyProsodyToKokoroText("I understand. We proceed carefully.", {
      phrasing: "measured",
      provider: { kokoro: { pauseSeconds: 0.5, emphasisMode: "commas" } },
      emphasis: { words: [{ term: "carefully", strength: 0.7 }] },
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.includes("..." )).toBe(true);
    expect(result).toContain("CAREFULLY");
  });
});
