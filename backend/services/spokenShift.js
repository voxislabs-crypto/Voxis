/**
 * Spoken persona edits are dictionary rows, not trait prose.
 *
 * Big Five and quirk density are stored 0–1 and spoken 0–100.
 * Dominance is stored as VAD −1..1 and spoken on that same 0–100 scale
 * (stored 0 is "fifty"). Expression energy keeps its low|medium|high|very_high
 * enum and also stores energyScore 0–1 so a two-point step is visible.
 *
 * A dictionary delta is in those spoken points, before magnitude.
 * slight ×2, moderate ×4, strong ×8. Moderate is the sample sentence:
 * darker's agreeableness −2 becomes −8, sixty to fifty-two.
 * Funnier's energy +2 at moderate is +8 (fifty to fifty-eight). The
 * "fifty to sixty-five" wording is the sentence shape, not a second delta.
 *
 * Quirk density has no column of its own. "Up" on the funnier row is a
 * 2-point spoken step stored on expressionStyle.quirkDensity.
 * "add more sarcasm" is the sarcastic key, never a trait string.
 */

export const MAGNITUDE_MULTIPLIER = {
  slight: 2,
  moderate: 4,
  strong: 8,
};

export const SHIFT_DICTIONARY = {
  darker: [
    { field: "bigFiveProfile.agreeableness", direction: "down", delta: 2 },
    { field: "bigFiveProfile.neuroticism", direction: "up", delta: 1 },
  ],
  funnier: [
    { field: "expressionStyle.energy", direction: "up", delta: 2 },
    { field: "expressionStyle.quirkDensity", direction: "up", delta: 2 },
  ],
  seductive: [
    { field: "moodBaseline.dominance", direction: "up", delta: 2 },
    { field: "bigFiveProfile.extraversion", direction: "up", delta: 1 },
  ],
  sarcastic: [
    { field: "bigFiveProfile.agreeableness", direction: "down", delta: 2 },
    { field: "moodBaseline.dominance", direction: "up", delta: 1 },
  ],
};

const SHIFT_ALIASES = {
  dark: "darker",
  darker: "darker",
  "more dark": "darker",
  funny: "funnier",
  funnier: "funnier",
  "more funny": "funnier",
  seductive: "seductive",
  "more seductive": "seductive",
  sarcasm: "sarcastic",
  sarcastic: "sarcastic",
  "more sarcasm": "sarcastic",
  "add more sarcasm": "sarcastic",
  "increase sarcasm": "sarcastic",
};

const FIELD_SPECS = {
  "bigFiveProfile.openness": { label: "openness", kind: "unit", fallback: 0.5 },
  "bigFiveProfile.conscientiousness": { label: "conscientiousness", kind: "unit", fallback: 0.5 },
  "bigFiveProfile.extraversion": { label: "extraversion", kind: "unit", fallback: 0.5 },
  "bigFiveProfile.agreeableness": { label: "agreeableness", kind: "unit", fallback: 0.5 },
  "bigFiveProfile.neuroticism": { label: "neuroticism", kind: "unit", fallback: 0.5 },
  "expressionStyle.energy": { label: "energy", kind: "energy" },
  "expressionStyle.quirkDensity": { label: "quirk density", kind: "unit", fallback: 0.5 },
  "moodBaseline.dominance": { label: "dominance", kind: "dominance" },
};

const ENERGY_ANCHOR = { low: 25, medium: 50, high: 75, very_high: 100 };
const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export class SpokenShiftError extends Error {
  constructor(message) {
    super(message);
    this.name = "SpokenShiftError";
  }
}

