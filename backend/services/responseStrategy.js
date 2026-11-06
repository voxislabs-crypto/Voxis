// Per-turn reply length. Reads the user message, recent turns, optional user
// affect, and the current character VAD or energy. It does not write mood,
// EmotionFrame, or memory.

const OFF = new Set(["0", "false", "off", "no"]);
const BRIEF_MAX_TOKENS = 120;

const STOP = new Set([
  "this", "that", "with", "from", "have", "about", "your", "what", "when",
  "where", "would", "could", "should", "there", "their", "them", "then",
  "than", "just", "like", "into", "because", "really", "been", "they",
]);

const GREETING = /^(hey+|hi+|hello+|yo+|sup|howdy|hiya|good (?:morning|afternoon|evening)|what'?s up|whats up|you there|you up)[.!?\s]*$/i;
const ACK = /^(ok|okay|k+|kk|thanks|thank you|thx|ty|cool|got it|bet|word|nice|lol|lmao|haha|nm|nvm|sure|yep|yeah|yes|no|nope|alright|all right)[.!?\s]*$/i;
const CHECKIN = /^(how are you|how're you|how's it going|hows it going|you good|u good)[.!?\s]*$/i;
const DEEP = /\b(explain|walk me through|help me understand|what do you think|tell me about|compare|why do|why does|how does|how do|break down|in depth|elaborate)\b/i;

export const RESPONSE_LENGTH_DIRECTIVES = {
  brief: "Reply in 1–2 short sentences. Match the energy of a quick acknowledgment. Do not expand unless the user asks.",
  normal: "Use your normal reply length and style.",
  expansive: "This warrants a fuller response. Use your normal style and length.",
};

export function isResponseStrategyEnabled(env = process.env) {
  const value = env.VOXIS_RESPONSE_STRATEGY;
  if (value == null || String(value).trim() === "") return true;
  return !OFF.has(String(value).trim().toLowerCase());
}

function wordCount(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

function isPureBrief(text) {
  return GREETING.test(text) || ACK.test(text) || CHECKIN.test(text);
}

function isShortLowStakes(text) {
  return wordCount(text) <= 4 && text.length <= 32 && !text.includes("?");
}

function isDeepQuestion(text) {
  if (DEEP.test(text)) return true;
  const words = wordCount(text);
  if (text.includes("?") && words >= 12) return true;
  return words >= 45;
}

function assistantJustAsked(history) {
  if (!Array.isArray(history)) return false;
  const lastAssistant = [...history].reverse().find((turn) => String(turn?.role || "").toLowerCase() === "assistant");
  return /\?\s*$/.test(String(lastAssistant?.content || "").trim());
}

function relevance(message, goals, memoryFacts) {
  const messageTokens = [...new Set(tokenize(message))];
  const corpus = new Set(tokenize([
    ...(Array.isArray(goals) ? goals : []),
    ...(Array.isArray(memoryFacts) ? memoryFacts.map((fact) => fact?.content || fact) : []),
  ].join(" ")));
  const hits = messageTokens.filter((token) => corpus.has(token));
  return {
    count: hits.length,
    longCount: hits.filter((token) => token.length >= 6).length,
  };
}

function isHighArousalTopic(affect, message) {
  if (!affect || wordCount(message) < 4) return false;
  const arousal = Number(affect.arousal);
  if (!Number.isFinite(arousal)) return false;
  const intent = String(affect.intent || "");
  if (["vent", "distress", "seek_acknowledgment"].includes(intent) && arousal >= 0.55) return true;
  return arousal >= 0.72;
}

function characterWantsRoom(mood, energy, affect, message) {
  if (wordCount(message) < 16) return false;
  const arousal = Number(mood?.arousal);
  const characterHot = (Number.isFinite(arousal) && Math.abs(arousal) >= 0.7)
    || String(energy || "").trim().toLowerCase() === "high";
  if (!characterHot) return false;
  return Number(affect?.arousal) >= 0.45 || String(message).includes("?");
}

function affectIsLight(affect, message) {
  if (!affect) return false;
  const intent = String(affect.intent || "");
  const arousal = Number(affect.arousal);
  const calm = !Number.isFinite(arousal) || arousal < 0.55;
  if (intent === "greet" && wordCount(message) <= 6) return true;
  return intent === "gratitude" && calm && wordCount(message) <= 8;
}

export function classifyResponseStrategy(input = {}) {
  if (input.enabled === false) return null;

  const message = String(input.message || "").replace(/\s+/g, " ").trim();
  const affect = input.affect && typeof input.affect === "object" ? input.affect : null;
  const history = Array.isArray(input.history) ? input.history : [];

  if (!message) {
    return {
      length: "brief",
      reason: "The user turn is empty.",
      maxTokensHint: BRIEF_MAX_TOKENS,
    };
  }

  const deep = isDeepQuestion(message);
  const light = isPureBrief(message) || (affectIsLight(affect, message) && !deep);
  if (light && !deep) {
    return {
      length: "brief",
      reason: isPureBrief(message)
        ? "Short greeting, acknowledgment, or check-in."
        : "User affect is a short, low-stakes signal.",
      maxTokensHint: BRIEF_MAX_TOKENS,
    };
  }

  const matched = relevance(message, input.goals, input.memoryFacts);
  const highlyRelevant = matched.count >= 2 || matched.longCount >= 1;
  const aroused = isHighArousalTopic(affect, message);
  const characterRoom = characterWantsRoom(input.mood, input.energy, affect, message);

  if (deep || highlyRelevant || aroused || characterRoom) {
    let reason = "Ordinary exchange.";
    if (deep) reason = "The user asked a deeper question.";
    else if (aroused) reason = "The topic is high-arousal.";
    else if (highlyRelevant) reason = "The turn is highly relevant to goals or memory.";
    else reason = "Character energy is high on a substantive turn.";
    return { length: "expansive", reason };
  }

  if (isShortLowStakes(message) && !assistantJustAsked(history)) {
    return {
      length: "brief",
      reason: "Short, low-relevance check-in.",
      maxTokensHint: BRIEF_MAX_TOKENS,
    };
  }

  return { length: "normal", reason: "Ordinary exchange." };
}

export function buildResponseStrategyPromptSection(strategy) {
  const directive = RESPONSE_LENGTH_DIRECTIVES[strategy?.length];
  if (!directive) return "";
  return ["== RESPONSE LENGTH ==", directive].join("\n");
}

export function applyMaxTokensHint(payload, hint) {
  if (!payload || typeof payload !== "object") return payload;
  const limit = Number(hint);
  if (!Number.isInteger(limit) || limit <= 0) return payload;
  return { ...payload, max_tokens: limit };
}
