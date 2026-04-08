import { describe, expect, it } from "vitest";

import { applyMoodToVoice } from "../services/moodVoice.js";

describe("moodVoice applyMoodToVoice", () => {
  it("increases rate at high arousal", () => {
    const profile = applyMoodToVoice({ rate: 1, pitch: 1 }, { arousal: 0.8, dominance: 0 });
    expect(profile.rate).toBeGreaterThan(1);
  });

  it("decreases rate at low arousal", () => {
    const profile = applyMoodToVoice({ rate: 1, pitch: 1 }, { arousal: -0.6, dominance: 0 });
    expect(profile.rate).toBeLessThan(1);
  });

  it("reduces pitch at high dominance", () => {
    const profile = applyMoodToVoice({ rate: 1, pitch: 1 }, { arousal: 0, dominance: 0.8 });
    expect(profile.pitch).toBeLessThan(1);
  });
});