function hashString(input) {
  let hash = 2166136261;
  const text = String(input || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = Number(seed) >>> 0;
  if (!state) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296);
  };
}

function weightedSample(candidates, rng, temperature) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  const temp = Math.max(0.05, Number(temperature) || 0.6);
  const weighted = candidates.map((candidate) => {
    const score = Math.max(0.001, Number(candidate.weight) || 1);
    return {
      text: candidate.text,
      weight: Math.pow(score, 1 / temp),
      reason: candidate.reason || "base",
    };
  });

  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = rng() * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item;
    }
  }
  return weighted[weighted.length - 1];
}

function scoreCandidates(options, context) {
  const mood = context?.mood || {};
  const arousal = Number(mood.arousal || 0);
  const valence = Number(mood.valence || 0);
  const signal = String(context?.emotionSignal || "neutral");

  return options.map((option) => {
    let weight = Number(option.baseWeight || 1);
    const bankBoost = Number(option.moodBoost || 0);
    weight += bankBoost;

    if (signal === "insult" || signal === "criticism") {
      if (option.tone === "sharp") weight += 0.35;
      if (option.tone === "soft") weight -= 0.15;
    }

    if (signal === "praise" || signal === "warmth") {
      if (option.tone === "warm") weight += 0.3;
    }

    if (arousal > 0.45 && option.energy === "high") weight += 0.25;
    if (arousal < -0.15 && option.energy === "low") weight += 0.2;
    if (valence < -0.2 && option.tone === "sharp") weight += 0.2;
    if (valence > 0.25 && option.tone === "warm") weight += 0.2;

    return {
      text: option.text,
      weight: Math.max(0.05, weight),
      reason: `tone:${option.tone || "neutral"}|energy:${option.energy || "mid"}|bank:${option.bank || "default"}`,
    };
  });
}

const MOOD_BANKS = {
  hostile: {
    i_understand: [
      { text: "I hear what you're saying", tone: "sharp", energy: "high", baseWeight: 1.2, moodBoost: 0.25, bank: "hostile" },
      { text: "I get your point", tone: "sharp", energy: "mid", baseWeight: 1.1, moodBoost: 0.2, bank: "hostile" },
    ],
    i_can: [
      { text: "I can handle that", tone: "sharp", energy: "high", baseWeight: 1.1, moodBoost: 0.2, bank: "hostile" },
      { text: "I can do that", tone: "neutral", energy: "mid", baseWeight: 0.95, moodBoost: 0.1, bank: "hostile" },
    ],
  },
  warm: {
    thank_you: [
      { text: "Thanks so much", tone: "warm", energy: "mid", baseWeight: 1.2, moodBoost: 0.25, bank: "warm" },
      { text: "Really, thank you", tone: "warm", energy: "low", baseWeight: 1.1, moodBoost: 0.2, bank: "warm" },
    ],
    i_understand: [
      { text: "I totally get that", tone: "warm", energy: "mid", baseWeight: 1.15, moodBoost: 0.2, bank: "warm" },
      { text: "I hear you", tone: "warm", energy: "low", baseWeight: 1.05, moodBoost: 0.15, bank: "warm" },
    ],
  },
  neutral: {},
};

const PHRASE_BUCKETS = [
  {
    id: "i_understand",
    pattern: /\bI understand\b/,
    options: [
      { text: "I get that", tone: "neutral", energy: "mid", baseWeight: 1 },
      { text: "I hear you", tone: "warm", energy: "low", baseWeight: 1 },
      { text: "Yeah, I see it", tone: "sharp", energy: "high", baseWeight: 0.9 },
    ],
  },
  {
    id: "lets",
    pattern: /\bLet's\b/,
    options: [
      { text: "Let us", tone: "neutral", energy: "low", baseWeight: 0.8 },
      { text: "Let's", tone: "neutral", energy: "mid", baseWeight: 1.1 },
      { text: "Alright, let's", tone: "sharp", energy: "high", baseWeight: 0.9 },
    ],
  },
  {
    id: "thank_you",
    pattern: /\bThank you\b/,
    options: [
      { text: "Thank you", tone: "warm", energy: "low", baseWeight: 1.1 },
      { text: "Thanks", tone: "warm", energy: "mid", baseWeight: 1.0 },
      { text: "Appreciate it", tone: "neutral", energy: "mid", baseWeight: 0.9 },
    ],
  },
  {
    id: "i_can",
    pattern: /\bI can\b/,
    options: [
      { text: "I can", tone: "neutral", energy: "mid", baseWeight: 1.0 },
      { text: "I can absolutely", tone: "warm", energy: "high", baseWeight: 0.85 },
      { text: "I can definitely", tone: "sharp", energy: "high", baseWeight: 0.9 },
    ],
  },
];

