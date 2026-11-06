// Reads the user's words and returns a structured affect estimate.
// This module does not write character VAD or EmotionFrame.

const RULES = [
  {
    intent: "seek_acknowledgment",
    weight: 3,
    valence: -0.35,
    arousal: 0.55,
    pattern: /\b(just listen|don'?t fix|don'?t solve|no advice|hear me out|do you understand|am i crazy)\b/i,
  },
  {
    intent: "vent",
    weight: 2,
    valence: -0.7,
    arousal: 0.78,
    pattern: /\b(frustrat\w*|annoy\w*|angry|pissed|furious|hate|ugh+|wtf|ridiculous|useless|broken|isn'?t working|not working|doesn'?t work|still (?:broken|failing|not)|sick of|so done|over it)\b/i,
  },
  {
    intent: "distress",
    weight: 2,
    valence: -0.6,
    arousal: 0.28,
    pattern: /\b(sad|lonely|hopeless|depressed|empty|exhausted|drained|miss you)\b/i,
  },
  {
    intent: "distress",
    weight: 2,
    valence: -0.45,
    arousal: 0.72,
    pattern: /\b(worried|anxious|scared|nervous|afraid|panic)\b/i,
  },
  {
    intent: "ask_help",
    weight: 2,
    valence: -0.05,
    arousal: 0.4,
    pattern: /\b(how do i|how can i|can you help|help me|what should i|walk me through|explain how)\b/i,
  },
  {
    intent: "gratitude",
    weight: 2,
    valence: 0.55,
    arousal: 0.35,
    pattern: /\b(thank you|thanks|grateful)\b/i,
  },
  {
    intent: "share",
    weight: 1,
    valence: 0.62,
    arousal: 0.58,
    pattern: /\b(love this|awesome|excited|happy|glad|wonderful|great|yay)\b/i,
  },
];

const FOCUS_STOP = new Set([
  "i", "im", "i'm", "the", "a", "an", "to", "and", "or", "of", "for", "my", "me",
  "you", "it", "this", "that", "is", "are", "was", "with", "about", "just", "so",
  "do", "dont", "don't", "be", "on", "in", "at", "please", "really", "still",
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function userTurns(history) {
  if (!Array.isArray(history)) return [];
  return history.filter((turn) => {
    if (!turn) return false;
    if (typeof turn === "string") return turn.trim().length > 0;
    const role = String(turn.role || "user").toLowerCase();
    return role === "user" && String(turn.content || "").trim().length > 0;
  });
}

function turnText(turn) {
  return typeof turn === "string" ? turn : String(turn.content || "");
}

export function extractFocus(message, intent = "unclear") {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  if (!text || intent === "greet" || intent === "gratitude") return null;

  const marked = text.match(/\b(?:about|regarding|because of)\s+([^,.!?]{2,80})/i);
  if (marked) return cleanFocus(marked[1]);

  const words = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word && !FOCUS_STOP.has(word.toLowerCase()));
  if (words.length < 2 || words.length > 8) return null;
  return cleanFocus(words.slice(0, 5).join(" "));
}

function cleanFocus(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
  if (text.length < 2) return null;
  return text.slice(0, 80);
}

function scoreText(text) {
  let valenceWeight = 0;
  let arousalWeight = 0;
  let valenceSum = 0;
  let arousalSum = 0;
  const intents = new Map();
  const cues = [];

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    rule.pattern.lastIndex = 0;
    cues.push(rule.intent);
    valenceSum += rule.valence * rule.weight;
    arousalSum += rule.arousal * rule.weight;
    valenceWeight += rule.weight;
    arousalWeight += rule.weight;
    intents.set(rule.intent, (intents.get(rule.intent) || 0) + rule.weight);
  }

  return {
    valence: valenceWeight ? valenceSum / valenceWeight : 0,
    arousal: arousalWeight ? arousalSum / arousalWeight : 0,
    intents,
    hits: cues.length,
    cues,
  };
}

function chooseIntent(text, intents) {
  const greeting = /^(hi|hey|hello|yo|good morning|good evening)\b/i.test(text) && text.length <= 40;
  if (intents.has("seek_acknowledgment")) return "seek_acknowledgment";
  const asks = text.includes("?") || /\b(how|what|why|can you|help)\b/i.test(text);
  if (intents.has("ask_help") && asks) return "ask_help";
  if (intents.has("vent")) return "vent";
  if (intents.has("distress")) return "distress";
  if (intents.has("ask_help")) return "ask_help";
  if (intents.has("gratitude")) return "gratitude";
  if (intents.has("share")) return "share";
  if (greeting && intents.size === 0) return "greet";
  if (asks && intents.size === 0) return "ask_help";
  return "unclear";
}

export function detectUserAffect({ message, history = [] } = {}) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return { valence: 0, arousal: 0, intent: "unclear", confidence: 0, focus: null, cues: [] };
  }

  const scored = scoreText(text);
  let intent = chooseIntent(text, scored.intents);
  let valence = scored.valence;
  let arousal = scored.arousal;
  let confidence = scored.hits === 0 ? 0.28 : Math.min(0.92, 0.4 + scored.hits * 0.12);

  if (intent === "greet") {
    valence = 0.1;
    arousal = 0.3;
    confidence = Math.max(confidence, 0.7);
  }
  if (intent === "unclear") confidence = Math.min(confidence, 0.34);
  if (intent === "ask_help" && scored.hits === 0) confidence = 0.46;
  if (/[!]{2,}|\?{2,}/.test(text)) arousal += 0.1;

  let priorNegative = 0;
  for (const turn of userTurns(history).slice(-6)) {
    const prior = scoreText(turnText(turn));
    if (prior.valence < -0.2) priorNegative += 1;
  }
  if (priorNegative >= 2 && valence <= 0) {
    valence -= 0.12;
    confidence += 0.1;
  }

  valence = round(clamp(valence, -1, 1));
  arousal = round(clamp(arousal, 0, 1));
  confidence = round(clamp(confidence, 0, 0.95));

  return {
    valence,
    arousal,
    intent,
    confidence,
    focus: extractFocus(text, intent),
    cues: scored.cues,
  };
}
