import { describe, expect, it } from "vitest";

import {
  SHIFT_DICTIONARY,
  applySpokenShifts,
  describeShiftChanges,
  pickCoreValues,
  previewSpokenShifts,
  resolveShiftRequest,
  SpokenShiftError,
} from "../services/spokenShift.js";

const persona = {
  name: "Joker",
  traits: ["dry"],
  quirks: ["laughs late"],
  gender: "male",
  avatarImageUrl: "/avatars/joker.png",
  singingProfile: { archetype: "tenor" },
  emotionDrift: { warmth: 0.2 },
  llmConfig: { model: "local" },
  systemPrompt: "Stay handwritten.",
  bigFiveProfile: {
    openness: 0.5,
    conscientiousness: 0.5,
    extraversion: 0.5,
    agreeableness: 0.6,
    neuroticism: 0.5,
  },
  expressionStyle: {
    energy: "medium",
    sentenceStyle: "fragments",
    cadenceRegulator: { mode: "adaptive", teasingFrequency: 0.2 },
  },
  moodBaseline: { valence: 0.2, arousal: -0.3, dominance: 0 },
};

describe("spoken shift dictionary", () => {
  it("maps darker, funnier, and seductive to field, direction, and delta", () => {
    expect(SHIFT_DICTIONARY.darker).toEqual([
      { field: "bigFiveProfile.agreeableness", direction: "down", delta: 2 },
      { field: "bigFiveProfile.neuroticism", direction: "up", delta: 1 },
    ]);
    expect(SHIFT_DICTIONARY.funnier).toEqual([
      { field: "expressionStyle.energy", direction: "up", delta: 2 },
      { field: "expressionStyle.quirkDensity", direction: "up", delta: 2 },
    ]);
    expect(SHIFT_DICTIONARY.seductive).toEqual([
      { field: "moodBaseline.dominance", direction: "up", delta: 2 },
      { field: "bigFiveProfile.extraversion", direction: "up", delta: 1 },
    ]);
  });

  it("speaks darker at moderate as sixty to fifty-two", () => {
    const result = applySpokenShifts(persona, ["darker"], "moderate");

    expect(result.personality.bigFiveProfile.agreeableness).toBe(0.52);
    expect(result.personality.bigFiveProfile.neuroticism).toBe(0.54);
    expect(result.sentence).toContain("lowering agreeableness from sixty to fifty-two");
    expect(result.sentence).toContain("raising neuroticism from fifty to fifty-four");
  });

  it("moves funnier energy by the dictionary delta and keeps the enum on the same band", () => {
    const result = applySpokenShifts(persona, ["funnier"], "moderate");
    const energy = result.changes.find((change) => change.field === "expressionStyle.energy");
    const quirks = result.changes.find((change) => change.field === "expressionStyle.quirkDensity");

    expect(energy).toMatchObject({ beforeDisplay: 50, afterDisplay: 58, direction: "up" });
    expect(quirks).toMatchObject({ beforeDisplay: 50, afterDisplay: 58, direction: "up" });
    expect(result.personality.expressionStyle.energy).toBe("medium");
    expect(result.personality.expressionStyle.energyScore).toBe(0.58);
    expect(result.personality.expressionStyle.quirkDensity).toBe(0.58);
    expect(result.sentence).toContain("raising energy from fifty to fifty-eight");
  });

  it("raises seductive dominance and extraversion on the spoken scale", () => {
    const result = applySpokenShifts(persona, ["seductive"], "moderate");

    expect(result.personality.moodBaseline.dominance).toBe(0.16);
    expect(result.personality.bigFiveProfile.extraversion).toBe(0.54);
    expect(result.personality.moodBaseline.valence).toBe(0.2);
    expect(result.sentence).toContain("raising dominance from fifty to fifty-eight");
  });

  it("scales slight and strong from the same dictionary row", () => {
    const slight = applySpokenShifts(persona, ["darker"], "slight");
    const strong = applySpokenShifts(persona, ["darker"], "strong");

    expect(slight.personality.bigFiveProfile.agreeableness).toBe(0.56);
    expect(strong.personality.bigFiveProfile.agreeableness).toBe(0.44);
  });

  it("clamps a strong drop at zero", () => {
    const low = {
      ...persona,
      bigFiveProfile: { ...persona.bigFiveProfile, agreeableness: 0.05 },
    };
    const result = applySpokenShifts(low, ["darker"], "strong");

    expect(result.personality.bigFiveProfile.agreeableness).toBe(0);
    expect(result.sentence).toContain("lowering agreeableness from five to zero");
  });

  it("turns add more sarcasm into a measurable shift and does not store the prose", () => {
    const result = applySpokenShifts(persona, ["add more sarcasm"], "slight");

    expect(result.keys).toEqual(["sarcastic"]);
    expect(result.personality.traits).toEqual(["dry"]);
    expect(JSON.stringify(result.personality.traits)).not.toContain("sarcasm");
    expect(result.personality.bigFiveProfile.agreeableness).toBe(0.56);
    expect(result.personality.moodBaseline.dominance).toBe(0.04);
  });

  it("rejects prose that is not a dictionary key without changing the persona", () => {
    expect(() => applySpokenShifts(persona, ["wear a red hat"], "moderate")).toThrow(SpokenShiftError);
    expect(() => applySpokenShifts(persona, ["wear a red hat"], "moderate")).toThrow(/Nothing was saved/);
    expect(persona.traits).toEqual(["dry"]);
    expect(persona.bigFiveProfile.agreeableness).toBe(0.6);
  });

  it("rejects a row whose delta is not the dictionary delta", () => {
    expect(() => resolveShiftRequest([
      { field: "bigFiveProfile.agreeableness", direction: "down", delta: 9 },
    ])).toThrow(/exact dictionary row/);
  });

  it("accepts an exact dictionary row", () => {
    const resolved = resolveShiftRequest([
      { field: "expressionStyle.energy", direction: "up", delta: 2 },
    ]);
    expect(resolved.keys).toEqual(["funnier"]);
  });

  it("builds the sample confirmation sentence from spoken before and after values", () => {
    const sentence = describeShiftChanges([
      { label: "agreeableness", direction: "down", beforeDisplay: 60, afterDisplay: 52 },
      { label: "energy", direction: "up", beforeDisplay: 50, afterDisplay: 65 },
    ]);
    expect(sentence).toBe(
      "I'm lowering agreeableness from sixty to fifty-two and raising energy from fifty to sixty-five.",
    );
  });

  it("previews every magnitude and does not mutate the persona", () => {
    const preview = previewSpokenShifts(persona, { changes: { traits: ["add more sarcasm"] } });

    expect(preview.keys).toEqual(["sarcastic"]);
    expect(preview.magnitudes.moderate.sentence).toContain("lowering agreeableness");
    expect(preview.magnitudes.slight.changes[0].delta).toBe(4);
    expect(persona.bigFiveProfile.agreeableness).toBe(0.6);
    expect(persona.systemPrompt).toBe("Stay handwritten.");
  });

  it("keeps avatar, singing, emotion drift, llm config, and cadence on the carried persona", () => {
    const result = applySpokenShifts(persona, ["funnier"], "slight");

    expect(result.personality.avatarImageUrl).toBe("/avatars/joker.png");
    expect(result.personality.gender).toBe("male");
    expect(result.personality.singingProfile).toEqual({ archetype: "tenor" });
    expect(result.personality.emotionDrift).toEqual({ warmth: 0.2 });
    expect(result.personality.llmConfig).toEqual({ model: "local" });
    expect(result.personality.systemPrompt).toBe("Stay handwritten.");
    expect(result.personality.expressionStyle.cadenceRegulator).toEqual({
      mode: "adaptive",
      teasingFrequency: 0.2,
    });
    expect(result.personality.expressionStyle.sentenceStyle).toBe("fragments");
  });

  it("reads create values from coreValues when values are missing", () => {
    expect(pickCoreValues({ coreValues: ["honesty", "nerve"] })).toEqual(["honesty", "nerve"]);
    expect(pickCoreValues({ values: ["kept"], coreValues: ["dropped"] })).toEqual(["kept"]);
    expect(pickCoreValues({ values: ["  "], coreValues: ["honesty"] })).toEqual(["honesty"]);
  });
});