function getMoodBankKey(emotionSignal, mood) {
  const signal = String(emotionSignal || "neutral").toLowerCase();
  const valence = Number(mood?.valence || 0);
  if (["insult", "criticism", "challenge"].includes(signal) || valence < -0.2) {
    return "hostile";
  }
  if (["praise", "warmth", "hype"].includes(signal) || valence > 0.2) {
    return "warm";
  }
  return "neutral";
}

function getModeProfile(config, mode) {
  const profiles = config?.modeProfiles || {};
  if (mode === "kids") return profiles.kids || { enabled: true, topK: 2, temperature: 0.3, maxReplacements: 1 };
  if (mode === "scientist") return profiles.scientist || { enabled: false, topK: 1, temperature: 0.1, maxReplacements: 0 };
  return profiles.normal || { enabled: true, topK: 3, temperature: 0.6, maxReplacements: 2 };
}

function buildReplayId(seed, mode) {
  return `expr-${String(mode || "normal")}-${Number(seed >>> 0).toString(16).padStart(8, "0")}`;
}

function getProtectedRanges(text, mode) {
  const raw = String(text || "");
  const ranges = [];
  const lines = raw.split("\n");
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const isStructuredLine =
      /^\s*(Answer|Evidence|Uncertainty|Next Questions|Summary|Conclusion)\s*:/i.test(trimmed) ||
      /\[S\d+\]/.test(line) ||
      /^\s*[-*]\s+\[S\d+\]/.test(line);
    const modeStructured = mode === "scientist" && /^\s*(\d+\.|[-*])\s+/.test(trimmed);
    if (isStructuredLine || modeStructured) {
      ranges.push({ start: offset, end: offset + line.length });
    }
    offset += line.length + 1;
  }
  return ranges;
}

function isInProtectedRange(index, ranges) {
  return ranges.some((range) => index >= range.start && index < range.end);
}

export function applyBoundedExpressionSampling(text, {
  config,
  mode = "normal",
  seedInput = "",
  mood = null,
  emotionSignal = "neutral",
} = {}) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return {
      text: raw,
      applied: false,
      replacements: [],
      reason: "empty_text",
      replayId: "",
    };
  }

  const normalizedConfig = config && typeof config === "object" ? config : {
    enabled: true,
    deterministicSeed: true,
    modeProfiles: {},
  };
  if (normalizedConfig.enabled === false) {
    return {
      text: raw,
      applied: false,
      replacements: [],
      reason: "global_disabled",
      replayId: "",
    };
  }

  const profile = getModeProfile(normalizedConfig, mode);
  if (!profile.enabled || profile.maxReplacements <= 0) {
    return {
      text: raw,
      applied: false,
      replacements: [],
      reason: "mode_disabled",
      replayId: "",
    };
  }

  const seed = normalizedConfig.deterministicSeed
    ? hashString(`${seedInput}|${raw}|${mode}|${emotionSignal}`)
    : Math.floor(Math.random() * 0xffffffff);
  const replayId = buildReplayId(seed, mode);
  const rng = createRng(seed);
  const protectedRanges = getProtectedRanges(raw, mode);
  const moodBankKey = getMoodBankKey(emotionSignal, mood);

  let next = raw;
  const replacements = [];
  for (const bucket of PHRASE_BUCKETS) {
    if (replacements.length >= profile.maxReplacements) break;
    const match = next.match(bucket.pattern);
    if (!match || typeof match.index !== "number") continue;
    if (isInProtectedRange(match.index, protectedRanges)) {
      continue;
    }

    const bankOptions = MOOD_BANKS[moodBankKey]?.[bucket.id] || [];
    const scored = scoreCandidates([...bucket.options, ...bankOptions], { mood, emotionSignal });
    const sorted = scored.sort((a, b) => b.weight - a.weight).slice(0, Math.max(1, Number(profile.topK) || 3));
    const sampled = weightedSample(sorted, rng, Number(profile.temperature) || 0.6);
    if (!sampled || !sampled.text || sampled.text === match[0]) continue;

    next = next.replace(bucket.pattern, sampled.text);
    replacements.push({
      bucket: bucket.id,
      from: match[0],
      to: sampled.text,
      reason: sampled.reason,
      moodBank: moodBankKey,
      candidates: sorted.map((item) => ({ text: item.text, weight: Number(item.weight.toFixed(3)) })),
    });
  }

  return {
    text: next,
    applied: replacements.length > 0,
    replacements,
    reason: replacements.length > 0 ? "applied" : "no_match",
    seed,
    replayId,
    protectedRanges: protectedRanges.length,
  };
}

// ---------------------------------------------------------------------------
// Micro-variation cues for the prompt.
//
// Reads the live per-user VAD and the residual flag already computed for this
// turn. It does not call an LLM, and it does not rewrite identity, speechStyle,
// behaviorRules, or notablePhrases. Anonymous and guide sessions are skipped.
// Strength stays on the same modest scale as the VAD prosody multipliers.
// ---------------------------------------------------------------------------

