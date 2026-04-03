const PII_PATTERNS = [
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, // SSN-like
  /\b(?:\+?\d{1,2}\s*)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}\b/, // phone-like
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // email
  /\b\d+\s+[A-Za-z0-9\s]+\s(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b/i, // address-like
];

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function hasPotentialPii(text) {
  return PII_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

export function extractUserMemoriesFromMessage(message) {
  const text = normalizeWhitespace(message);
  if (!text || hasPotentialPii(text)) {
    return [];
  }

  const lower = text.toLowerCase();
  const candidates = [];

  const likeMatch = text.match(/\bi\s+(?:really\s+)?(?:like|love|enjoy|prefer)\s+(.+?)(?:[.!?]|$)/i);
  if (likeMatch?.[1]) {
    candidates.push({
      memoryType: "preference",
      content: `User likes ${normalizeWhitespace(likeMatch[1]).replace(/[.!?]+$/, "")}`,
      importance: 7,
    });
  }

  const dislikeMatch = text.match(/\bi\s+(?:do\s+not|don't|dislike|hate)\s+(.+?)(?:[.!?]|$)/i);
  if (dislikeMatch?.[1]) {
    candidates.push({
      memoryType: "preference",
      content: `User dislikes ${normalizeWhitespace(dislikeMatch[1]).replace(/[.!?]+$/, "")}`,
      importance: 7,
    });
  }

  const favoriteMatch = text.match(/\bmy\s+favorite\s+(.+?)\s+is\s+(.+?)(?:[.!?]|$)/i);
  if (favoriteMatch?.[1] && favoriteMatch?.[2]) {
    candidates.push({
      memoryType: "preference",
      content: `User's favorite ${normalizeWhitespace(favoriteMatch[1])} is ${normalizeWhitespace(favoriteMatch[2]).replace(/[.!?]+$/, "")}`,
      importance: 8,
    });
  }

  const identityMatch = text.match(/\bi\s+am\s+(.+?)(?:[.!?]|$)/i);
  if (identityMatch?.[1]) {
    const statement = normalizeWhitespace(identityMatch[1]).replace(/[.!?]+$/, "");
    if (statement && !/(\d{1,2}\s*(?:years?\s*old|yo))/.test(lower)) {
      candidates.push({
        memoryType: "fact",
        content: `User says they are ${statement}`,
        importance: 5,
      });
    }
  }

  const longTermGoalMatch = text.match(/\bi\s+want\s+to\s+(.+?)(?:[.!?]|$)/i);
  if (longTermGoalMatch?.[1]) {
    candidates.push({
      memoryType: "long_term_goal",
      content: `User wants to ${normalizeWhitespace(longTermGoalMatch[1]).replace(/[.!?]+$/, "")}`,
      importance: 6,
    });
  }

  return candidates
    .map((item) => ({
      ...item,
      content: normalizeWhitespace(item.content),
    }))
    .filter((item) => item.content && !hasPotentialPii(item.content))
    .slice(0, 2);
}

export function buildUserMemoryPromptSection(userMemories = []) {
  if (!Array.isArray(userMemories) || !userMemories.length) {
    return "";
  }

  const lines = userMemories
    .slice(0, 5)
    .map((memory) => `- [${memory.memoryType}] ${memory.content}`)
    .join("\n");

  return [
    "== USER CONTEXT ==",
    "Known user preferences/facts from prior conversations (non-sensitive):",
    lines,
    "Use these only when relevant to the current turn.",
  ].join("\n");
}
