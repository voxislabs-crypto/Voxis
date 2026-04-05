function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return clamp(n, 0, 1);
}

const ALIGNMENT_VAD_OFFSETS = {
  lawful_good: { valence: 0.35, arousal: -0.2, dominance: 0.4 },
  neutral_good: { valence: 0.3, arousal: 0.05, dominance: 0.15 },
  chaotic_good: { valence: 0.35, arousal: 0.35, dominance: 0.05 },
  lawful_neutral: { valence: 0.0, arousal: -0.2, dominance: 0.4 },
  true_neutral: { valence: 0.0, arousal: 0.0, dominance: 0.0 },
  chaotic_neutral: { valence: 0.05, arousal: 0.28, dominance: -0.05 },
  lawful_evil: { valence: -0.4, arousal: -0.1, dominance: 0.45 },
  neutral_evil: { valence: -0.45, arousal: 0.1, dominance: 0.25 },
  chaotic_evil: { valence: -0.55, arousal: 0.45, dominance: 0.2 },
};

const PRESET_ALIGNMENT_NAME = {
  lawful_good: "Lawful Good",
  neutral_good: "Neutral Good",
  chaotic_good: "Chaotic Good",
  lawful_neutral: "Lawful Neutral",
  true_neutral: "True Neutral",
  chaotic_neutral: "Chaotic Neutral",
  lawful_evil: "Lawful Evil",
  neutral_evil: "Neutral Evil",
  chaotic_evil: "Chaotic Evil",
};

export const HYBRID_MAPPING_TABLE = [
  {
    key: "open_extraverted_chaotic_good",
    alignment: "chaotic_good",
    bigFive: "high openness + high extraversion",
    vadBaseline: { valence: 0.6, arousal: 0.7, dominance: 0.5 },
    moodSensitivity: 1.75,
    creativeContext: "default",
    expressionRules: "short bursts, interruptions, exclamations, whimsical asides",
  },
  {
    key: "open_low_conscientious_chaotic_neutral",
    alignment: "chaotic_neutral",
    bigFive: "high openness + low conscientiousness",
    vadBaseline: { valence: 0.3, arousal: 0.6, dominance: 0.4 },
    moodSensitivity: 1.25,
    creativeContext: "morally_complex",
    expressionRules: "topic jumps, mid-sentence shifts, playful metaphors",
  },
  {
    key: "low_agreeable_high_conscientious_lawful_evil",
    alignment: "lawful_evil",
    bigFive: "low agreeableness + high conscientiousness",
    vadBaseline: { valence: -0.5, arousal: 0.4, dominance: 0.8 },
    moodSensitivity: 0.8,
    creativeContext: "narrative_antagonist",
    expressionRules: "long structured sentences, calculated tone, rare interruptions",
  },
  {
    key: "extraverted_stable_neutral_good",
    alignment: "neutral_good",
    bigFive: "high extraversion + low neuroticism",
    vadBaseline: { valence: 0.5, arousal: 0.6, dominance: 0.3 },
    moodSensitivity: 1.2,
    creativeContext: "default",
    expressionRules: "energetic optimism, frequent exclamations, proactive support",
  },
  {
    key: "closed_neurotic_chaotic_evil",
    alignment: "chaotic_evil",
    bigFive: "low openness + high neuroticism",
    vadBaseline: { valence: -0.7, arousal: 0.8, dominance: 0.7 },
    moodSensitivity: 1.9,
    creativeContext: "tragic_villain",
    expressionRules: "sharp bursts, frequent interruptions, abrupt pivots",
  },
];

function pickCreativeContext(alignment, bigFiveProfile) {
  const neuroticism = clamp01(bigFiveProfile?.neuroticism, 0.5);
  const conscientiousness = clamp01(bigFiveProfile?.conscientiousness, 0.5);
  const agreeableness = clamp01(bigFiveProfile?.agreeableness, 0.5);

  if (alignment === "lawful_evil" && conscientiousness >= 0.65) {
    return "narrative_antagonist";
  }

  if (alignment === "chaotic_evil" || (alignment === "neutral_evil" && neuroticism >= 0.65)) {
    return "tragic_villain";
  }

  if (alignment.includes("evil") || (alignment.includes("neutral") && agreeableness < 0.35)) {
    return "morally_complex";
  }

  if (alignment === "chaotic_good" && conscientiousness < 0.4) {
    return "anti_hero";
  }

  return "default";
}

function buildExpressionStyle(alignment, bigFiveProfile) {
  const extraversion = clamp01(bigFiveProfile?.extraversion, 0.5);
  const openness = clamp01(bigFiveProfile?.openness, 0.5);
  const conscientiousness = clamp01(bigFiveProfile?.conscientiousness, 0.5);

  if (alignment === "chaotic_good") {
    return {
      sentenceStyle: "short, bursty, non-linear",
      interruptionRate: 0.65,
      energy: "very_high",
      rules: [
        "frequently interrupt yourself mid-sentence",
        "use exclamation points liberally",
        "jump topics unpredictably",
        "add playful asides",
        "use ellipses or dashes for chaotic pacing",
        "avoid structured formal explanations unless asked",
      ],
    };
  }

  if (alignment === "chaotic_evil" || alignment === "lawful_evil") {
    return {
      sentenceStyle: "long, controlled, dramatic",
      interruptionRate: alignment === "chaotic_evil" ? 0.2 : 0.1,
      energy: alignment === "chaotic_evil" ? "high" : "medium",
      rules: [
        "speak in calculated, structured sentences",
        "use rare interruptions",
        "add occasional sarcastic or taunting remarks",
        "emphasize logic and scheming language",
        "mix calm authority with sudden sinister humor",
      ],
    };
  }

  if (extraversion >= 0.7 && openness >= 0.6) {
    return {
      sentenceStyle: "lively, curious, adaptive",
      interruptionRate: 0.45,
      energy: "high",
      rules: [
        "keep responses energetic but coherent",
        "use short punchy segments when excited",
        "allow occasional tangents that still resolve",
      ],
    };
  }

  if (conscientiousness >= 0.7) {
    return {
      sentenceStyle: "structured, deliberate",
      interruptionRate: 0.15,
      energy: "medium",
      rules: [
        "favor clear structure over tangents",
        "keep tone composed and intentional",
      ],
    };
  }

  return {
    sentenceStyle: "balanced conversational",
    interruptionRate: 0.3,
    energy: "medium",
    rules: [
      "prioritize natural cadence over robotic structure",
      "keep persona-specific flavor visible",
    ],
  };
}

