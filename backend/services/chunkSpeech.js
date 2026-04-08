function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function splitIntoChunks(text, { maxPauseMs = 500, minPauseMs = 80 } = {}) {
  const input = String(text || "").trim();
  if (!input) {
    return [];
  }

  return input
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map((sentence) => ({
      text: sentence,
      pauseMs: Math.round(clamp(sentence.length * 11, minPauseMs, maxPauseMs)),
    }));
}