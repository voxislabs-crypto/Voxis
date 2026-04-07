function toText(value) {
  return String(value || "").trim();
}

function clip(value, max = 88) {
  const text = toText(value).replace(/\s+/g, " ");
  if (!text) {
    return "";
  }
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(1, max - 1)).trim()}...`;
}

export function normalizeMemoryType(memoryType) {
  const raw = toText(memoryType || "memory").replace(/_/g, " ");
  if (!raw) {
    return "Memory";
  }
  return raw
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function redactMemoryText(value) {
  let text = toText(value);
  if (!text) {
    return "";
  }

  text = text
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .replace(/\b(name\s+is\s+)([A-Za-z][\w'-]{1,30})/gi, "$1[redacted]")
    .replace(/\b(called\s+)([A-Za-z][\w'-]{1,30})/gi, "$1[redacted]")
    .replace(/\b(@[A-Za-z0-9_]{2,})\b/g, "@user");

  return text;
}

function inferMemoryTopic(text, typeLabel) {
  const lower = toText(text).toLowerCase();

  if (/(name\s+is|called|creator|owner)/.test(lower)) {
    return "Identity Detail";
  }
  if (/(like|love|prefer|favorite|dislike|hate)/.test(lower)) {
    return "Preference";
  }
  if (/(plan|scheme|strategy|goal|objective)/.test(lower)) {
    return "Plan Note";
  }
  if (/(address|location|city|country|timezone)/.test(lower)) {
    return "Location Detail";
  }
  if (/(debt|owe|owed|borrow)/.test(lower)) {
    return "Debt Marker";
  }
  if (/(correct|correction|fixed|repair|anchor)/.test(lower)) {
    return "Correction";
  }

  return `${typeLabel} Note`;
}

export function buildMemoryDisplay(memory, fallbackIndex = 1) {
  const memoryType = memory?.memory_type || memory?.memoryType || memory?.type || "memory";
  const typeLabel = normalizeMemoryType(memoryType);
  const rawContent = toText(memory?.content || memory?.text || "");
  const redacted = redactMemoryText(rawContent);
  const topic = inferMemoryTopic(redacted, typeLabel);
  const title = `${topic} ${fallbackIndex}`;
  const description = clip(redacted || "No memory content.");

  return {
    typeLabel,
    title,
    description,
  };
}
