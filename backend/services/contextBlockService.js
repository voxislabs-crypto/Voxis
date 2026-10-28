export const DEFAULT_CONTEXT_CHARS = 700;
export const MIN_CONTEXT_CHARS = 500;
export const MAX_CONTEXT_CHARS = 800;

const MEMORY_LIMIT = 4;

export function clampContextChars(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_CONTEXT_CHARS;
  return Math.max(MIN_CONTEXT_CHARS, Math.min(MAX_CONTEXT_CHARS, Math.round(number)));
}

function squash(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function topicWords(topic) {
  return [...new Set(
    squash(topic)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  )];
}

function overlap(content, words) {
  if (!words.length) return 0;
  const haystack = squash(content).toLowerCase();
  const hits = words.filter((word) => haystack.includes(word)).length;
  return hits / words.length;
}

export function rankContextMemories(memories, topic, limit = MEMORY_LIMIT) {
  const words = topicWords(topic);
  return [...(Array.isArray(memories) ? memories : [])]
    .filter((memory) => squash(memory?.content))
    .map((memory) => {
      const matched = overlap(memory.content, words);
      const councilBoost = memory.memoryType === "council" && matched > 0 ? 0.35 : 0;
      const importance = Number(memory.importance) || 0;
      return {
        memory,
        matched,
        score: matched + councilBoost + importance / 100,
      };
    })
    .filter((entry) => {
      if (entry.memory.memoryType === "council") return entry.matched > 0;
      return entry.matched > 0 || entry.memory.importance >= 8;
    })
    .sort((left, right) => right.score - left.score || (right.memory.importance || 0) - (left.memory.importance || 0))
    .slice(0, limit)
    .map((entry) => entry.memory);
}

function formatVad(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0.00";
  return number.toFixed(2);
}

export function buildContextBlock({
  moodLabel = "neutral",
  mood = {},
  memories = [],
  maxChars = DEFAULT_CONTEXT_CHARS,
} = {}) {
  const ceiling = clampContextChars(maxChars);
  const lines = [
    `Mood: ${squash(moodLabel) || "neutral"} V${formatVad(mood.valence)} A${formatVad(mood.arousal)} D${formatVad(mood.dominance)}`,
  ];

  const memoryText = memories
    .filter((memory) => memory?.memoryType !== "council")
    .map((memory) => squash(memory.content))
    .filter(Boolean);
  const councilText = memories
    .filter((memory) => memory?.memoryType === "council")
    .map((memory) => squash(memory.content))
    .filter(Boolean);

  if (memoryText.length) lines.push(`Memory: ${memoryText.join("; ")}`);
  if (councilText.length) lines.push(`Council: ${councilText.join("; ")}`);

  const block = lines.join("\n");
  if (block.length <= ceiling) return block;
  return block.slice(0, ceiling).trimEnd();
}

export function clampMoodDelta(delta = {}) {
  const clamp = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(-0.3, Math.min(0.3, number));
  };

  return {
    valence: clamp(delta.valence),
    arousal: clamp(delta.arousal),
    dominance: clamp(delta.dominance),
  };
}

export function applyMoodDelta(mood = {}, delta = {}) {
  const shift = clampMoodDelta(delta);
  const axis = (key) => {
    const base = Number(mood?.[key]);
    const start = Number.isFinite(base) ? base : 0;
    return Math.max(-1, Math.min(1, start + shift[key]));
  };

  return {
    ...(mood && typeof mood === "object" ? mood : {}),
    valence: axis("valence"),
    arousal: axis("arousal"),
    dominance: axis("dominance"),
  };
}

export function moodDeltaIsZero(delta = {}) {
  const shift = clampMoodDelta(delta);
  return shift.valence === 0 && shift.arousal === 0 && shift.dominance === 0;
}
