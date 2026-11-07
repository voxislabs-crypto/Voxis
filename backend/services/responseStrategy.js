// Per-turn reply length. Reads the user message, recent turns, optional user
// affect, and the current character VAD or energy. It does not write mood,
// EmotionFrame, or memory.

const OFF = new Set(["0", "false", "off", "no"]);

// Soft aim for a medium-energy persona with no extra goals or memory.
// The token window moves. The sentence window does not.
const SOFT_TARGETS = {
  brief: { minSentences: 1, maxSentences: 3, minTokens: 40, maxTokens: 80 },
  normal: { minSentences: 2, maxSentences: 6, minTokens: 80, maxTokens: 180 },
  expansive: { minSentences: 4, maxSentences: 10, minTokens: 160, maxTokens: 360 },
};

// Brief is the only length that still sends max_tokens. This sits above the
// soft window so a short reply can finish. It is not the length target.
export const BRIEF_SAFETY_CEILING = 320;

const FINISH_CLEANLY = "Finish the thought cleanly, then stop. Do not pad toward a longer reply. Do not stop mid-sentence.";

const STOP = new Set([
  "this", "that", "with", "from", "have", "about", "your", "what", "when",
  "where", "would", "could", "should", "there", "their", "them", "then",
  "than", "just", "like", "into", "because", "really", "been", "they",
]);

const GREETING = /^(hey+|hi+|hello+|yo+|sup|howdy|hiya|good (?:morning|afternoon|evening)|what'?s up|whats up|you there|you up)[.!?\s]*$/i;
const ACK = /^(ok|okay|k+|kk|thanks|thank you|thx|ty|cool|got it|bet|word|nice|lol|lmao|haha|nm|nvm|sure|yep|yeah|yes|no|nope|alright|all right)[.!?\s]*$/i;
const CHECKIN = /^(how are you|how're you|how's it going|hows it going|you good|u good)[.!?\s]*$/i;
const DEEP = /\b(explain|walk me through|help me understand|what do you think|tell me about|compare|why do|why does|how does|how do|break down|in depth|elaborate)\b/i;
// A hello can carry a real request. "Hey, tell me a joke" is not a check-in.
// The persona name is not read. This applies to every chat persona.
const CONTENT_ASK = /\b(?:tell|give|show|sing|joke|jokes|story|stories|poem|poems|song|songs|riddle|riddles|example|punchline|continue|go on|keep going|say more|another one|one more)\b/i;

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

function asksForContent(text) {
  return CONTENT_ASK.test(String(text || ""));
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

function countSignals(value) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((count, item) => {
    if (typeof item === "string") return item.trim() ? count + 1 : count;
    if (item && typeof item === "object") {
      const text = String(item.content || item.goal || item.text || "").trim();
      return text ? count + 1 : count;
    }
    return count;
  }, 0);
}

function energySlack(energy) {
  const value = String(energy || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (value === "very_high") return 40;
  if (value === "high") return 20;
  if (value === "low") return -20;
  return 0;
}

function complexitySlack(length, goals, memoryFacts) {
  const goalCount = countSignals(goals);
  const memoryDepth = countSignals(memoryFacts);
  let slack = 0;
  if (goalCount >= 3 || memoryDepth >= 3) slack += 20;
  if (goalCount >= 6 || memoryDepth >= 5) slack += 20;
  if (length === "brief") return Math.min(20, slack);
  return slack;
}

export function resolveLengthTarget({ length = "normal", energy = "", goals = [], memoryFacts = [] } = {}) {
  const band = SOFT_TARGETS[length] || SOFT_TARGETS.normal;
  const slack = energySlack(energy) + complexitySlack(length, goals, memoryFacts);
  return {
    minSentences: band.minSentences,
    maxSentences: band.maxSentences,
    minTokens: band.minTokens,
    maxTokens: Math.max(band.minTokens + 20, band.maxTokens + slack),
  };
}

function finishStrategy(length, reason, input) {
  const target = resolveLengthTarget({
    length,
    energy: input.energy,
    goals: input.goals,
    memoryFacts: input.memoryFacts,
  });
  const strategy = { length, reason, target };
  if (length === "brief") strategy.maxTokensHint = BRIEF_SAFETY_CEILING;
  return strategy;
}

export function classifyResponseStrategy(input = {}) {
  if (input.enabled === false) return null;

  const message = String(input.message || "").replace(/\s+/g, " ").trim();
  const affect = input.affect && typeof input.affect === "object" ? input.affect : null;
  const history = Array.isArray(input.history) ? input.history : [];

  if (!message) {
    return finishStrategy("brief", "The user turn is empty.", input);
  }

  const asks = asksForContent(message);
  const deep = isDeepQuestion(message);
  const light = !asks && (isPureBrief(message) || (affectIsLight(affect, message) && !deep));
  if (light && !deep) {
    return finishStrategy(
      "brief",
      isPureBrief(message)
        ? "Short greeting, acknowledgment, or check-in."
        : "User affect is a short, low-stakes signal.",
      input,
    );
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
    return finishStrategy("expansive", reason, input);
  }

  if (isShortLowStakes(message) && !asks && !assistantJustAsked(history)) {
    return finishStrategy("brief", "Short, low-relevance check-in.", input);
  }

  return finishStrategy("normal", "Ordinary exchange.", input);
}

export function buildResponseStrategyPromptSection(strategy) {
  const target = strategy?.target;
  if (!target || !Number.isFinite(Number(target.minSentences))) return "";
  const lines = [
    "== RESPONSE LENGTH ==",
    `Aim for ${target.minSentences}–${target.maxSentences} sentences, about ${target.minTokens}–${target.maxTokens} tokens.`,
    FINISH_CLEANLY,
  ];
  if (Number.isInteger(strategy.maxTokensHint) && strategy.maxTokensHint > target.maxTokens) {
    lines.push("A higher generation limit exists only so the last sentence can finish. It is not a target.");
  }
  return lines.join("\n");
}

export function applyMaxTokensHint(payload, hint) {
  if (!payload || typeof payload !== "object") return payload;
  const limit = Number(hint);
  if (!Number.isInteger(limit) || limit <= 0) return payload;
  return { ...payload, max_tokens: limit };
}
