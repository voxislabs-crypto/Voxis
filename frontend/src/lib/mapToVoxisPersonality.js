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

function toFixed3(value) {
  return Number(value.toFixed(3));
}

function contains(alignmentKey, token) {
  return String(alignmentKey || "").includes(token);
}

function chooseCreativeContext(alignmentKey, traits, current) {
  const C = clamp01(traits?.conscientiousness, 0.5);
  const O = clamp01(traits?.openness, 0.5);
  const N = clamp01(traits?.neuroticism, 0.5);

  if (alignmentKey === "lawful_evil" && C >= 0.65) {
    return "narrative_antagonist";
  }

  if (alignmentKey === "chaotic_evil" && (N >= 0.55 || O >= 0.65)) {
    return "tragic_villain";
  }

  if (alignmentKey === "chaotic_good" && C < 0.35) {
    return "anti_hero";
  }

  return current;
}

export function mapToVoxisPersonality({ bigFiveProfile = {}, alignmentProfile = {} } = {}) {
  const O = clamp01(bigFiveProfile?.openness, 0.5);
  const C = clamp01(bigFiveProfile?.conscientiousness, 0.5);
  const E = clamp01(bigFiveProfile?.extraversion, 0.5);
  const A = clamp01(bigFiveProfile?.agreeableness, 0.5);
  const N = clamp01(bigFiveProfile?.neuroticism, 0.5);

  const alignmentEnabled = Boolean(alignmentProfile?.enabled);
  const alignmentKey = alignmentEnabled
    ? String(alignmentProfile?.alignment || "true_neutral").trim().toLowerCase()
    : "true_neutral";

  let valence = E * 0.4 + A * 0.55 - N * 0.65;
  let arousal = E * 0.7 + O * 0.35;
  let dominance = C * 0.6 + O * 0.3 + E * 0.1;
  let moodSensitivity = N * 1.4 + 0.3;

  let creativeContext = "default";
  const rules = [];
  let sentenceStyle = "balanced";
  let interruptionRate = 0.3;
  let energy = "medium";

  if (contains(alignmentKey, "good")) {
    valence = Math.max(valence, 0.25);
    rules.push("warm / encouraging tone", "shows concern for others");
  }

  if (contains(alignmentKey, "evil")) {
    valence = Math.min(valence, -0.35);
    creativeContext = "morally_complex";
    rules.push("sarcastic or mocking edge", "takes pleasure in discomfort");
  }

  if (contains(alignmentKey, "chaotic")) {
    arousal = Math.min(1.0, arousal + 0.4);
    moodSensitivity += 0.7;
    creativeContext = "morally_complex";
    sentenceStyle = "bursty and chaotic";
    interruptionRate = 0.8;
    energy = "very_high";
    rules.push(
      "mid-sentence jumps and tangents",
      "frequent exclamations or dashes",
      "playful or erratic pacing",
    );
  }

  if (contains(alignmentKey, "lawful")) {
    dominance = Math.max(dominance, 0.5);
    sentenceStyle = "measured and deliberate";
    interruptionRate = Math.min(interruptionRate, 0.18);
    rules.push("structured phrasing", "references principles, codes, or rules");
  }

  if (N > 0.7) {
    moodSensitivity += 0.4;
    rules.push("quick to snap or overreact");
  }

  if (E > 0.8) {
    energy = "very_high";
    interruptionRate = Math.max(interruptionRate, 0.45);
    rules.push("loud, energetic delivery");
  }

  if (C < 0.3) {
    rules.push("scattered thoughts", "forgets details mid-sentence");
  }

  if (O > 0.8) {
    creativeContext = "morally_complex";
    rules.push("whimsical or cosmic observations");
  }

  creativeContext = chooseCreativeContext(alignmentKey, { openness: O, conscientiousness: C, neuroticism: N }, creativeContext);

  valence = clamp(valence, -1, 1);
  arousal = clamp(arousal, -1, 1);
  dominance = clamp(dominance, -1, 1);
  moodSensitivity = clamp(moodSensitivity, 0.1, 3.0);

  if (energy !== "very_high") {
    if (arousal >= 0.7) {
      energy = "high";
    } else if (arousal <= 0.2) {
      energy = "low";
    }
  }

  return {
    moodBaseline: {
      valence: toFixed3(valence),
      arousal: toFixed3(arousal),
      dominance: toFixed3(dominance),
    },
    moodSensitivity: toFixed3(moodSensitivity),
    creativeContext,
    expressionStyle: {
      sentenceStyle,
      interruptionRate: toFixed3(clamp(interruptionRate, 0, 1)),
      energy,
      rules: Array.from(new Set(rules)).slice(0, 12),
    },
    alignmentKey,
    alignmentLabel: PRESET_ALIGNMENT_NAME[alignmentKey] || PRESET_ALIGNMENT_NAME.true_neutral,
  };
}
