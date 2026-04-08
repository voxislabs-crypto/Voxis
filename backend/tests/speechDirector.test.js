import { describe, expect, it } from "vitest";

import { stylizeSpeech } from "../services/speechDirector.js";

describe("speechDirector stylizeSpeech", () => {
  it("keeps neutral text readable and unchanged for neutral profiles", () => {
    const result = stylizeSpeech("We should review the deployment plan.", {
      traits: ["analytical"],
      moodState: { arousal: 0, dominance: 0 },
      expressionStyle: { energy: "medium", sentenceStyle: "balanced", rules: [] },
    });

    expect(result).toBe("We should review the deployment plan.");
  });

  it("injects sarcastic pauses and emphasis for dominant sarcastic personas", () => {
    const result = stylizeSpeech("Yeah, genius, that is exactly what I said.", {
      traits: ["sarcastic", "commanding", "chaotic"],
      behaviorRules: ["Use obvious callouts for emphasis"],
      notablePhrases: ["genius"],
      moodState: { arousal: 0.4, dominance: 0.7 },
      expressionStyle: { energy: "high", sentenceStyle: "sharp", rules: ["dry wit"] },
    });

    expect(result).toBe("Yeah... GENIUS... that is EXACTLY what I said.");
  });

  it("converts punctuation to calmer pacing for low arousal profiles", () => {
    const result = stylizeSpeech("I hear you! We can take this slowly.", {
      traits: ["calm"],
      moodState: { arousal: -0.5, dominance: 0 },
      expressionStyle: { energy: "low", sentenceStyle: "measured", rules: [] },
    });

    expect(result).toBe("I hear you... We can take this slowly...");
  });

  it("adds bursty pacing and energetic endings for chaotic high arousal profiles", () => {
    const result = stylizeSpeech("Right, we move now, no delays.", {
      traits: ["chaotic"],
      moodState: { arousal: 0.8, dominance: 0.1 },
      expressionStyle: { energy: "very_high", sentenceStyle: "bursty", rules: [] },
    });

    expect(result).toBe("Right... we move now... no delays!");
  });
});