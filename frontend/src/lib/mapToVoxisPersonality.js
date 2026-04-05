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

export function mapToVoxisPersonality({ bigFiveProfile = {}, alignmentProfile = {} } = {}) {
  const alignmentEnabled = Boolean(alignmentProfile.enabled);
  const alignmentKey = alignmentEnabled
    ? String(alignmentProfile.alignment || "true_neutral").trim().toLowerCase()
    : "true_neutral";

  const moodBaseline = computeVAD(bigFiveProfile, alignmentKey);
  const moodSensitivity = computeSensitivity(bigFiveProfile, alignmentKey);
  const creativeContext = pickCreativeContext(alignmentKey, bigFiveProfile);
  const expressionStyle = buildExpressionStyle(alignmentKey, bigFiveProfile);

  return {
    moodBaseline,
    moodSensitivity,
    creativeContext,
    expressionStyle,
    alignmentKey,
    alignmentLabel: PRESET_ALIGNMENT_NAME[alignmentKey] || PRESET_ALIGNMENT_NAME.true_neutral,
  };
}