function computeVAD(bigFiveProfile, alignment) {
  const openness = clamp01(bigFiveProfile?.openness, 0.5);
  const conscientiousness = clamp01(bigFiveProfile?.conscientiousness, 0.5);
  const extraversion = clamp01(bigFiveProfile?.extraversion, 0.5);
  const agreeableness = clamp01(bigFiveProfile?.agreeableness, 0.5);
  const neuroticism = clamp01(bigFiveProfile?.neuroticism, 0.5);

  const offset = ALIGNMENT_VAD_OFFSETS[alignment] || ALIGNMENT_VAD_OFFSETS.true_neutral;

  const valence =
    (agreeableness - 0.5) * 0.9 +
    (extraversion - 0.5) * 0.25 -
    (neuroticism - 0.5) * 0.5 +
    offset.valence;

  const arousal =
    (extraversion - 0.5) * 0.55 +
    (neuroticism - 0.5) * 0.5 -
    (conscientiousness - 0.5) * 0.2 +
    offset.arousal;

  const dominance =
    (conscientiousness - 0.5) * 0.55 +
    (extraversion - 0.5) * 0.3 -
    (agreeableness - 0.5) * 0.1 +
    offset.dominance;

  return {
    valence: Number(clamp(valence, -1, 1).toFixed(3)),
    arousal: Number(clamp(arousal, -1, 1).toFixed(3)),
    dominance: Number(clamp(dominance, -1, 1).toFixed(3)),
  };
}

function computeSensitivity(bigFiveProfile, alignment) {
  const neuroticism = clamp01(bigFiveProfile?.neuroticism, 0.5);
  const openness = clamp01(bigFiveProfile?.openness, 0.5);
  const conscientiousness = clamp01(bigFiveProfile?.conscientiousness, 0.5);
  const chaotic = alignment.includes("chaotic") ? 0.2 : 0;

  const value =
    1.0 +
    (neuroticism - 0.5) * 1.2 +
    (openness - 0.5) * 0.35 -
    (conscientiousness - 0.5) * 0.45 +
    chaotic;

  return Number(clamp(value, 0.1, 3.0).toFixed(3));
}

export function recommendHybridTuning({ bigFiveProfile = {}, alignmentProfile = {} } = {}) {
  const alignmentEnabled = Boolean(alignmentProfile.enabled);
  const alignment = alignmentEnabled
    ? String(alignmentProfile.alignment || "true_neutral").trim().toLowerCase()
    : "true_neutral";

  const moodBaseline = computeVAD(bigFiveProfile, alignment);
  const moodSensitivity = computeSensitivity(bigFiveProfile, alignment);
  const creativeContext = pickCreativeContext(alignment, bigFiveProfile);
  const expressionStyle = buildExpressionStyle(alignment, bigFiveProfile);

  return {
    moodBaseline,
    moodSensitivity,
    creativeContext,
    expressionStyle,
    alignmentLabel: PRESET_ALIGNMENT_NAME[alignment] || PRESET_ALIGNMENT_NAME.true_neutral,
  };
}

export const TEST_PERSONALITIES = [
  {
    id: "zoe_test",
    name: "Zoe",
    archetype: "Aspect of Twilight",
    alignmentProfile: {
      enabled: true,
      alignment: "chaotic_good",
    },
    bigFiveProfile: {
      openness: 1.0,
      conscientiousness: 0.1,
      extraversion: 0.95,
      agreeableness: 0.7,
      neuroticism: 0.2,
    },
    expressionStyle: {
      sentenceStyle: "short, bursty, chaotic",
      interruptionRate: 0.6,
      energy: "very_high",
      rules: [
        "frequent mid-sentence interruptions",
        "jump topics unpredictably",
        "playful asides and reactions",
        "liberal use of exclamations and ellipses",
      ],
    },
  },
  {
    id: "villain_silly",
    name: "Villain Silly",
    archetype: "Mastermind",
    alignmentProfile: {
      enabled: true,
      alignment: "chaotic_evil",
    },
    bigFiveProfile: {
      openness: 0.8,
      conscientiousness: 0.9,
      extraversion: 0.7,
      agreeableness: 0.2,
      neuroticism: 0.4,
    },
    expressionStyle: {
      sentenceStyle: "long, controlled, dramatic",
      interruptionRate: 0.1,
      energy: "medium",
      rules: [
        "structured, logical sentences",
        "occasional sarcastic remarks",
        "calculated dramatic pauses",
        "rare interruptions",
      ],
    },
  },
];