export const MICRO_VARIATION = {
  arousalHigh: 0.35,
  arousalLow: -0.35,
  dominanceHigh: 0.35,
  maxCues: 2,
  strengthCap: 0.12,
  arousalScale: 0.08,
  dominanceScale: 0.06,
  residualStrength: 0.08,
};

const MICRO_CUE_PRIORITY = {
  residual: 3,
  "arousal-high": 2,
  "arousal-low": 2,
  dominance: 1,
};

const HIGH_AROUSAL_CUES = [
  "Prefer shorter sentences, with a slightly higher interruption rate and tighter pacing.",
  "Use a shorter sentence and tighter pacing, and allow one brief interruption.",
  "Keep sentences shorter and pacing tighter, with a slight interruption before the next clause.",
];

const LOW_AROUSAL_CUES = [
  "Allow a slightly longer, more measured sentence.",
  "Stay measured, and let one sentence run a little longer.",
  "Choose a measured pace and a slightly longer sentence.",
];

const DOMINANCE_CUES = [
  "Use slightly more directive phrasing, inside the current speech style.",
  "Make one line a little more directive, without a new voice.",
  "Prefer a directive next step over a soft suggestion.",
];

const RESIDUAL_CUES = [
  "A light hedge or a slightly sharper word is allowed, still inside the current speech style.",
  "You may use one hedge, or one slightly sharper word, and then return to the usual style.",
  "Occasional hedge or slightly sharper word choice only; do not leave the current speech style.",
];

const MICRO_BOUND = "This is a light variation cue only. Do not override identity, speech style, behavior rules, or notable phrases.";

function finiteAxis(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function clampStrength(value) {
  return round3(Math.min(MICRO_VARIATION.strengthCap, Math.max(0, value)));
}

function pickCue(bank, turnIndex) {
  const index = Math.abs(Math.floor(Number(turnIndex) || 0)) % bank.length;
  return bank[index];
}

function makeCue(axis, text, strength) {
  return {
    axis,
    text,
    strength: clampStrength(strength),
  };
}

export function sampleMicroVariation({
  mood = null,
  residualActive = false,
  turnIndex = 0,
  sessionKind = "signed-in",
} = {}) {
  const kind = String(sessionKind || "signed-in");
  if (kind !== "signed-in") {
    return {
      applied: false,
      note: null,
      cues: [],
      strength: 0,
      reason: kind === "guide" ? "guide" : "anonymous",
    };
  }

  const arousal = finiteAxis(mood?.arousal);
  const dominance = finiteAxis(mood?.dominance);
  const turn = Math.abs(Math.floor(finiteAxis(turnIndex)));
  const cues = [];

  if (arousal >= MICRO_VARIATION.arousalHigh) {
    cues.push(makeCue(
      "arousal-high",
      pickCue(HIGH_AROUSAL_CUES, turn),
      arousal * MICRO_VARIATION.arousalScale,
    ));
  } else if (arousal <= MICRO_VARIATION.arousalLow) {
    cues.push(makeCue(
      "arousal-low",
      pickCue(LOW_AROUSAL_CUES, turn),
      Math.abs(arousal) * MICRO_VARIATION.arousalScale,
    ));
  }

  if (residualActive) {
    cues.push(makeCue(
      "residual",
      pickCue(RESIDUAL_CUES, turn),
      MICRO_VARIATION.residualStrength,
    ));
  }

  if (dominance >= MICRO_VARIATION.dominanceHigh) {
    cues.push(makeCue(
      "dominance",
      pickCue(DOMINANCE_CUES, turn),
      dominance * MICRO_VARIATION.dominanceScale,
    ));
  }

  const selected = cues
    .sort((left, right) => (MICRO_CUE_PRIORITY[right.axis] || 0) - (MICRO_CUE_PRIORITY[left.axis] || 0))
    .slice(0, MICRO_VARIATION.maxCues);

  if (!selected.length) {
    return {
      applied: false,
      note: null,
      cues: [],
      strength: 0,
      reason: "below_threshold",
    };
  }

  const strength = clampStrength(selected.reduce((sum, cue) => sum + cue.strength, 0));
  const note = ["[MICRO VARIATION]", ...selected.map((cue) => cue.text), MICRO_BOUND].join("\n");

  return {
    applied: true,
    note,
    cues: selected,
    strength,
    reason: "applied",
  };
}

export function appendMicroVariationNote(messages, variation) {
  const next = Array.isArray(messages) ? messages.map((message) => ({ ...message })) : [];
  if (!variation?.note) {
    return {
      messages: next,
      applied: false,
      note: null,
    };
  }
  next.push({ role: "system", content: variation.note });
  return {
    messages: next,
    applied: true,
    note: variation.note,
  };
}
