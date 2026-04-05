import { describe, expect, it } from "vitest";
import {
  HYBRID_MAPPING_TABLE,
  TEST_PERSONALITIES,
  mapToVoxisPersonality,
  recommendHybridTuning,
} from "../services/hybridPersonalityService.js";

describe("hybridPersonalityService", () => {
  it("exposes starter mapping rows", () => {
    expect(HYBRID_MAPPING_TABLE.length).toBeGreaterThanOrEqual(5);
  });

  it("returns stable tuning for Zoe-style profile", () => {
    const zoe = TEST_PERSONALITIES.find((item) => item.id === "zoe_test");
    const tuning = recommendHybridTuning({
      bigFiveProfile: zoe.bigFiveProfile,
      alignmentProfile: zoe.alignmentProfile,
    });

    expect(tuning.moodBaseline.valence).toBeGreaterThan(0);
    expect(tuning.moodBaseline.arousal).toBeGreaterThan(0);
    expect(tuning.moodSensitivity).toBeGreaterThan(1);
    expect(["default", "anti_hero", "morally_complex"]).toContain(tuning.creativeContext);
    expect(tuning.expressionStyle.rules.length).toBeGreaterThan(0);
  });

  it("returns antagonist-oriented tuning for villain profile", () => {
    const villain = TEST_PERSONALITIES.find((item) => item.id === "villain_silly");
    const tuning = recommendHybridTuning({
      bigFiveProfile: villain.bigFiveProfile,
      alignmentProfile: villain.alignmentProfile,
    });

    expect(tuning.moodBaseline.valence).toBeLessThanOrEqual(-0.4);
    expect(tuning.moodBaseline.dominance).toBeGreaterThan(0);
    expect(tuning.creativeContext).toMatch(/morally_complex|tragic_villain|narrative_antagonist/);
    expect(tuning.expressionStyle.sentenceStyle.length).toBeGreaterThan(0);
  });

  it("keeps canonical mapper and legacy helper in sync", () => {
    const zoe = TEST_PERSONALITIES.find((item) => item.id === "zoe_test");
    const fromCanonical = mapToVoxisPersonality({
      bigFiveProfile: zoe.bigFiveProfile,
      alignmentProfile: zoe.alignmentProfile,
    });
    const fromLegacy = recommendHybridTuning({
      bigFiveProfile: zoe.bigFiveProfile,
      alignmentProfile: zoe.alignmentProfile,
    });

    expect(fromCanonical).toEqual(fromLegacy);
  });

  it("creates clear contrast between Zoe and Villain archetypes", () => {
    const zoe = TEST_PERSONALITIES.find((item) => item.id === "zoe_test");
    const villain = TEST_PERSONALITIES.find((item) => item.id === "villain_silly");

    const zoeTuning = mapToVoxisPersonality({
      bigFiveProfile: zoe.bigFiveProfile,
      alignmentProfile: zoe.alignmentProfile,
    });
    const villainTuning = mapToVoxisPersonality({
      bigFiveProfile: villain.bigFiveProfile,
      alignmentProfile: villain.alignmentProfile,
    });

    expect(zoeTuning.moodBaseline.valence).toBeGreaterThan(villainTuning.moodBaseline.valence);
    expect(zoeTuning.moodSensitivity).toBeGreaterThan(1);
    expect(villainTuning.moodSensitivity).toBeGreaterThan(1);
    expect(zoeTuning.expressionStyle.rules).toContain("playful erratic energy");
    expect(villainTuning.expressionStyle.rules).toContain("takes pleasure in others' misfortune");
    expect(villainTuning.expressionStyle.sentenceStyle).toContain("controlled menace");
  });
});
