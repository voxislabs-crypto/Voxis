import { describe, expect, it } from "vitest";

import {
  MICRO_VARIATION,
  appendMicroVariationNote,
  sampleMicroVariation,
} from "../services/expressionSampler.js";

const PERSONALITY = {
  name: "Ara",
  speechStyle: "dry and precise",
  behaviorRules: ["Never break character", "Keep sentences honest"],
  notablePhrases: ["your call"],
};

function signedIn(overrides = {}) {
  return sampleMicroVariation({
    sessionKind: "signed-in",
    turnIndex: 0,
    personality: PERSONALITY,
    ...overrides,
  });
}

describe("micro-variation sampler", () => {
  it("gives high arousal shorter, tighter cues than a calm mood", () => {
    const high = signedIn({ mood: { valence: 0, arousal: 0.9, dominance: 0 } });
    const calm = signedIn({ mood: { valence: 0, arousal: -0.8, dominance: 0 } });

    expect(high.applied).toBe(true);
    expect(high.note).toMatch(/shorter/i);
    expect(high.note).toMatch(/interruption|tighter/i);
    expect(calm.note).toMatch(/longer|measured/i);
    expect(calm.note).not.toMatch(/shorter/i);
    expect(high.note).not.toMatch(/measured/i);
    expect(high.cues[0].axis).toBe("arousal-high");
    expect(calm.cues[0].axis).toBe("arousal-low");
  });

  it("rotates the cue for the same mood so the wording is not identical every turn", () => {
    const first = signedIn({
      mood: { valence: 0, arousal: 0.9, dominance: 0 },
      turnIndex: 0,
    });
    const second = signedIn({
      mood: { valence: 0, arousal: 0.9, dominance: 0 },
      turnIndex: 1,
    });

    expect(first.note).not.toBe(second.note);
    expect(first.note).toMatch(/shorter/i);
    expect(second.note).toMatch(/shorter/i);
  });

  it("adds a hedge or sharpness cue only when the residual flag is on", () => {
    const mood = { valence: -0.4, arousal: 0.8, dominance: 0.1 };
    const withResidual = signedIn({ mood, residualActive: true });
    const withoutResidual = signedIn({ mood, residualActive: false });

    expect(withResidual.note).toMatch(/hedge|sharper/i);
    expect(withResidual.cues.some((cue) => cue.axis === "residual")).toBe(true);
    expect(withoutResidual.note).not.toMatch(/hedge|sharper/i);
    expect(withoutResidual.cues.some((cue) => cue.axis === "residual")).toBe(false);
  });

  it("keeps identity and behavior rules in the prompt and does not rewrite them", () => {
    const personality = {
      ...PERSONALITY,
      behaviorRules: [...PERSONALITY.behaviorRules],
      notablePhrases: [...PERSONALITY.notablePhrases],
    };
    const variation = sampleMicroVariation({
      sessionKind: "signed-in",
      mood: { valence: -0.5, arousal: 1, dominance: 1 },
      residualActive: true,
      turnIndex: 2,
      personality,
    });
    const original = [{
      role: "system",
      content: [
        "IDENTITY: Ara.",
        "SPEECH STYLE: dry and precise.",
        "BEHAVIOR: Never break character. Keep sentences honest.",
        "PHRASE: your call.",
      ].join(" "),
    }];
    const composed = appendMicroVariationNote(original, variation);

    expect(personality.speechStyle).toBe("dry and precise");
    expect(personality.behaviorRules).toEqual(["Never break character", "Keep sentences honest"]);
    expect(personality.notablePhrases).toEqual(["your call"]);
    expect(composed.messages[0].content).toContain("IDENTITY: Ara.");
    expect(composed.messages[0].content).toContain("dry and precise");
    expect(composed.messages[0].content).toContain("Never break character");
    expect(composed.messages[0].content).toContain("your call");
    expect(composed.messages[1].content).toMatch(/do not override identity, speech style, behavior rules, or notable phrases/i);
    expect(composed.messages[1].content).not.toContain("Never break character");
    expect(composed.messages[1].content).not.toContain("your call");
    expect(variation.cues.length).toBeLessThanOrEqual(MICRO_VARIATION.maxCues);
    expect(variation.strength).toBeLessThanOrEqual(MICRO_VARIATION.strengthCap);
    expect(variation.cues.map((cue) => cue.axis)).toEqual(["residual", "arousal-high"]);
  });

  it("leaves anonymous and guide sessions unchanged", () => {
    const messages = [{ role: "system", content: "IDENTITY: Ara. BEHAVIOR: Never break character." }];
    const mood = { valence: -1, arousal: 1, dominance: 1 };

    for (const sessionKind of ["anonymous", "guide"]) {
      const variation = sampleMicroVariation({
        sessionKind,
        mood,
        residualActive: true,
        turnIndex: 3,
        personality: PERSONALITY,
      });
      const composed = appendMicroVariationNote(messages, variation);

      expect(variation.applied).toBe(false);
      expect(variation.note).toBeNull();
      expect(variation.cues).toEqual([]);
      expect(composed.applied).toBe(false);
      expect(composed.messages).toEqual(messages);
    }
  });
});
