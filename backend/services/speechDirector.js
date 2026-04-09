import { getSpeechProfile } from "./speechProfiles.js";

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

function hashString(input) {
  let hash = 2166136261;
  const text = String(input || "");

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return (hash >>> 0) / 4294967295;
}

function shouldInject(seed, threshold) {
  return hashString(seed) <= threshold;
}

function normalizeMood(personality = {}, moodOverride = null) {
  if (moodOverride && typeof moodOverride === "object") {
    return moodOverride;
  }

  if (personality.moodState && typeof personality.moodState === "object") {
    return personality.moodState;
  }

  if (personality.moodBaseline && typeof personality.moodBaseline === "object") {
    return personality.moodBaseline;
  }

  return {};
}

function collectSignals(personality = {}, profile = null) {
  const traits = asArray(personality.traits).map((item) => String(item || "").toLowerCase());
  const behaviorRules = asArray(personality.behaviorRules).map((item) => String(item || "").toLowerCase());
  const expressionRules = asArray(personality.expressionStyle?.rules).map((item) => String(item || "").toLowerCase());
  const speechStyle = String(personality.speechStyle || "").toLowerCase();
  const sentenceStyle = String(personality.expressionStyle?.sentenceStyle || "").toLowerCase();
  const energy = String(personality.expressionStyle?.energy || "medium").toLowerCase();

  const joined = [speechStyle, sentenceStyle, ...traits, ...behaviorRules, ...expressionRules].join(" ");

  return {
    sarcastic: Boolean(profile?.flags?.sarcastic) || /sarcastic|dry wit|snark|mocking/.test(joined),
    dramatic: Boolean(profile?.flags?.villain) || /dramatic|theatrical|menace|showman/.test(joined),
    chaotic: Boolean(profile?.flags?.chaotic) || /chaotic|bursty|erratic|unpredictable/.test(joined),
    assertive: /assertive|dominant|commanding|confident/.test(joined),
    calm: Boolean(profile?.flags?.calm) || /calm|measured|soft|gentle|deliberate/.test(joined),
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

export function stylizeSpeech(rawText, personality = {}, moodOverride = null) {
  const input = String(rawText || "").replace(/\s+/g, " ").trim();
  if (!input) {
    return "";
  }

  const mood = normalizeMood(personality, moodOverride);
  const profile = getSpeechProfile(personality);
  const arousal = Number(mood.arousal);
  const dominance = Number(mood.dominance);
  const signals = collectSignals(personality, profile);
  const isHighArousal = Number.isFinite(arousal) && arousal >= 0.55;
  const isLowArousal = Number.isFinite(arousal) && arousal <= -0.3;
  const isHighDominance = Number.isFinite(dominance) && dominance >= 0.35;

  let output = input;

  if (signals.chaotic || signals.energy === "very_high" || isHighArousal || profile.pacing === "fast") {
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
    const emphasisTerms = Array.from(new Set([
      ...collectEmphasisTerms(personality),
      ...asArray(profile.emphasisWords).map((term) => String(term || "").toLowerCase()),
    ]));
    output = emphasizeTerms(output, emphasisTerms, 4);
  }

  if (signals.energy === "very_high" || isHighArousal) {
    output = output.replace(/\.\s+(?=[A-Z])/g, "! ");
    if (output.endsWith(".")) {
      output = `${output.slice(0, -1)}!`;
    }
  }

  if (Number.isFinite(dominance) && dominance > 0.5) {
    output = output.replace(/\b(i think|maybe|perhaps)\b/gi, "").replace(/\s{2,}/g, " ");
  }

  if (Number.isFinite(dominance) && dominance < -0.4) {
    output = output.replace(/\./g, "...");
  }

  const notablePhrases = asArray(personality.notablePhrases)
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  if (notablePhrases.length > 0) {
    const injectSeed = `${personality.name || "anon"}:${input}`;
    if (shouldInject(injectSeed, 0.3)) {
      const index = Math.floor(hashString(`${injectSeed}:idx`) * notablePhrases.length);
      output = `${output} ${notablePhrases[index]}`.trim();
    }
  }

  const lowerTraits = asArray(personality.traits).map((item) => String(item || "").toLowerCase());
  const isErratic = lowerTraits.includes("erratic") || lowerTraits.includes("unstable");
  if (isErratic && shouldInject(`${input}:stutter`, 0.2)) {
    output = output.replace(/\b([A-Za-z][A-Za-z']{3,})\b/, (word) => `${word[0]}-${word}`);
  }

  if (String(personality.name || "").toLowerCase().includes("rick") && shouldInject(`${input}:rick`, 0.28)) {
    output = output.replace(/\bI\b/g, "I-uh-I");
    output = `[BURP] ${output}`;  // marker stripped in ttsService before reaching TTS engine
  }

  // Strip markdown formatting — bold, italic, action-notation, code spans,
  // ATX headings — so TTS engines don't verbalize *, _, `, or # as symbols.
  output = output
    .replace(/\*\*([^*]+)\*\*/g, "$1")   // **bold** → bold
    .replace(/\*([^*\n]+)\*/g, "$1")      // *italic* or *action* → word only
    .replace(/__([^_\n]+)__/g, "$1")      // __bold__ → bold
    .replace(/_([^_\n]+)_/g, "$1")        // _italic_ → italic
    .replace(/`[^`\n]+`/g, (m) => m.slice(1, -1)) // `code` → code
    .replace(/^#{1,6}\s+/gm, "");         // ## Heading → Heading

  output = output
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\.{4,}/g, "...")
    .replace(/!{2,}/g, "!")
    .trim();

  return output;
}