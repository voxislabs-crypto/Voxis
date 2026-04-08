function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getSpeechProfile(personality = {}) {
  const traits = asArray(personality.traits).map((item) => String(item || "").toLowerCase());
  const rules = asArray(personality.behaviorRules).map((item) => String(item || "").toLowerCase());
  const speechStyle = String(personality.speechStyle || "").toLowerCase();
  const sentenceStyle = String(personality.expressionStyle?.sentenceStyle || "").toLowerCase();
  const energy = String(personality.expressionStyle?.energy || "medium").toLowerCase();
  const joined = [speechStyle, sentenceStyle, ...traits, ...rules].join(" ");

  const sarcastic = /sarcastic|dry wit|snark|mocking/.test(joined);
  const calm = /calm|measured|gentle|soft|deliberate/.test(joined);
  const chaotic = /chaotic|bursty|erratic|unpredictable/.test(joined);
  const villain = /villain|menace|threat|mastermind|theatrical/.test(joined);

  if (sarcastic) {
    return {
      id: "sarcastic",
      pauseIntensity: 0.72,
      emphasisWords: ["genius", "obviously", "clearly", "exactly"],
      pacing: "irregular",
      interruptionRate: 0.22,
      tension: 0.45,
      energy,
      flags: { sarcastic: true, calm, chaotic, villain },
    };
  }

  if (chaotic) {
    return {
      id: "chaotic",
      pauseIntensity: 0.28,
      emphasisWords: ["now", "listen", "exactly", "never"],
      pacing: "fast",
      interruptionRate: 0.58,
      tension: 0.35,
      energy,
      flags: { sarcastic, calm, chaotic: true, villain },
    };
  }

  if (villain) {
    return {
      id: "villain",
      pauseIntensity: 0.66,
      emphasisWords: ["inevitable", "listen", "exactly", "always"],
      pacing: "controlled",
      interruptionRate: 0.12,
      tension: 0.8,
      energy,
      flags: { sarcastic, calm, chaotic, villain: true },
    };
  }

  if (calm) {
    return {
      id: "calm",
      pauseIntensity: 0.46,
      emphasisWords: ["understand", "slowly", "carefully"],
      pacing: "slow",
      interruptionRate: 0.04,
      tension: 0.1,
      energy,
      flags: { sarcastic, calm: true, chaotic, villain },
    };
  }

  return {
    id: "balanced",
    pauseIntensity: 0.35,
    emphasisWords: ["exactly", "clearly"],
    pacing: "balanced",
    interruptionRate: 0.12,
    tension: 0.2,
    energy,
    flags: { sarcastic, calm, chaotic, villain },
  };
}