function clampDisplay(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

function clampUnit(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function spellDisplay(value) {
  const n = clampDisplay(value);
  if (n === 100) return "one hundred";
  if (n < 20) return ONES[n];
  const ten = Math.floor(n / 10);
  const one = n % 10;
  return one ? `${TENS[ten]}-${ONES[one]}` : TENS[ten];
}

export function dominanceSpeechPercent(stored) {
  const n = Number(stored);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(1, Math.max(-1, n));
  return Math.round((clamped + 1) * 50);
}

function dominanceFromDisplay(display) {
  return Math.round(((clampDisplay(display) / 50) - 1) * 1000) / 1000;
}

function unitDisplay(stored, fallback) {
  return clampDisplay(clampUnit(stored, fallback) * 100);
}

function energyDisplay(style) {
  const score = Number(style?.energyScore);
  if (Number.isFinite(score)) return unitDisplay(score, 0.5);
  const level = String(style?.energy || "medium").trim().toLowerCase();
  return ENERGY_ANCHOR[level] ?? 50;
}

function snapEnergy(display) {
  if (display < 37.5) return "low";
  if (display < 62.5) return "medium";
  if (display < 87.5) return "high";
  return "very_high";
}

function readPath(source, path) {
  const [head, tail] = path.split(".");
  const node = source?.[head];
  if (!tail) return node;
  return node?.[tail];
}

function writePath(source, path, value) {
  const [head, tail] = path.split(".");
  const current = source[head] && typeof source[head] === "object" ? source[head] : {};
  source[head] = { ...current, [tail]: value };
}

function aliasToKey(value) {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  return SHIFT_ALIASES[text] || null;
}

function dictionaryRowMatch(entry) {
  const field = String(entry?.field || "").trim();
  const direction = String(entry?.direction || "").trim().toLowerCase();
  const delta = Number(entry?.delta);
  if (!field || (direction !== "up" && direction !== "down") || !Number.isFinite(delta)) {
    return null;
  }
  for (const rows of Object.values(SHIFT_DICTIONARY)) {
    const match = rows.find((row) => row.field === field && row.direction === direction && row.delta === delta);
    if (match) return { ...match };
  }
  return null;
}

function itemsFromInput(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === "string") return [input];
  if (!input || typeof input !== "object") return [];
  if (Array.isArray(input.shifts) && input.shifts.length) return input.shifts;
  if (Array.isArray(input.spec?.shifts) && input.spec.shifts.length) return input.spec.shifts;
  if (Array.isArray(input.changes?.shifts) && input.changes.shifts.length) return input.changes.shifts;
  if (Array.isArray(input.changes?.traits)) return input.changes.traits;
  return [];
}

export function resolveShiftRequest(input) {
  const items = itemsFromInput(input);
  if (!items.length) {
    throw new SpokenShiftError("Name a dictionary shift. Prose traits are not saved.");
  }

  const keys = [];
  for (const item of items) {
    if (typeof item === "string" || typeof item === "number") {
      const key = aliasToKey(item);
      if (!key) {
        throw new SpokenShiftError(`"${item}" is not a dictionary shift. Nothing was saved.`);
      }
      if (!keys.includes(key)) keys.push(key);
      continue;
    }

    if (item && typeof item === "object" && item.key != null && item.field == null) {
      const key = aliasToKey(item.key);
      if (!key) {
        throw new SpokenShiftError(`"${item.key}" is not a dictionary shift. Nothing was saved.`);
      }
      if (!keys.includes(key)) keys.push(key);
      continue;
    }

    const row = dictionaryRowMatch(item);
    if (!row) {
      throw new SpokenShiftError("A shift must be a dictionary key or an exact dictionary row. Nothing was saved.");
    }
    const key = Object.entries(SHIFT_DICTIONARY).find(([, rows]) =>
      rows.some((candidate) => candidate.field === row.field && candidate.direction === row.direction && candidate.delta === row.delta),
    )?.[0];
    if (key && !keys.includes(key)) keys.push(key);
  }

  const entries = keys.flatMap((key) => SHIFT_DICTIONARY[key].map((row) => ({ ...row, key })));
  return { keys, entries };
}

export function describeShiftChanges(changes) {
  const parts = (Array.isArray(changes) ? changes : []).map((change) => {
    const from = spellDisplay(change.beforeDisplay);
    const to = spellDisplay(change.afterDisplay);
    if (change.beforeDisplay === change.afterDisplay) {
      return `leaving ${change.label} at ${from}`;
    }
    const verb = change.direction === "down" ? "lowering" : "raising";
    return `${verb} ${change.label} from ${from} to ${to}`;
  });
  if (!parts.length) return "";
  if (parts.length === 1) return `I'm ${parts[0]}.`;
  return `I'm ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
}

function blankPersonality() {
  return {
    traits: [],
    bigFiveProfile: {
      openness: 0.5,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
    expressionStyle: { energy: "medium", quirkDensity: 0.5 },
    moodBaseline: { valence: 0, arousal: 0, dominance: 0 },
  };
}

function measure(personality, field) {
  const spec = FIELD_SPECS[field];
  if (!spec) {
    throw new SpokenShiftError(`"${field}" is not a measurable shift field.`);
  }
  if (spec.kind === "energy") {
    return energyDisplay(personality.expressionStyle);
  }
  if (spec.kind === "dominance") {
    const stored = readPath(personality, field);
    return dominanceSpeechPercent(stored ?? 0);
  }
  return unitDisplay(readPath(personality, field), spec.fallback);
}

function commit(personality, field, display) {
  const spec = FIELD_SPECS[field];
  const spoken = clampDisplay(display);
  if (spec.kind === "energy") {
    const style = personality.expressionStyle && typeof personality.expressionStyle === "object"
      ? personality.expressionStyle
      : {};
    personality.expressionStyle = {
      ...style,
      energyScore: spoken / 100,
      energy: snapEnergy(spoken),
    };
    return;
  }
  if (spec.kind === "dominance") {
    writePath(personality, field, dominanceFromDisplay(spoken));
    return;
  }
  writePath(personality, field, spoken / 100);
}

export function applySpokenShifts(personality, shifts, magnitude) {
  const multiplier = MAGNITUDE_MULTIPLIER[String(magnitude || "").trim().toLowerCase()];
  if (!multiplier) {
    throw new SpokenShiftError("Choose a magnitude: slight, moderate, or strong.");
  }
  const resolved = resolveShiftRequest(shifts);
  const next = structuredClone(personality && typeof personality === "object" ? personality : blankPersonality());
  next.traits = Array.isArray(next.traits) ? [...next.traits] : [];

  const appliedByField = new Map();
  const directionByField = new Map();
  for (const entry of resolved.entries) {
    const sign = entry.direction === "down" ? -1 : 1;
    appliedByField.set(entry.field, (appliedByField.get(entry.field) || 0) + (sign * entry.delta * multiplier));
    if (!directionByField.has(entry.field)) {
      directionByField.set(entry.field, entry.direction);
    }
  }

  const changes = [];
  for (const [field, applied] of appliedByField) {
    const beforeDisplay = measure(next, field);
    const afterDisplay = clampDisplay(beforeDisplay + applied);
    const direction = afterDisplay === beforeDisplay
      ? directionByField.get(field)
      : (afterDisplay < beforeDisplay ? "down" : "up");
    commit(next, field, afterDisplay);
    changes.push({
      field,
      label: FIELD_SPECS[field].label,
      direction,
      delta: Math.abs(applied),
      beforeDisplay,
      afterDisplay,
    });
  }

  return {
    personality: next,
    keys: resolved.keys,
    entries: resolved.entries,
    changes,
    sentence: describeShiftChanges(changes),
    magnitude: String(magnitude).trim().toLowerCase(),
  };
}

export function previewSpokenShifts(personality, shifts) {
  const source = personality && typeof personality === "object" ? personality : blankPersonality();
  const resolved = resolveShiftRequest(shifts);
  const magnitudes = {};
  for (const magnitude of Object.keys(MAGNITUDE_MULTIPLIER)) {
    const applied = applySpokenShifts(source, resolved.keys, magnitude);
    magnitudes[magnitude] = {
      sentence: applied.sentence,
      changes: applied.changes,
    };
  }
  return {
    keys: resolved.keys,
    entries: resolved.entries,
    magnitudes,
  };
}

export function pickCoreValues(body = {}) {
  const values = Array.isArray(body.values) ? body.values : null;
  const coreValues = Array.isArray(body.coreValues) ? body.coreValues : null;
  const filled = (items) => items?.some((item) => String(item || "").trim());
  if (filled(values)) return values;
  if (filled(coreValues)) return coreValues;
  if (values) return values;
  if (coreValues) return coreValues;
  return [];
}

const CARRIED_FIELDS = [
  "name",
  "description",
  "traits",
  "quirks",
  "mood",
  "systemPrompt",
  "sourceQuery",
  "sourceUrls",
  "researchSummary",
  "speechStyle",
  "notablePhrases",
  "researchSources",
  "voiceProfile",
  "behaviorRules",
  "goals",
  "values",
  "creativeContext",
  "moodBaseline",
  "moodState",
  "moodSensitivity",
  "expressionProfile",
  "bigFiveProfile",
  "alignmentProfile",
  "responseFocusProfile",
  "expressionStyle",
  "stateFlaws",
  "vocalMannerisms",
  "gender",
  "avatarImageUrl",
  "singingProfile",
  "emotionDrift",
  "llmConfig",
];

export function carryPersonality(existing, overrides = {}) {
  const carried = {};
  for (const field of CARRIED_FIELDS) {
    carried[field] = existing?.[field];
  }
  return {
    ...carried,
    ...overrides,
  };
}
