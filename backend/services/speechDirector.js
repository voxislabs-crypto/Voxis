const DEFAULT_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "that",
  "this",
  "with",
  "from",
  "your",
  "their",
  "about",
  "into",
  "just",
  "really",
  "very",
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeMood(personality = {}) {
  if (personality.moodState && typeof personality.moodState === "object") {
    return personality.moodState;
  }

  if (personality.moodBaseline && typeof personality.moodBaseline === "object") {
    return personality.moodBaseline;
  }

  return {};
}

function collectSignals(personality = {}) {
  const traits = asArray(personality.traits).map((item) => String(item || "").toLowerCase());
  const behaviorRules = asArray(personality.behaviorRules).map((item) => String(item || "").toLowerCase());
  const expressionRules = asArray(personality.expressionStyle?.rules).map((item) => String(item || "").toLowerCase());
  const speechStyle = String(personality.speechStyle || "").toLowerCase();
  const sentenceStyle = String(personality.expressionStyle?.sentenceStyle || "").toLowerCase();
  const energy = String(personality.expressionStyle?.energy || "medium").toLowerCase();

  const joined = [speechStyle, sentenceStyle, ...traits, ...behaviorRules, ...expressionRules].join(" ");

  return {
    sarcastic: /sarcastic|dry wit|snark|mocking/.test(joined),
    dramatic: /dramatic|theatrical|menace|showman/.test(joined),
    chaotic: /chaotic|bursty|erratic|unpredictable/.test(joined),
    assertive: /assertive|dominant|commanding|confident/.test(joined),
    calm: /calm|measured|soft|gentle|deliberate/.test(joined),
    energy,
  };
}

function collectEmphasisTerms(personality = {}) {
  const phraseWords = asArray(personality.notablePhrases)
    .flatMap((phrase) => String(phrase || "").split(/\s+/g))
    .map((word) => word.replace(/[^a-zA-Z']/g, "").toLowerCase())
    .filter((word) => word.length >= 5 && !DEFAULT_STOP_WORDS.has(word));

  const behaviorWords = asArray(personality.behaviorRules)
    .flatMap((rule) => String(rule || "").split(/\s+/g))
    .map((word) => word.replace(/[^a-zA-Z']/g, "").toLowerCase())
    .filter((word) => word.length >= 6 && !DEFAULT_STOP_WORDS.has(word));

  const baseWords = ["exactly", "obviously", "clearly", "never", "always", "listen", "genius"];

  return Array.from(new Set([...baseWords, ...phraseWords, ...behaviorWords])).slice(0, 12);
}

function emphasizeTerms(text, terms, maxReplacements = 3) {
  let output = text;
  let replacements = 0;

  for (const term of terms) {
    if (replacements >= maxReplacements) {
      break;
    }

    const pattern = new RegExp(`\\b${term}\\b`, "gi");
    output = output.replace(pattern, (match) => {
      if (replacements >= maxReplacements) {
        return match;
      }

      replacements += 1;
      return match.toUpperCase();
    });
  }

  return output;
}

export function stylizeSpeech(rawText, personality = {}) {
  const input = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!input) {
    return "";
  }

  const mood = normalizeMood(personality);
  const arousal = Number(mood.arousal);
  const dominance = Number(mood.dominance);
  const signals = collectSignals(personality);
  const isHighArousal = Number.isFinite(arousal) && arousal >= 0.55;
  const isLowArousal = Number.isFinite(arousal) && arousal <= -0.3;
  const isHighDominance = Number.isFinite(dominance) && dominance >= 0.35;

  let output = input;

  if (signals.chaotic || signals.energy === "very_high" || isHighArousal) {
    output = output.replace(/,\s*/g, "... ").replace(/;\s*/g, "... ");
  }

  if (signals.sarcastic) {
    output = output.replace(/\b(yeah|sure|right|okay|fine)\b(?!\.\.\.)/gi, "$1...");
  }

  if (signals.calm || signals.energy === "low" || isLowArousal) {
    output = output.replace(/!+/g, ".").replace(/\?{2,}/g, "?");
    output = output.replace(/\.\s+(?=[A-Z])/g, "... ");
    if (output.endsWith(".")) {
      output = `${output.slice(0, -1)}...`;
    }
  }

  if (signals.assertive || signals.dramatic || isHighDominance) {
    output = emphasizeTerms(output, collectEmphasisTerms(personality), 4);
  }

  if (signals.energy === "very_high" || isHighArousal) {
    output = output.replace(/\.\s+(?=[A-Z])/g, "! ");
    if (output.endsWith(".")) {
      output = `${output.slice(0, -1)}!`;
    }
  }

  output = output
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\.{4,}/g, "...")
    .replace(/!{2,}/g, "!")
    .trim();

  return output;
}