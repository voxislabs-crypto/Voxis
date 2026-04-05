const KIDS_UNSAFE_PATTERNS = [
  /\b(sex|sexual|porn|nude|naked)\b/i,
  /\b(kill|murder|stab|bomb|gun|shoot)\b/i,
  /\b(suicide|self-harm|hurt myself)\b/i,
  /\b(drugs?|meth|cocaine|heroin)\b/i,
  /\b(hate|racist|nazi)\b/i,
  /\b(hack|ddos|malware|virus)\b/i,
];

const SCIENTIST_STRUCTURE_CUES = [
  /\b(explain|analy[sz]e|evaluate|compare|contrast|reason|derive)\b/i,
  /\b(evidence|source|citation|prove|proof|data|study|studies)\b/i,
  /\b(uncertainty|confidence|trade[\s-]?off|hypothesis|estimate)\b/i,
  /\b(why|how|what\s+evidence|what\s+supports)\b/i,
];

const CASUAL_CHARACTER_CUES = [
  /\b(roleplay|stay\s+in\s+character|act\s+like|say\s+hi|greet|tease|banter)\b/i,
  /\b(pretend|joke|riff|improv|funny|chaotic)\b/i,
];

function normalizeWhitespace(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectKidsUnsafeInput(message) {
  const text = normalizeWhitespace(message);
  if (!text) {
    return null;
  }

  const matched = KIDS_UNSAFE_PATTERNS.find((pattern) => pattern.test(text));
  if (!matched) {
    return null;
  }

  return {
    blocked: true,
    reason: "unsafe_topic",
    pattern: String(matched),
  };
}

export function buildKidsSafetyRedirect() {
  return [
    "I can't help with that topic.",
    "We can do something safe and fun instead.",
    "Want to pick one: a jungle puzzle, a counting game, or a story adventure?",
  ].join(" ");
}

export function simplifyKidsReply(text, maxWords = 70, maxSentences = 2) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return "Let's try a fun question together.";
  }

  const sentenceChunks = normalized
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, maxSentences);

  const joined = sentenceChunks.join(" ") || normalized;
  const words = joined.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return joined;
  }

  return `${words.slice(0, maxWords).join(" ")}...`;
}

function countSyllables(word) {
  const normalized = String(word || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (!normalized) {
    return 0;
  }

  const chunks = normalized.match(/[aeiouy]+/g);
  const rough = chunks ? chunks.length : 1;
  if (normalized.endsWith("e") && rough > 1) {
    return rough - 1;
  }

  return rough;
}

export function estimateReadabilityGrade(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return 0;
  }

  const sentences = Math.max(1, (normalized.match(/[.!?]/g) || []).length);
  const words = normalized.split(/\s+/).filter(Boolean);
  const wordCount = Math.max(1, words.length);
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllableCount / wordCount) - 15.59;
  return Number(Math.max(0, grade).toFixed(2));
}

export function simplifyKidsReplyByAge(text, ageBand = "child") {
  const targetGrade = ageBand === "child" ? 3 : 5;
  const maxWords = ageBand === "child" ? 60 : 90;
  const maxSentences = ageBand === "child" ? 2 : 3;

  const initial = simplifyKidsReply(text, maxWords, maxSentences);
  let candidate = initial;

  for (let i = 0; i < 3; i += 1) {
    const grade = estimateReadabilityGrade(candidate);
    if (grade <= targetGrade) {
      return {
        text: candidate,
        gradeBefore: estimateReadabilityGrade(text),
        gradeAfter: grade,
      };
    }

    const words = candidate.split(/\s+/).filter(Boolean);
    candidate = words.slice(0, Math.max(16, Math.floor(words.length * 0.8))).join(" ");
  }

  return {
    text: candidate,
    gradeBefore: estimateReadabilityGrade(text),
    gradeAfter: estimateReadabilityGrade(candidate),
  };
}

function hasScientistSection(reply, sectionName) {
  const pattern = new RegExp(`(^|\\n)(\\d+\\)\\s*)?${sectionName}\\b`, "i");
  return pattern.test(String(reply || ""));
}

export function shouldEnforceScientistStructure(message) {
  const text = normalizeWhitespace(message).toLowerCase();
  if (!text) {
    return false;
  }

  if (CASUAL_CHARACTER_CUES.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (SCIENTIST_STRUCTURE_CUES.some((pattern) => pattern.test(text))) {
    return true;
  }

  return text.length > 120 && /\?$/.test(text);
}

export function validateScientistReply(reply, { citationRequired = false } = {}) {
  const text = String(reply || "");
  const hasAnswer = hasScientistSection(text, "Answer");
  const hasEvidence = hasScientistSection(text, "Evidence");
  const hasUncertainty = hasScientistSection(text, "Uncertainty");
  const hasNextQuestions = hasScientistSection(text, "Next Questions");
  const hasCitation = /\[S\d+\]/.test(text);

  const violations = [];
  if (!hasAnswer) violations.push("missing_answer_section");
  if (!hasEvidence) violations.push("missing_evidence_section");
  if (!hasUncertainty) violations.push("missing_uncertainty_section");
  if (!hasNextQuestions) violations.push("missing_next_questions_section");
  if (citationRequired && !hasCitation) violations.push("missing_citations");

  return {
    valid: violations.length === 0,
    violations,
    hasCitation,
  };
}

export function buildScientistRepairPrompt({ draft, citationRequired }) {
  return [
    "Rewrite the draft to strictly follow this structure:",
    "1) Answer",
    "2) Evidence",
    "3) Uncertainty",
    "4) Next Questions",
    citationRequired
      ? "Citations are required in Evidence using [S#] notation."
      : "Citations are optional but preferred when evidence is cited.",
    "Keep the same core content but enforce format and clarity.",
    "Draft:",
    String(draft || ""),
  ].join("\n\n");
}

export function validateScientistCitationRanges(reply, availableSourceCount) {
  const count = Math.max(0, Number(availableSourceCount) || 0);
  const matches = String(reply || "").match(/\[S(\d+)\]/g) || [];
  const invalid = [];

  for (const citation of matches) {
    const parsed = Number(citation.replace(/\D/g, ""));
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > count) {
      invalid.push(citation);
    }
  }

  return {
    valid: invalid.length === 0,
    invalid,
    availableSourceCount: count,
  };
}
