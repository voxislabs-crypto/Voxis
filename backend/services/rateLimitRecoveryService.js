const RETRY_MESSAGE_MAX_CHARS = 280;

export function isRateLimitError(error) {
  if (!error) {
    return false;
  }

  return (
    error.isRateLimit === true ||
    Number(error.statusCode) === 429 ||
    Number(error.providerStatus) === 429 ||
    /(^|\D)429(\D|$)|rate[- ]?limit/i.test(String(error.message || ""))
  );
}

export function sanitizeRateLimitedMessage(message, maxChars = RETRY_MESSAGE_MAX_CHARS) {
  const normalized = String(message || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Answer the user's core request briefly.";
  }

  if (normalized.length <= maxChars) {
    return normalized;
  }

  const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
  const selected = [];

  for (const sentence of sentences) {
    const next = [...selected, sentence.trim()].filter(Boolean).join(" ").trim();
    if (!next) {
      continue;
    }

    if (next.length > maxChars) {
      break;
    }

    selected.push(sentence.trim());
    if (next.length >= Math.min(180, maxChars)) {
      break;
    }
  }

  const collapsed = selected.join(" ").trim() || normalized.slice(0, Math.max(0, maxChars - 3)).trim();
  return collapsed.length < normalized.length ? `${collapsed.replace(/[\s.]+$/g, "")}...` : collapsed;
}

export function buildRateLimitRetryMessages({
  compactSystemPrompt,
  policyPrompt,
  moodFragment,
  history = [],
  sanitizedUserMessage,
}) {
  const retryMessages = [];

  if (compactSystemPrompt) {
    retryMessages.push({ role: "system", content: compactSystemPrompt });
  }

  if (policyPrompt) {
    retryMessages.push({ role: "system", content: policyPrompt });
  }

  retryMessages.push({
    role: "system",
    content:
      "Rate-limit recovery mode: answer only the core request, keep the response concise, and reduce detail. Prefer 2-4 sentences unless the mode requires structure.",
  });

  if (moodFragment) {
    retryMessages.push({ role: "system", content: moodFragment });
  }

  for (const item of history.slice(-2)) {
    if (item?.role && item?.content) {
      retryMessages.push({ role: item.role, content: item.content });
    }
  }

  retryMessages.push({
    role: "user",
    content: [
      "The upstream provider is rate-limited.",
      "Use this shortened request and answer the main point only:",
      sanitizedUserMessage,
    ].join("\n\n"),
  });

  return retryMessages;
}

export function buildRateLimitNotice({ sanitizedUserMessage, retrySucceeded }) {
  if (retrySucceeded) {
    return [
      "Note: the provider hit a temporary rate limit, so I retried with a shortened version of your message and kept this reply concise.",
      `Shortened request: ${sanitizedUserMessage}`,
      "",
    ].join("\n");
  }

  return [
    "Note: the provider hit a temporary rate limit, and even the shortened retry was still throttled.",
    `Shortened request: ${sanitizedUserMessage}`,
    "",
  ].join("\n");
}

export function buildRateLimitFallbackReply({ sanitizedUserMessage }) {
  return [
    buildRateLimitNotice({ sanitizedUserMessage, retrySucceeded: false }).trim(),
    "I could not complete the full response right now.",
    "Please retry in a few seconds, or send a shorter follow-up if you want a lighter answer while the free model is busy.",
  ].join("\n\n");
}