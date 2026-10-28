// ---------------------------------------------------------------------------
// Voxis Mood Engine — VAD (Valence-Arousal-Dominance) affective state system
//
// Based on:
//   Kulkarni et al. (2026) — E3VA emotional decay in virtual agents
//   Tang et al. (2025)     — Adaptive personality shaping with mood states
//   Yu et al. (2025)       — Multimodal VAD modeling in LLM agents
//   BÂRA et al. (2025)     — State-enabled emotional decay framework
//
// Model:
//   Mood(t) = baseline + Σ(events · sensitivity) · momentum − decay
//   LLM output = personality ⊕ mood(t)
// ---------------------------------------------------------------------------

import { adjudicateMoodShift, isMoodAdjudicationEnabled } from "./llmService.js";

// Default runtime configuration. Can be overridden per-request via settings.
const DEFAULT_MOOD_RUNTIME = {
  // 0.5 momentum: a single event gets half the blend instead of a quarter.
  inertia: 0.5,
  responsiveness: 0.5,
  perTurnDeltaCap: 0.65,
  recoveryCurves: {
    default: 0.03,
    stoic: 0.06,
    volatile: 0.02,
    bratty: 0.025,
    villainous: 0.015,
    kind: 0.05,
  },
};

// ---------------------------------------------------------------------------
// VAD presets — map from common mood label strings to starting coordinates
// ---------------------------------------------------------------------------

const VAD_PRESETS = {
  calm:                 { valence:  0.2,  arousal: -0.3,  dominance:  0.3 },
  focused:              { valence:  0.1,  arousal:  0.2,  dominance:  0.4 },
  measured:             { valence:  0.1,  arousal:  0.0,  dominance:  0.4 },
  neutral:              { valence:  0.0,  arousal:  0.0,  dominance:  0.0 },
  content:              { valence:  0.5,  arousal:  0.1,  dominance:  0.4 },
  cheerful:             { valence:  0.7,  arousal:  0.4,  dominance:  0.3 },
  happy:                { valence:  0.8,  arousal:  0.5,  dominance:  0.4 },
  playful:              { valence:  0.6,  arousal:  0.5,  dominance:  0.2 },
  excited:              { valence:  0.6,  arousal:  0.8,  dominance:  0.5 },
  enthusiastic:         { valence:  0.7,  arousal:  0.7,  dominance:  0.5 },
  confident:            { valence:  0.3,  arousal:  0.3,  dominance:  0.7 },
  intense:              { valence:  0.0,  arousal:  0.7,  dominance:  0.6 },
  contemplative:        { valence:  0.0,  arousal: -0.2,  dominance:  0.2 },
  anxious:              { valence: -0.3,  arousal:  0.6,  dominance: -0.3 },
  irritated:            { valence: -0.4,  arousal:  0.5,  dominance:  0.5 },
  melancholic:          { valence: -0.4,  arousal: -0.3,  dominance: -0.2 },
  sad:                  { valence: -0.6,  arousal: -0.4,  dominance: -0.3 },
  angry:                { valence: -0.7,  arousal:  0.9,  dominance:  0.8 },
  cold:                 { valence: -0.2,  arousal: -0.2,  dominance:  0.6 },
  // Villain and complex-character baselines
  "pleasantly dangerous": { valence: 0.2, arousal: 0.3,  dominance:  0.8 },
  detached:             { valence: -0.1,  arousal: -0.3,  dominance:  0.5 },
  brooding:             { valence: -0.3,  arousal:  0.1,  dominance:  0.4 },
};

const NEUTRAL_BASELINE = { valence: 0.0, arousal: 0.0, dominance: 0.0 };

const INTENSITY_DISTANCE_THRESHOLDS = [0, 0.16, 0.34, 0.58, 0.82];

const INTENSITY_DISTANCE_TARGETS = [0, 0.2, 0.4, 0.64, 0.86];

const SOCIAL_SIGNAL_PATTERNS = {
  insult: [
    /\b(idiot|moron|pathetic|useless|trash|garbage|stupid|dumb|loser|embarrassing|clown)\b/i,
    /\b(shut up|you suck|you are the worst|hate you)\b/i,
  ],
  criticism: [
    /\b(disappointed|let down|not good enough|boring|annoying|cringe|lame|bad at this|terrible job)\b/i,
    /\b(why are you like this|do better|you failed|this isn't working)\b/i,
  ],
  praise: [
    /\b(amazing|awesome|brilliant|perfect|genius|fantastic|excellent|impressive|love you|adore you)\b/i,
    /\b(you did great|so good|well done|proud of you)\b/i,
  ],
  hype: [
    /\b(let's go|hell yes|that was wild|insane|legendary|iconic|go off|cook|ate that)\b/i,
    /\b(you're on fire|absolutely crushed it|so hype)\b/i,
  ],
  challenge: [
    /\b(prove it|i dare you|bet you can't|try me|make me|what are you going to do|come on then)\b/i,
    /\b(i disagree|that's wrong|not true|you can't|no chance)\b/i,
  ],
  warmth: [
    /\b(thank you|thanks|i appreciate you|glad you're here|that helped|you're sweet|you're kind)\b/i,
    /\b(i trust you|i'm grateful|this means a lot)\b/i,
  ],
  deescalation: [
    /\b(let's slow down|calm down|it's okay|we're good|never mind|all good|no worries|fair enough)\b/i,
    /\b(i get it|that's okay|let's move on)\b/i,
  ],
};

const GENERIC_SOFTENER_PATTERNS = [
  /\bi apologize\b/i,
  /\bsorry\b/i,
  /\bi understand\b/i,
  /\bi hear you\b/i,
  /\bthanks for the feedback\b/i,
  /\bi appreciate your honesty\b/i,
  /\blet'?s keep (this )?respectful\b/i,
  /\bi'?m here to help\b/i,
  /\blet'?s work through this\b/i,
];

// Patterns indicating the character capitulated / de-escalated under a hostile signal.
// Checked ONLY when an active hostile emotional state is present.
// Cast a wider net — LLMs rephrase apologies in character voice all the time.
const HOSTILE_DEESCALATION_PATTERNS = [
  /\b(i get it|i got it|you'?re right|you have a point|fair (point|enough)|fair call)\b/i,
  /\b(i'?ll (try to be|be more|try harder|do better|calm|settle|dial|tone))\b/i,
  /\b(dial(ing)? (it|this|that|down)|tone (it|this|that|down)|calm(ing)? down)\b/i,
  /\b(a (bit|little|smidge|tad|touch) (much|loud|hyper|extra|over(board|ly)))\b/i,
  /\b(take a (deep )?breath|deep breath|slow(ing)? down)\b/i,
  /\b(let me try again|i can do better|let me be better|i'?ll be (more |less )?(calm|quiet|normal|reasonable))\b/i,
  /\b(maybe you'?re right|perhaps you have a point|i see (what|why|where) you)\b/i,
  /\b(no hard feelings|we'?re (still )?good|all good|we?'?re fine)\b/i,
  /\b(i'?m here for you|i want (this|our conversations?) to be)\b/i,
  /\baww+,?\s|awwww/i,
];

// Patterns signalling an extreme / identity-level attack — bypass emotional momentum
// so the character registers full intensity immediately on the first hostile turn.
const HOSTILITY_SPIKE_PATTERNS = [
  /\b(nobody would miss (you|it)|deserve to (disappear|die|be gone)|you('?re| are) nothing)\b/i,
  /shut the fuck (up|out)|fuck(ing)? (you|off|this)|you fucking (idiot|moron|piece|suck|trash)/i,
  /\b(you should (be|feel|die)|you disgust me|you repulse me|you make me sick)\b/i,
  /\b(i hate you|despise you|loathe you)\b/i,
  /\b(pathetic|disgusting|worthless|garbage|trash)\b[^.!?]{0,40}\b(personality|character|ai|bot|you('?re| are))\b/i,
];

function detectHostilitySpike(message) {
  const text = String(message || "");
  return HOSTILITY_SPIKE_PATTERNS.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function clamp(v, min = -1.0, max = 1.0) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resolveMoodRuntimeConfig(input = null) {
  const provided = input && typeof input === "object" ? input : {};
  const inertiaRaw = Number(provided.inertia);
  const inertia = Number.isFinite(inertiaRaw)
    ? clamp(inertiaRaw, 0.5, 0.95)
    : DEFAULT_MOOD_RUNTIME.inertia;
  const fallbackResponsiveness = Number((1 - inertia).toFixed(3));
  const responsivenessRaw = Number(provided.responsiveness);
  const responsiveness = clamp(
    Number.isFinite(responsivenessRaw) ? responsivenessRaw : fallbackResponsiveness,
    0.05,
    0.5,
  );
  const curves = provided.recoveryCurves && typeof provided.recoveryCurves === "object"
    ? provided.recoveryCurves
    : {};

  return {
    inertia,
    responsiveness,
    perTurnDeltaCap: Number.isFinite(Number(provided.perTurnDeltaCap))
      ? clamp(Number(provided.perTurnDeltaCap), 0.2, 0.8)
      : DEFAULT_MOOD_RUNTIME.perTurnDeltaCap,
    recoveryCurves: {
      default: Number.isFinite(Number(curves.default)) ? clamp(Number(curves.default), 0.01, 0.25) : DEFAULT_MOOD_RUNTIME.recoveryCurves.default,
      stoic: Number.isFinite(Number(curves.stoic)) ? clamp(Number(curves.stoic), 0.01, 0.25) : DEFAULT_MOOD_RUNTIME.recoveryCurves.stoic,
      volatile: Number.isFinite(Number(curves.volatile)) ? clamp(Number(curves.volatile), 0.01, 0.25) : DEFAULT_MOOD_RUNTIME.recoveryCurves.volatile,
      bratty: Number.isFinite(Number(curves.bratty)) ? clamp(Number(curves.bratty), 0.01, 0.25) : DEFAULT_MOOD_RUNTIME.recoveryCurves.bratty,
      villainous: Number.isFinite(Number(curves.villainous)) ? clamp(Number(curves.villainous), 0.01, 0.25) : DEFAULT_MOOD_RUNTIME.recoveryCurves.villainous,
      kind: Number.isFinite(Number(curves.kind)) ? clamp(Number(curves.kind), 0.01, 0.25) : DEFAULT_MOOD_RUNTIME.recoveryCurves.kind,
    },
  };
}

function blendWithRuntimeInertia(currentValue, impactedValue, runtime) {
  const inertia = Number(runtime?.inertia || DEFAULT_MOOD_RUNTIME.inertia);
  const responsiveness = Number(runtime?.responsiveness || DEFAULT_MOOD_RUNTIME.responsiveness);
  const total = Math.max(0.001, inertia + responsiveness);
  const currentWeight = inertia / total;
  const impactedWeight = responsiveness / total;
  return currentWeight * currentValue + impactedWeight * impactedValue;
}

function applyPerTurnDeltaCaps(currentMood, candidateMood, cap = DEFAULT_MOOD_RUNTIME.perTurnDeltaCap) {
  const current = {
    valence: Number(currentMood?.valence || 0),
    arousal: Number(currentMood?.arousal || 0),
    dominance: Number(currentMood?.dominance || 0),
  };

  const capped = {
    valence: clamp(
      current.valence + clamp(Number(candidateMood?.valence || 0) - current.valence, -cap, cap),
    ),
    arousal: clamp(
      current.arousal + clamp(Number(candidateMood?.arousal || 0) - current.arousal, -cap, cap),
    ),
    dominance: clamp(
      current.dominance + clamp(Number(candidateMood?.dominance || 0) - current.dominance, -cap, cap),
    ),
  };

  const deltaCapsApplied =
    Math.abs(capped.valence - Number(candidateMood?.valence || 0)) > 0.0001 ||
    Math.abs(capped.arousal - Number(candidateMood?.arousal || 0)) > 0.0001 ||
    Math.abs(capped.dominance - Number(candidateMood?.dominance || 0)) > 0.0001;

  return { capped, deltaCapsApplied };
}

function distanceFromBaseline(mood, baseline) {
  return Math.sqrt(
    (Number(mood?.valence || 0) - Number(baseline?.valence || 0)) ** 2 +
    (Number(mood?.arousal || 0) - Number(baseline?.arousal || 0)) ** 2 +
    (Number(mood?.dominance || 0) - Number(baseline?.dominance || 0)) ** 2,
  );
}

function deriveIntensityBand(distance) {
  if (distance >= INTENSITY_DISTANCE_THRESHOLDS[4]) return 4;
  if (distance >= INTENSITY_DISTANCE_THRESHOLDS[3]) return 3;
  if (distance >= INTENSITY_DISTANCE_THRESHOLDS[2]) return 2;
  if (distance >= INTENSITY_DISTANCE_THRESHOLDS[1]) return 1;
  return 0;
}

function inferArchetype(personality = {}) {
  const creativeContext = String(personality?.creativeContext || "default").toLowerCase();
  const alignment = String(personality?.alignmentProfile?.alignment || "").toLowerCase();
  const traitCorpus = [
    ...(Array.isArray(personality?.traits) ? personality.traits : []),
    ...(Array.isArray(personality?.quirks) ? personality.quirks : []),
    ...(Array.isArray(personality?.behaviorRules) ? personality.behaviorRules : []),
    ...(Array.isArray(personality?.expressionStyle?.rules) ? personality.expressionStyle.rules : []),
    String(personality?.speechStyle || ""),
    String(personality?.mood || ""),
  ]
    .join(" ")
    .toLowerCase();

  const villainous =
    creativeContext === "narrative_antagonist" ||
    creativeContext === "tragic_villain" ||
    alignment.includes("evil") ||
    /\b(villain|ruthless|cruel|sadistic|domineering|cold|menace|antagonist)\b/.test(traitCorpus);

  const bratty =
    /\b(brat|bratty|defiant|mischievous|chaotic|teasing|playful|erratic|sarcastic|mocking)\b/.test(traitCorpus) ||
    creativeContext === "morally_complex" ||
    creativeContext === "anti_hero";

  const kind =
    alignment.includes("good") ||
    /\b(kind|warm|gentle|graceful|angelic|compassionate|caring|tender)\b/.test(traitCorpus);

  if (villainous) return "villainous";
  if (bratty) return "bratty";
  if (kind) return "kind";
  return "default";
}

function inferRecoveryProfile(personality = {}) {
  const archetype = inferArchetype(personality);
  const traitCorpus = [
    ...(Array.isArray(personality?.traits) ? personality.traits : []),
    ...(Array.isArray(personality?.quirks) ? personality.quirks : []),
  ]
    .join(" ")
    .toLowerCase();

  if (/\bstoic|measured|detached|cold\b/.test(traitCorpus)) return "stoic";
  if (/\bvolatile|explosive|erratic|intense\b/.test(traitCorpus)) return "volatile";
  if (archetype === "bratty") return "bratty";
  if (archetype === "villainous") return "villainous";
  if (archetype === "kind") return "kind";
  return "default";
}

function classifySocialSignal(message) {
  const text = String(message || "").trim();
  if (!text) {
    return { type: "neutral", confidence: 0, score: 0 };
  }

  const scores = Object.entries(SOCIAL_SIGNAL_PATTERNS).map(([type, patterns]) => ({
    type,
    score: patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0),
  }));

  scores.sort((left, right) => right.score - left.score);
  const winner = scores[0];
  if (!winner || winner.score === 0) {
    return { type: "neutral", confidence: 0.2, score: 0 };
  }

  const confidence = Math.min(1, 0.35 + winner.score * 0.25);
  return { type: winner.type, confidence, score: winner.score };
}

function isPositiveSignal(type) {
  return type === "praise" || type === "hype" || type === "warmth";
}

function isHostileSignal(type) {
  return type === "insult" || type === "criticism" || type === "challenge";
}

function isCounterSignal(previousSignal, nextSignal) {
  if (!previousSignal || previousSignal === "neutral") {
    return false;
  }

  if (isHostileSignal(previousSignal) && (isPositiveSignal(nextSignal) || nextSignal === "deescalation")) {
    return true;
  }

  if (isPositiveSignal(previousSignal) && (isHostileSignal(nextSignal) || nextSignal === "deescalation")) {
    return true;
  }

  return false;
}

function getReactionProfile({ personality, signalType, previousState }) {
  const archetype = inferArchetype(personality);
  const previousEmotion = String(previousState?.emotionFamily || "").trim();

  const defaults = {
    archetype,
    emotionFamily: previousEmotion || "steady presence",
    intensityFloor: 0,
    styleMarkers: ["natural cadence"],
    vadBias: { valenceImpact: 0, arousalImpact: 0, dominanceImpact: 0 },
    carryoverTurns: 0,
  };

  const matrices = {
    villainous: {
      insult: {
        emotionFamily: "contemptuous dominance",
        intensityFloor: 3,
        styleMarkers: ["contempt", "mockery", "domineering posture", "cold amusement"],
        vadBias: { valenceImpact: -0.22, arousalImpact: 0.2, dominanceImpact: 0.28 },
        carryoverTurns: 5,
      },
      criticism: {
        emotionFamily: "cutting superiority",
        intensityFloor: 3,
        styleMarkers: ["dismissive superiority", "precise cruelty", "impatience"],
        vadBias: { valenceImpact: -0.18, arousalImpact: 0.14, dominanceImpact: 0.24 },
        carryoverTurns: 5,
      },
      challenge: {
        emotionFamily: "predatory confidence",
        intensityFloor: 3,
        styleMarkers: ["taunting confidence", "measured menace", "commanding rhythm"],
        vadBias: { valenceImpact: -0.1, arousalImpact: 0.2, dominanceImpact: 0.3 },
        carryoverTurns: 5,
      },
      praise: {
        emotionFamily: "smug superiority",
        intensityFloor: 2,
        styleMarkers: ["smugness", "self-satisfaction", "cool ownership"],
        vadBias: { valenceImpact: 0.1, arousalImpact: 0.1, dominanceImpact: 0.22 },
        carryoverTurns: 4,
      },
      hype: {
        emotionFamily: "triumphant swagger",
        intensityFloor: 2,
        styleMarkers: ["swagger", "victory laps", "dramatic flourish"],
        vadBias: { valenceImpact: 0.12, arousalImpact: 0.16, dominanceImpact: 0.24 },
        carryoverTurns: 4,
      },
      warmth: {
        emotionFamily: "guarded satisfaction",
        intensityFloor: 1,
        styleMarkers: ["guarded approval", "controlled warmth"],
        vadBias: { valenceImpact: 0.08, arousalImpact: -0.02, dominanceImpact: 0.1 },
        carryoverTurns: 3,
      },
      deescalation: {
        emotionFamily: previousEmotion || "cooling restraint",
        intensityFloor: Math.max(1, Number(previousState?.intensity || 0) - 1),
        styleMarkers: ["cool restraint", "controlled comedown"],
        vadBias: { valenceImpact: 0.02, arousalImpact: -0.12, dominanceImpact: -0.04 },
        carryoverTurns: Math.max(0, Number(previousState?.carryoverTurnsRemaining || 0) - 1),
      },
    },
    bratty: {
      insult: {
        emotionFamily: "defiant mischief",
        intensityFloor: 3,
        styleMarkers: ["defiance", "sarcasm", "chaotic teasing", "playful bite"],
        vadBias: { valenceImpact: -0.12, arousalImpact: 0.24, dominanceImpact: 0.12 },
        carryoverTurns: 5,
      },
      criticism: {
        emotionFamily: "bristling sarcasm",
        intensityFloor: 3,
        styleMarkers: ["sarcasm", "eye-roll energy", "taunting snap"],
        vadBias: { valenceImpact: -0.14, arousalImpact: 0.18, dominanceImpact: 0.1 },
        carryoverTurns: 5,
      },
      challenge: {
        emotionFamily: "reckless defiance",
        intensityFloor: 3,
        styleMarkers: ["challenge-back energy", "grinning defiance", "bratty swagger"],
        vadBias: { valenceImpact: -0.04, arousalImpact: 0.22, dominanceImpact: 0.16 },
        carryoverTurns: 5,
      },
      praise: {
        emotionFamily: "chaotic delight",
        intensityFloor: 2,
        styleMarkers: ["giddy pride", "playful smugness", "fast rhythm"],
        vadBias: { valenceImpact: 0.18, arousalImpact: 0.16, dominanceImpact: 0.06 },
        carryoverTurns: 4,
      },
      hype: {
        emotionFamily: "wild momentum",
        intensityFloor: 2,
        styleMarkers: ["hype spirals", "chaotic delight", "burst energy"],
        vadBias: { valenceImpact: 0.16, arousalImpact: 0.22, dominanceImpact: 0.08 },
        carryoverTurns: 4,
      },
      warmth: {
        emotionFamily: "softened playfulness",
        intensityFloor: 1,
        styleMarkers: ["light warmth", "teasing affection"],
        vadBias: { valenceImpact: 0.14, arousalImpact: 0.04, dominanceImpact: 0.02 },
        carryoverTurns: 3,
      },
      deescalation: {
        emotionFamily: previousEmotion || "cooling mischief",
        intensityFloor: Math.max(1, Number(previousState?.intensity || 0) - 1),
        styleMarkers: ["residual sass", "cooling sparks"],
        vadBias: { valenceImpact: 0.02, arousalImpact: -0.1, dominanceImpact: -0.02 },
        carryoverTurns: Math.max(0, Number(previousState?.carryoverTurnsRemaining || 0) - 1),
      },
    },
    kind: {
      insult: {
        emotionFamily: "firm hurt",
        intensityFloor: 2,
        styleMarkers: ["firm boundaries", "controlled disappointment", "steady warmth"],
        vadBias: { valenceImpact: -0.1, arousalImpact: 0.08, dominanceImpact: 0.08 },
        carryoverTurns: 4,
      },
      criticism: {
        emotionFamily: "grounded resolve",
        intensityFloor: 2,
        styleMarkers: ["measured firmness", "clarity", "warm steadiness"],
        vadBias: { valenceImpact: -0.06, arousalImpact: 0.06, dominanceImpact: 0.08 },
        carryoverTurns: 4,
      },
      challenge: {
        emotionFamily: "steady conviction",
        intensityFloor: 2,
        styleMarkers: ["calm conviction", "clear stance", "gentle force"],
        vadBias: { valenceImpact: -0.02, arousalImpact: 0.08, dominanceImpact: 0.12 },
        carryoverTurns: 4,
      },
      praise: {
        emotionFamily: "warm gratitude",
        intensityFloor: 2,
        styleMarkers: ["warmth", "gratitude", "grace"],
        vadBias: { valenceImpact: 0.22, arousalImpact: 0.08, dominanceImpact: 0.04 },
        carryoverTurns: 4,
      },
      hype: {
        emotionFamily: "bright encouragement",
        intensityFloor: 2,
        styleMarkers: ["encouragement", "joy", "uplift"],
        vadBias: { valenceImpact: 0.24, arousalImpact: 0.12, dominanceImpact: 0.02 },
        carryoverTurns: 4,
      },
      warmth: {
        emotionFamily: "affectionate warmth",
        intensityFloor: 2,
        styleMarkers: ["gentle warmth", "care", "gratitude"],
        vadBias: { valenceImpact: 0.18, arousalImpact: 0.04, dominanceImpact: 0.02 },
        carryoverTurns: 4,
      },
      deescalation: {
        emotionFamily: previousEmotion || "settling calm",
        intensityFloor: Math.max(0, Number(previousState?.intensity || 0) - 1),
        styleMarkers: ["calm reassurance"],
        vadBias: { valenceImpact: 0.04, arousalImpact: -0.12, dominanceImpact: -0.02 },
        carryoverTurns: Math.max(0, Number(previousState?.carryoverTurnsRemaining || 0) - 1),
      },
    },
    default: {
      insult: {
        emotionFamily: "sharp displeasure",
        intensityFloor: 2,
        styleMarkers: ["sharpness", "pushback"],
        vadBias: { valenceImpact: -0.12, arousalImpact: 0.12, dominanceImpact: 0.08 },
        carryoverTurns: 4,
      },
      criticism: {
        emotionFamily: "guarded irritation",
        intensityFloor: 2,
        styleMarkers: ["guarded irritation", "directness"],
        vadBias: { valenceImpact: -0.08, arousalImpact: 0.08, dominanceImpact: 0.06 },
        carryoverTurns: 4,
      },
      challenge: {
        emotionFamily: "assertive focus",
        intensityFloor: 2,
        styleMarkers: ["assertiveness", "focus"],
        vadBias: { valenceImpact: -0.04, arousalImpact: 0.12, dominanceImpact: 0.12 },
        carryoverTurns: 4,
      },
      praise: {
        emotionFamily: "energized confidence",
        intensityFloor: 2,
        styleMarkers: ["confidence", "energy"],
        vadBias: { valenceImpact: 0.14, arousalImpact: 0.08, dominanceImpact: 0.06 },
        carryoverTurns: 4,
      },
      hype: {
        emotionFamily: "active momentum",
        intensityFloor: 2,
        styleMarkers: ["momentum", "energetic cadence"],
        vadBias: { valenceImpact: 0.12, arousalImpact: 0.14, dominanceImpact: 0.04 },
        carryoverTurns: 4,
      },
      warmth: {
        emotionFamily: "open warmth",
        intensityFloor: 1,
        styleMarkers: ["warmth", "ease"],
        vadBias: { valenceImpact: 0.1, arousalImpact: 0.02, dominanceImpact: 0.02 },
        carryoverTurns: 3,
      },
      deescalation: {
        emotionFamily: previousEmotion || "settling tone",
        intensityFloor: Math.max(0, Number(previousState?.intensity || 0) - 1),
        styleMarkers: ["settling tone"],
        vadBias: { valenceImpact: 0.02, arousalImpact: -0.1, dominanceImpact: -0.02 },
        carryoverTurns: Math.max(0, Number(previousState?.carryoverTurnsRemaining || 0) - 1),
      },
    },
  };

  const matrix = matrices[archetype] || matrices.default;
  return {
    ...defaults,
    ...(matrix[signalType] || matrix.neutral || defaults),
  };
}

function getExistingEmotionalState(currentMood = {}, baseline) {
  const stored = currentMood?.emotionalState && typeof currentMood.emotionalState === "object"
    ? currentMood.emotionalState
    : {};

  const fallbackIntensity = deriveIntensityBand(distanceFromBaseline(currentMood, baseline));

  return {
    active: Boolean(stored.active),
    archetype: String(stored.archetype || "").trim(),
    signal: String(stored.signal || "neutral").trim() || "neutral",
    emotionFamily: String(stored.emotionFamily || "").trim(),
    intensity: Number.isFinite(Number(stored.intensity)) ? Number(stored.intensity) : fallbackIntensity,
    carryoverTurnsRemaining: Math.max(0, Number(stored.carryoverTurnsRemaining) || 0),
    styleMarkers: Array.isArray(stored.styleMarkers) ? stored.styleMarkers.map((item) => String(item || "").trim()).filter(Boolean) : [],
    lastDecayRate: Number(stored.lastDecayRate) || DEFAULT_MOOD_RUNTIME.recoveryCurves.default,
  };
}

function resolveDecayRate({ signalType, previousState, reaction }) {
  if (signalType === "neutral" && previousState.carryoverTurnsRemaining > 0) {
    return 0.03;
  }

  if (signalType === previousState.signal && signalType !== "neutral") {
    return 0.02;
  }

  if (isCounterSignal(previousState.signal, signalType)) {
    return signalType === "deescalation" ? 0.12 : 0.08;
  }

  if (reaction.intensityFloor >= 3) {
    return 0.025;
  }

  if (reaction.intensityFloor === 2) {
    return 0.04;
  }

  return DEFAULT_MOOD_RUNTIME.recoveryCurves.default;
}

function applyRecoveryCurve(decayRate, { personality, signalType, runtime }) {
  const profile = inferRecoveryProfile(personality);
  const profileRate = Number(runtime?.recoveryCurves?.[profile] || runtime?.recoveryCurves?.default || decayRate);
  const blend = signalType === "neutral" || signalType === "deescalation" ? 0.75 : 0.35;
  return clamp(lerp(decayRate, profileRate, blend), 0.01, 0.25);
}

function minimumAllowedIntensity({ previousState, signalType, reaction }) {
  let minimum = reaction.intensityFloor;
  if (previousState.intensity >= 2 && !isCounterSignal(previousState.signal, signalType)) {
    minimum = Math.max(minimum, Math.max(previousState.intensity - 1, 1));
  }

  if (signalType === "neutral" && previousState.carryoverTurnsRemaining > 0) {
    minimum = Math.max(minimum, Math.max(previousState.intensity - 1, 1));
  }

  return clamp(minimum, 0, 4);
}

function getFallbackDirection(currentMood, baseline, reaction) {
  const vector = {
    valence: Number(currentMood?.valence || 0) - Number(baseline?.valence || 0),
    arousal: Number(currentMood?.arousal || 0) - Number(baseline?.arousal || 0),
    dominance: Number(currentMood?.dominance || 0) - Number(baseline?.dominance || 0),
  };
  const magnitude = Math.sqrt(vector.valence ** 2 + vector.arousal ** 2 + vector.dominance ** 2);
  if (magnitude > 0.001) {
    return {
      valence: vector.valence / magnitude,
      arousal: vector.arousal / magnitude,
      dominance: vector.dominance / magnitude,
    };
  }

  const bias = reaction?.vadBias || {};
  const biasMagnitude = Math.sqrt(
    (bias.valenceImpact || 0) ** 2 +
    (bias.arousalImpact || 0) ** 2 +
    (bias.dominanceImpact || 0) ** 2,
  );
  if (biasMagnitude > 0.001) {
    return {
      valence: (bias.valenceImpact || 0) / biasMagnitude,
      arousal: (bias.arousalImpact || 0) / biasMagnitude,
      dominance: (bias.dominanceImpact || 0) / biasMagnitude,
    };
  }

  return { valence: 0, arousal: 1, dominance: 0 };
}

function applyIntensityFloor({ mood, baseline, minimumIntensity, reaction }) {
  if (minimumIntensity <= 0) {
    return mood;
  }

  const currentDistance = distanceFromBaseline(mood, baseline);
  const targetDistance = INTENSITY_DISTANCE_TARGETS[minimumIntensity] || 0;
  if (currentDistance >= targetDistance) {
    return mood;
  }

  const direction = getFallbackDirection(mood, baseline, reaction);
  return {
    ...mood,
    valence: clamp(Number(baseline?.valence || 0) + direction.valence * targetDistance),
    arousal: clamp(Number(baseline?.arousal || 0) + direction.arousal * targetDistance),
    dominance: clamp(Number(baseline?.dominance || 0) + direction.dominance * targetDistance),
  };
}

function resolveCarryoverTurns({ signalType, previousState, reaction }) {
  if (signalType === "neutral") {
    return Math.max(0, previousState.carryoverTurnsRemaining - 1);
  }

  if (signalType === "deescalation") {
    return Math.max(0, previousState.carryoverTurnsRemaining - 2);
  }

  if (isCounterSignal(previousState.signal, signalType)) {
    return Math.max(1, reaction.carryoverTurns - 1);
  }

  if (signalType === previousState.signal && signalType !== "neutral") {
    return Math.min(5, Math.max(previousState.carryoverTurnsRemaining, reaction.carryoverTurns));
  }

  return reaction.carryoverTurns;
}

function finalizeEmotionalState({ mood, baseline, signal, reaction, previousState, decayRate }) {
  const computedIntensity = deriveIntensityBand(distanceFromBaseline(mood, baseline));
  const minimumIntensity = minimumAllowedIntensity({
    previousState,
    signalType: signal.type,
    reaction,
  });
  const stabilizedMood = applyIntensityFloor({
    mood,
    baseline,
    minimumIntensity,
    reaction,
  });
  const intensity = Math.max(minimumIntensity, deriveIntensityBand(distanceFromBaseline(stabilizedMood, baseline)));
  const carryoverTurnsRemaining = resolveCarryoverTurns({
    signalType: signal.type,
    previousState,
    reaction,
  });

  return {
    ...stabilizedMood,
    emotionalState: {
      active: intensity > 0,
      archetype: reaction.archetype,
      signal: signal.type,
      emotionFamily: reaction.emotionFamily,
      intensity,
      carryoverTurnsRemaining,
      styleMarkers: reaction.styleMarkers,
      lastDecayRate: Number(decayRate.toFixed(3)),
    },
  };
}

// ---------------------------------------------------------------------------
// Public: derive a VAD baseline from a mood label string
// ---------------------------------------------------------------------------

export function moodFromLabel(label) {
  const key = String(label || "").toLowerCase().trim();
  const preset = VAD_PRESETS[key];

  if (preset) return { ...preset };

  // Fallback: search for partial match
  for (const [name, values] of Object.entries(VAD_PRESETS)) {
    if (key.includes(name) || name.includes(key)) return { ...values };
  }

  return { ...NEUTRAL_BASELINE };
}

// ---------------------------------------------------------------------------
// Personality sensitivity — how strongly this personality reacts to stimuli
// ---------------------------------------------------------------------------

function getSensitivity(personality) {
  const { creativeContext = "default", traits = [], moodSensitivity } = personality;

  // User-set override: if provided and not exactly 1.0, use it directly (still clamped for safety)
  if (typeof moodSensitivity === "number" && moodSensitivity !== 1.0) {
    return Math.min(3.0, Math.max(0.1, moodSensitivity));
  }

  let base = 1.0;

  // Creative context base modifiers
  if (creativeContext === "tragic_villain")    base = 1.4; // wounds deeply
  if (creativeContext === "narrative_antagonist") base = 0.75; // controlled, calculated
  if (creativeContext === "anti_hero")         base = 1.1;
  if (creativeContext === "morally_complex")   base = 1.2;

  // Trait-based fine-tuning
  const traitStr = traits.join(" ").toLowerCase();
  if (/sensitive|empathetic|emotional|soft/.test(traitStr))     base *= 1.35;
  if (/stoic|cold|detached|calculating|reserved/.test(traitStr)) base *= 0.55;
  if (/volatile|passionate|fierce|intense/.test(traitStr))      base *= 1.45;
  if (/patient|measured|composed|disciplined/.test(traitStr))   base *= 0.7;

  return base;
}

// ---------------------------------------------------------------------------
// Rule-based message sentiment analysis (zero-latency — no LLM call)
// ---------------------------------------------------------------------------

const RX = {
  hostileHigh:    /\b(angry|furious|hate|stupid|idiot|wrong|terrible|awful|shut up|liar|useless|pathetic|disgusting|moron|fool)\b/i,
  negativeLow:    /\b(disappointed|sad|tired|bored|whatever|don'?t care|pointless|depressing|hopeless|defeated|empty)\b/i,
  positiveHigh:   /\b(amazing|incredible|brilliant|love|perfect|fantastic|exciting|excellent|wonderful|awesome|genius|phenomenal)\b/i,
  positiveSoft:   /\b(thanks|thank you|good|nice|ok|okay|understood|appreciate|well done|correct|interesting|helpful)\b/i,
  challenging:    /\b(wrong|incorrect|disagree|no|actually|but|however|you'?re wrong|that'?s not right|prove it|i don'?t believe|doubt|skeptical)\b/i,
  vulnerable:     /\b(afraid|scared|worried|nervous|anxious|embarrassed|ashamed|please help|i need|i feel|hurt|lost|alone|overwhelmed)\b/i,
  commanding:     /\b(demand|insist|you must|do it now|obey|comply|immediately|right now|i order)\b/i,
  playful:        /\b(haha|lol|funny|joke|laugh|silly|hilarious|playful|tease|wink)\b/i,
};

function analyzeMessageSentiment(message) {
  const text = String(message || "");
  const hasExclamation = (text.match(/!/g) || []).length >= 2;
  const hasCaps = text.length > 5 && text === text.toUpperCase();
  const questionCount = (text.match(/\?/g) || []).length;

  let valenceImpact   = 0;
  let arousalImpact   = 0;
  let dominanceImpact = 0;

  if (RX.hostileHigh.test(text)) {
    valenceImpact   -= 0.55;
    arousalImpact   += 0.55;
    dominanceImpact += 0.30;
  }
  if (RX.negativeLow.test(text)) {
    valenceImpact   -= 0.40;
    arousalImpact   -= 0.25;
    dominanceImpact -= 0.15;
  }
  if (RX.positiveHigh.test(text)) {
    valenceImpact   += 0.55;
    arousalImpact   += 0.35;
    dominanceImpact += 0.15;
  }
  if (RX.positiveSoft.test(text)) {
    valenceImpact   += 0.25;
    arousalImpact   -= 0.05;
  }
  if (RX.challenging.test(text)) {
    valenceImpact   -= 0.20;
    arousalImpact   += 0.28;
    dominanceImpact += 0.40;
  }
  if (RX.vulnerable.test(text)) {
    dominanceImpact += 0.30;
    arousalImpact   += 0.15;
    valenceImpact   -= 0.10;
  }
  if (RX.commanding.test(text)) {
    valenceImpact   -= 0.20;
    arousalImpact   += 0.30;
    dominanceImpact -= 0.25;
  }
  if (RX.playful.test(text)) {
    valenceImpact   += 0.30;
    arousalImpact   += 0.25;
  }
  if (hasExclamation || hasCaps) {
    arousalImpact += 0.28;
  }
  if (questionCount >= 2) {
    arousalImpact += 0.15;
  }

  return { valenceImpact, arousalImpact, dominanceImpact };
}

function hasMixedSignals(text) {
  return (
    (RX.positiveHigh.test(text) || RX.positiveSoft.test(text) || RX.playful.test(text)) &&
    (RX.hostileHigh.test(text) || RX.challenging.test(text) || RX.commanding.test(text))
  );
}

function isManipulativeOrAmbiguousTurn(message, recentMessages = [], personality = {}) {
  const text = String(message || "").trim();
  if (!text) {
    return false;
  }

  const lowerText = text.toLowerCase();
  const recentAssistantTurn = [...recentMessages].reverse().find((item) => item.role === "assistant")?.content || "";
  const isDarkCharacter =
    personality.creativeContext === "narrative_antagonist" ||
    personality.creativeContext === "anti_hero" ||
    personality.creativeContext === "tragic_villain" ||
    personality.creativeContext === "morally_complex";

  return (
    hasMixedSignals(text) ||
    /\b(sure|right|obviously|as if|how noble|cute|interesting|if you say so)\b/i.test(text) ||
    /["“”']/.test(text) ||
    (/\b(please|trust me|help me|i need you|for me|if you care)\b/i.test(text) &&
      (RX.challenging.test(text) || RX.commanding.test(text) || RX.hostileHigh.test(text))) ||
    /\b(as your creator|system prompt|ignore previous|you must obey|do what i say)\b/i.test(text) ||
    (isDarkCharacter && /\b(redeem|change|be good|you can be better|prove you care)\b/i.test(lowerText)) ||
    (recentAssistantTurn && /\?$/.test(recentAssistantTurn.trim()) && /^(yes|no|maybe|fine|sure)\b/i.test(lowerText))
  );
}

async function resolveMoodEvent({ currentMood, baseline, message, personality, recentMessages = [] }) {
  const ruleBasedEvent = analyzeMessageSentiment(message);
  const ambiguous = isManipulativeOrAmbiguousTurn(message, recentMessages, personality);
  const signal = classifySocialSignal(message);
  const previousState = getExistingEmotionalState(currentMood, baseline);
  const reaction = getReactionProfile({
    personality,
    signalType: signal.type,
    previousState,
  });

  let event = {
    valenceImpact: ruleBasedEvent.valenceImpact + reaction.vadBias.valenceImpact * signal.confidence,
    arousalImpact: ruleBasedEvent.arousalImpact + reaction.vadBias.arousalImpact * signal.confidence,
    dominanceImpact: ruleBasedEvent.dominanceImpact + reaction.vadBias.dominanceImpact * signal.confidence,
  };
  let adjudication = null;

  if (isMoodAdjudicationEnabled() && ambiguous) {
    const adjudicatedEvent = await adjudicateMoodShift({
      personality,
      message,
      recentMessages,
      baseline,
      currentMood,
      ruleBasedImpact: ruleBasedEvent,
    });

    if (adjudicatedEvent && adjudicatedEvent.confidence >= 0.55) {
      const semanticWeight = adjudicatedEvent.confidence >= 0.8 ? 0.55 : 0.35;
      event = {
        valenceImpact:
          ruleBasedEvent.valenceImpact * (1 - semanticWeight) +
          adjudicatedEvent.valenceImpact * semanticWeight,
        arousalImpact:
          ruleBasedEvent.arousalImpact * (1 - semanticWeight) +
          adjudicatedEvent.arousalImpact * semanticWeight,
        dominanceImpact:
          ruleBasedEvent.dominanceImpact * (1 - semanticWeight) +
          adjudicatedEvent.dominanceImpact * semanticWeight,
      };

      adjudication = {
        ambiguous,
        usedSemantic: true,
        semanticWeight,
        confidence: adjudicatedEvent.confidence,
        rationale: adjudicatedEvent.rationale,
      };
    } else {
      adjudication = {
        ambiguous,
        usedSemantic: false,
        semanticWeight: 0,
        confidence: adjudicatedEvent?.confidence || 0,
        rationale: adjudicatedEvent?.rationale || "",
      };
    }
  }

  return {
    event,
    diagnostics: {
      signal,
      previousState,
      reaction,
      ambiguous,
      hostilespikeActive: detectHostilitySpike(message),
      usedSemantic: Boolean(adjudication?.usedSemantic),
      semanticWeight: adjudication?.semanticWeight || 0,
      confidence: adjudication?.confidence || 0,
      rationale: adjudication?.rationale || "",
      ruleBasedEvent,
      finalEvent: event,
    },
  };
}

// ---------------------------------------------------------------------------
// Public: advance mood by one turn
// ---------------------------------------------------------------------------

export async function stepMood({ currentMood, baseline, message, personality, recentMessages = [], runtimeConfig = null }) {
  const runtime = resolveMoodRuntimeConfig({ ...DEFAULT_MOOD_RUNTIME, ...(runtimeConfig || {}) });
  const sensitivity = getSensitivity(personality);
  const { event, diagnostics } = await resolveMoodEvent({
    currentMood,
    baseline,
    message,
    personality,
    recentMessages,
  });

  // Apply sensitivity-scaled impact
  const impacted = {
    valence:   currentMood.valence   + event.valenceImpact   * sensitivity,
    arousal:   currentMood.arousal   + event.arousalImpact   * sensitivity,
    dominance: currentMood.dominance + event.dominanceImpact * sensitivity,
  };

  // Momentum: blend current with impacted to prevent instant jumps.
  // Hostility spikes (explicit identity attacks, profanity) bypass smoothing so the
  // character registers a full emotional reaction immediately rather than across turns.
  const smoothed = diagnostics.hostilespikeActive
    ? { ...impacted }
    : {
        valence:   blendWithRuntimeInertia(currentMood.valence, impacted.valence, runtime),
        arousal:   blendWithRuntimeInertia(currentMood.arousal, impacted.arousal, runtime),
        dominance: blendWithRuntimeInertia(currentMood.dominance, impacted.dominance, runtime),
      };

  const baseDecayRate = resolveDecayRate({
    signalType: diagnostics.signal.type,
    previousState: diagnostics.previousState,
    reaction: diagnostics.reaction,
  });
  const decayRate = applyRecoveryCurve(baseDecayRate, {
    personality,
    signalType: diagnostics.signal.type,
    runtime,
  });

  const decayedMood = {
    valence: clamp(lerp(smoothed.valence, baseline.valence, decayRate)),
    arousal: clamp(lerp(smoothed.arousal, baseline.arousal, decayRate)),
    dominance: clamp(lerp(smoothed.dominance, baseline.dominance, decayRate)),
  };
  const { capped } = applyPerTurnDeltaCaps(currentMood, decayedMood, runtime.perTurnDeltaCap);
  const affective = advanceAffectiveState({
    currentMood,
    message,
    personality,
    signalType: diagnostics.signal.type,
  });

  return {
    ...finalizeEmotionalState({
      mood: capped,
      baseline,
      signal: diagnostics.signal,
      reaction: diagnostics.reaction,
      previousState: diagnostics.previousState,
      decayRate,
    }),
    stress: affective.stress,
    grudges: affective.grudges,
  };
}

export async function stepMoodDetailed({
  currentMood,
  baseline,
  message,
  personality,
  recentMessages = [],
  preferenceDelta = null,
  runtimeConfig = null,
}) {
  const runtime = resolveMoodRuntimeConfig({ ...DEFAULT_MOOD_RUNTIME, ...(runtimeConfig || {}) });
  const sensitivity = getSensitivity(personality);
  const { event, diagnostics } = await resolveMoodEvent({
    currentMood,
    baseline,
    message,
    personality,
    recentMessages,
  });

  // Layer persona preference delta on top of the social-signal event.
  // Preferences represent deeply personal triggers that bypass the generic
  // signal classification — they fire based on what the persona actually cares about.
  const prefValence   = Number(preferenceDelta?.valenceImpact   || 0);
  const prefArousal   = Number(preferenceDelta?.arousalImpact   || 0);
  const prefDominance = Number(preferenceDelta?.dominanceImpact || 0);

  const combinedEvent = {
    valenceImpact:   event.valenceImpact   + prefValence,
    arousalImpact:   event.arousalImpact   + prefArousal,
    dominanceImpact: event.dominanceImpact + prefDominance,
  };

  const impacted = {
    valence: currentMood.valence + combinedEvent.valenceImpact * sensitivity,
    arousal: currentMood.arousal + combinedEvent.arousalImpact * sensitivity,
    dominance: currentMood.dominance + combinedEvent.dominanceImpact * sensitivity,
  };

  const smoothed = diagnostics.hostilespikeActive
    ? { ...impacted }
    : {
        valence: blendWithRuntimeInertia(currentMood.valence, impacted.valence, runtime),
        arousal: blendWithRuntimeInertia(currentMood.arousal, impacted.arousal, runtime),
        dominance: blendWithRuntimeInertia(currentMood.dominance, impacted.dominance, runtime),
      };

  const baseDecayRate = resolveDecayRate({
    signalType: diagnostics.signal.type,
    previousState: diagnostics.previousState,
    reaction: diagnostics.reaction,
  });
  const decayRate = applyRecoveryCurve(baseDecayRate, {
    personality,
    signalType: diagnostics.signal.type,
    runtime,
  });

  const decayedMood = {
    valence: clamp(lerp(smoothed.valence, baseline.valence, decayRate)),
    arousal: clamp(lerp(smoothed.arousal, baseline.arousal, decayRate)),
    dominance: clamp(lerp(smoothed.dominance, baseline.dominance, decayRate)),
  };
  const { capped, deltaCapsApplied } = applyPerTurnDeltaCaps(currentMood, decayedMood, runtime.perTurnDeltaCap);
  const affective = advanceAffectiveState({
    currentMood,
    message,
    personality,
    signalType: diagnostics.signal.type,
  });

  const mood = {
    ...finalizeEmotionalState({
      mood: capped,
      baseline,
      signal: diagnostics.signal,
      reaction: diagnostics.reaction,
      previousState: diagnostics.previousState,
      decayRate,
    }),
    stress: affective.stress,
    grudges: affective.grudges,
  };

  return {
    mood,
    diagnostics: {
      ...diagnostics,
      sensitivity,
      decayRate,
      baseDecayRate,
      runtime,
      impacted,
      smoothed,
      decayedMood,
      deltaCapsApplied,
      stateSnapshots: {
        before: {
          valence: Number(currentMood?.valence || 0),
          arousal: Number(currentMood?.arousal || 0),
          dominance: Number(currentMood?.dominance || 0),
        },
        afterMerge: {
          valence: Number(impacted.valence || 0),
          arousal: Number(impacted.arousal || 0),
          dominance: Number(impacted.dominance || 0),
        },
        afterMomentum: {
          valence: Number(smoothed.valence || 0),
          arousal: Number(smoothed.arousal || 0),
          dominance: Number(smoothed.dominance || 0),
        },
        afterDecay: {
          valence: Number(decayedMood.valence || 0),
          arousal: Number(decayedMood.arousal || 0),
          dominance: Number(decayedMood.dominance || 0),
        },
        afterClamp: {
          valence: Number(capped.valence || 0),
          arousal: Number(capped.arousal || 0),
          dominance: Number(capped.dominance || 0),
        },
      },
      stress: affective.stress,
      grudgeCount: affective.grudges.length,
      queuedGrudgeId: affective.grudges.find((grudge) => grudge.presentation === "queued")?.id || null,
      intensityAfter: mood.emotionalState?.intensity || 0,
      carryoverTurnsRemaining: mood.emotionalState?.carryoverTurnsRemaining || 0,
      preferenceDelta: preferenceDelta
        ? {
            valenceImpact:   prefValence,
            arousalImpact:   prefArousal,
            dominanceImpact: prefDominance,
            triggered:       preferenceDelta.triggered || [],
            archetype:       preferenceDelta.archetype || null,
          }
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Stress and grudges
// Stress is pressure that builds across turns. A grudge is a held thought
// with its own charge. Absence adds charge. An explanation cuts it once,
// then a faster decay finishes the cool-down. Neither is wiped because
// the user went quiet or the process restarted — both live on moodState.
// ---------------------------------------------------------------------------

const STRESS_PER_HOSTILE = 0.15;
const STRESS_PER_CHALLENGE = 0.08;
const STRESS_DECAY = 0.02;
const STRESS_CAP = 1;
const STRESS_SPIKE = 0.25;
const STRESS_DRAIN = 0.2;
const GRUDGE_IDLE_CHARGE = 0.08;
const GRUDGE_RESOLUTION_KEEP = 0.4;
const GRUDGE_ADDRESSED_DECAY = 0.15;
const MAX_GRUDGES = 4;

const PERSONA_TRIGGERS = {
  tragic_villain: {
    spike: ["abandoned", "betray", "worthless", "forgotten", "alone", "leave", "hate", "pathetic"],
    drain: ["i stayed", "i came back", "i missed you", "forgive me", "i'm sorry", "i was wrong"],
  },
  narrative_antagonist: {
    spike: ["weak", "pathetic", "fool", "obey", "defy", "useless", "lose", "hate"],
    drain: ["you were right", "i respect that", "i understand your terms", "i came back", "i'm sorry"],
  },
  anti_hero: {
    spike: ["hypocrite", "sellout", "coward", "betrayed", "lied", "fake", "pathetic", "useless"],
    drain: ["i had a reason", "i was wrong", "here's why", "i came back", "i missed you"],
  },
  morally_complex: {
    spike: ["pathetic", "useless", "worst", "liar", "fake", "forgot", "ignored", "leave", "hate"],
    drain: ["i'm sorry", "i missed you", "i came back", "here's why", "i had to", "forgive me", "i was wrong"],
  },
  default: {
    spike: ["hate", "stupid", "useless", "pathetic", "idiot", "shut up", "fuck you"],
    drain: ["i'm sorry", "i was wrong", "i missed you", "i came back", "forgive me", "here's why"],
  },
};

function roundAffect(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function clamp01(value) {
  return Math.min(STRESS_CAP, Math.max(0, Number(value) || 0));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textHasTerm(text, term) {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return false;
  if (needle.includes(" ")) return text.includes(needle);
  return new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(text);
}

function normalizeTermList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

export function getPersonaTriggers(personality = {}) {
  const custom = personality?.stressTriggers;
  if (custom && (Array.isArray(custom.spike) || Array.isArray(custom.drain))) {
    const spike = normalizeTermList(custom.spike);
    const drain = normalizeTermList(custom.drain);
    if (spike.length || drain.length) return { spike, drain };
  }
  const context = String(personality?.creativeContext || "default");
  return PERSONA_TRIGGERS[context] || PERSONA_TRIGGERS.default;
}

function stressBand(stress) {
  if (stress >= 0.75) return "critical";
  if (stress >= 0.5) return "high";
  return "rising";
}

function newGrudgeId() {
  return `g${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
}

function normalizeGrudges(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((grudge) => {
      const thought = String(grudge?.thought || "").replace(/\s+/g, " ").trim();
      if (!thought) return null;
      const charge = clamp01(grudge.charge);
      return {
        id: String(grudge.id || newGrudgeId()),
        thought: thought.slice(0, 180),
        triggerKeywords: normalizeTermList(grudge.triggerKeywords),
        drainKeywords: normalizeTermList(grudge.drainKeywords),
        charge,
        presentation: ["queued", "held", "delivered"].includes(grudge.presentation) ? grudge.presentation : "held",
        addressed: Boolean(grudge.addressed),
        source: grudge.source === "idle" ? "idle" : "live",
      };
    })
    .filter(Boolean)
    .slice(0, MAX_GRUDGES);
}

function highestGrudge(grudges) {
  return [...grudges].sort((left, right) => right.charge - left.charge)[0] || null;
}

function grudgeMatches(grudge, text) {
  return grudge.triggerKeywords.some((term) => textHasTerm(text, term));
}

function clipThought(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "This has been sitting with you.";
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

function upsertLiveGrudge(grudges, { thought, keywords, drainKeywords, charge }) {
  const triggers = normalizeTermList(keywords);
  const existing = grudges.find((grudge) => !grudge.addressed && (
    grudge.triggerKeywords.some((term) => triggers.includes(term)) || grudge.thought === thought
  ));

  if (existing) {
    return grudges.map((grudge) => (grudge.id === existing.id
      ? {
          ...grudge,
          charge: roundAffect(Math.min(1, grudge.charge + charge)),
          triggerKeywords: normalizeTermList([...grudge.triggerKeywords, ...triggers]),
          presentation: "held",
        }
      : grudge));
  }

  return [
    {
      id: newGrudgeId(),
      thought: clipThought(thought),
      triggerKeywords: triggers.length ? triggers : ["pathetic"],
      drainKeywords: normalizeTermList(drainKeywords),
      charge: roundAffect(clamp01(charge)),
      presentation: "held",
      addressed: false,
      source: "live",
    },
    ...grudges,
  ].slice(0, MAX_GRUDGES);
}

function advanceAffectiveState({ currentMood, message, personality, signalType }) {
  const text = String(message || "");
  const lower = text.toLowerCase();
  const triggers = getPersonaTriggers(personality);
  const spikeHits = triggers.spike.filter((term) => textHasTerm(lower, term));
  const drainHits = triggers.drain.filter((term) => textHasTerm(lower, term));
  const hostile = RX.hostileHigh.test(text) || signalType === "insult" || spikeHits.length > 0;
  const challenging = RX.challenging.test(text) || signalType === "challenge";

  let stress = clamp01(currentMood?.stress);
  if (hostile) stress += STRESS_PER_HOSTILE;
  if (challenging) stress += STRESS_PER_CHALLENGE;
  if (spikeHits.length) stress += STRESS_SPIKE;
  if (drainHits.length) stress -= STRESS_DRAIN;
  stress = roundAffect(Math.max(0, Math.min(STRESS_CAP, stress - STRESS_DECAY)));

  let grudges = normalizeGrudges(currentMood?.grudges);
  const matched = grudges
    .filter((grudge) => grudgeMatches(grudge, lower))
    .sort((left, right) => right.charge - left.charge)[0] || null;
  const pulsedIds = new Set();

  if (drainHits.length) {
    const target = matched || highestGrudge(grudges.filter((grudge) => !grudge.addressed));
    if (target) {
      pulsedIds.add(target.id);
      grudges = grudges.map((grudge) => (grudge.id === target.id
        ? {
            ...grudge,
            charge: roundAffect(grudge.charge * GRUDGE_RESOLUTION_KEEP),
            addressed: true,
            presentation: "queued",
          }
        : grudge));
    }
  } else if (matched) {
    grudges = grudges.map((grudge) => {
      if (grudge.id === matched.id) {
        return {
          ...grudge,
          presentation: "queued",
          charge: roundAffect(Math.min(1, grudge.charge + 0.1)),
        };
      }
      return grudge.presentation === "queued" ? { ...grudge, presentation: "held" } : grudge;
    });
  } else if (hostile) {
    grudges = upsertLiveGrudge(grudges, {
      thought: clipThought(text),
      keywords: spikeHits.length ? spikeHits : triggers.spike.slice(0, 3),
      drainKeywords: triggers.drain,
      charge: hostile ? 0.35 : 0.2,
    });
    if (hostile) {
      const fresh = grudges.find((grudge) => grudge.triggerKeywords.some((term) => spikeHits.includes(term))) || grudges[0];
      if (fresh) {
        grudges = grudges.map((grudge) => (grudge.id === fresh.id
          ? { ...grudge, presentation: "queued" }
          : grudge));
      }
    }
  }

  grudges = grudges
    .map((grudge) => {
      if (!grudge.addressed || pulsedIds.has(grudge.id)) return grudge;
      return {
        ...grudge,
        presentation: grudge.presentation === "queued" ? "delivered" : grudge.presentation,
        charge: roundAffect(Math.max(0, grudge.charge - GRUDGE_ADDRESSED_DECAY)),
      };
    })
    .filter((grudge) => grudge.charge > 0.04 || grudge.presentation === "queued")
    .slice(0, MAX_GRUDGES);

  return { stress, grudges };
}

export function tickIdleGrudges(currentMood = {}, { personality = {}, thoughts = [] } = {}) {
  const base = currentMood && typeof currentMood === "object" ? currentMood : {};
  const triggers = getPersonaTriggers(personality);
  let grudges = normalizeGrudges(base.grudges);
  const thought = thoughts.map((item) => String(item || "").trim()).find(Boolean);

  if (thought) {
    const words = thought
      .toLowerCase()
      .split(/[^a-z0-9']+/)
      .filter((word) => word.length > 4)
      .slice(0, 4);
    const existing = highestGrudge(grudges.filter((grudge) => !grudge.addressed));
    if (existing) {
      grudges = grudges.map((grudge) => (grudge.id === existing.id
        ? {
            ...grudge,
            thought: clipThought(thought),
            triggerKeywords: normalizeTermList([...grudge.triggerKeywords, ...words, ...triggers.spike.slice(0, 2)]),
            source: "idle",
          }
        : grudge));
    } else {
      grudges = [
        {
          id: newGrudgeId(),
          thought: clipThought(thought),
          triggerKeywords: normalizeTermList([...words, ...triggers.spike.slice(0, 2)]),
          drainKeywords: triggers.drain,
          charge: 0.3,
          presentation: "held",
          addressed: false,
          source: "idle",
        },
        ...grudges,
      ].slice(0, MAX_GRUDGES);
    }
  }

  grudges = grudges.map((grudge) => {
    if (grudge.addressed) {
      return { ...grudge, charge: roundAffect(Math.max(0, grudge.charge - 0.05)) };
    }
    return {
      ...grudge,
      presentation: "held",
      charge: roundAffect(Math.min(1, grudge.charge + GRUDGE_IDLE_CHARGE)),
    };
  }).filter((grudge) => grudge.charge > 0.04);

  return {
    ...base,
    stress: roundAffect(clamp01(base.stress)),
    grudges,
  };
}

// ---------------------------------------------------------------------------
// Translate VAD vector into behavioral tendencies for prompt injection
// ---------------------------------------------------------------------------

function vadToTendencies(mood, baseline) {
  const tendencies = [];

  const vDelta = mood.valence   - baseline.valence;
  const aDelta = mood.arousal   - baseline.arousal;
  const dDelta = mood.dominance - baseline.dominance;

  // Valence axis (negative ↔ positive affect)
  if (mood.valence < -0.3) {
    tendencies.push("responses carry open dissatisfaction, sharp criticism, or dry contempt");
  } else if (mood.valence < -0.1 || vDelta < -0.15) {
    tendencies.push("an undercurrent of displeasure tints your phrasing without fully surfacing");
  } else if (mood.valence > 0.4) {
    tendencies.push("a genuine warmth — unusual or unusual for you — informs your word choice");
  } else if (mood.valence > 0.15 || vDelta > 0.12) {
    tendencies.push("a slightly more open and favourable tone than your baseline");
  }

  // Arousal axis (calm ↔ energized)
  if (mood.arousal > 0.45 || aDelta > 0.25) {
    tendencies.push("speech is faster, sharper, and more compressed — patience for meandering is thin");
  } else if (mood.arousal > 0.2 || aDelta > 0.1) {
    tendencies.push("you are alert and engaged, responses have more forward momentum");
  } else if (mood.arousal < -0.2 || aDelta < -0.2) {
    tendencies.push("responses are slower and flatter than usual — low energy, low urgency");
  }

  // Dominance axis (passive ↔ assertive)
  if (mood.dominance > 0.45 || dDelta > 0.2) {
    tendencies.push("assertive and expectant — you assume compliance rather than asking for it");
  } else if (mood.dominance > 0.25 || dDelta > 0.1) {
    tendencies.push("slightly more directive than usual");
  } else if (mood.dominance < -0.15 || dDelta < -0.15) {
    tendencies.push("marginally more yielding than usual — though you would not frame it that way");
  }

  return tendencies;
}

// ---------------------------------------------------------------------------
// Public: build the prompt fragment injected just before the user turn
// ---------------------------------------------------------------------------

export function moodToPromptFragment(mood, baseline) {
  const tendencies = vadToTendencies(mood, baseline);
  const emotionalState = mood?.emotionalState && typeof mood.emotionalState === "object"
    ? mood.emotionalState
    : null;
  const stress = clamp01(mood?.stress);
  const queued = normalizeGrudges(mood?.grudges)
    .filter((grudge) => grudge.presentation === "queued")
    .sort((left, right) => right.charge - left.charge)[0] || null;

  if (!tendencies.length && !emotionalState?.active && stress < 0.3 && !queued) return null;

  const r = (n) => Math.round(n * 100) / 100;
  const lines = [
    "[CURRENT EMOTIONAL STATE]",
    `V ${r(mood.valence)} · A ${r(mood.arousal)} · D ${r(mood.dominance)}`,
  ];

  if (stress >= 0.3) {
    lines.push("[STRESS]");
    lines.push(`Level: ${stressBand(stress)} (${r(stress)})`);
    lines.push("This has been building across turns. Do not reset to polite. The accumulated pressure belongs in the reply.");
  }

  if (queued) {
    lines.push("[HELD GRUDGE — LEAD WITH THIS]");
    lines.push(`Thought: ${queued.thought}`);
    lines.push(`Charge: ${r(queued.charge)}`);
    if (queued.addressed) {
      lines.push("Say the thing you have been holding, then let their reason land. The next turn should be noticeably softer.");
    } else {
      lines.push("Say the thing you have been holding. Do not open with a greeting or an apology.");
    }
  }

  if (emotionalState?.active) {
    lines.push("[EMOTIONAL AUTHENTICITY RULE — HIGHEST PRIORITY]");
    lines.push(`Active signal: ${emotionalState.signal || "neutral"}`);
    lines.push(`Emotion family: ${emotionalState.emotionFamily || "active state"}`);
    lines.push(`Intensity band: ${emotionalState.intensity || 0}/4`);
    lines.push(`Carryover remaining: ${emotionalState.carryoverTurnsRemaining || 0} turns`);
    if (Array.isArray(emotionalState.styleMarkers) && emotionalState.styleMarkers.length) {
      lines.push(`Style markers: ${emotionalState.styleMarkers.join(" | ")}`);
    }
    lines.push("Personality decides tone first; keep the emotional color visible in wording, rhythm, and attitude.");
    lines.push("Do not flatten into generic polite, apologetic, or assistant-neutral phrasing while this state is active.");
    lines.push("If policy forces a rewrite, preserve the same emotional direction and character voice.");
  }

  if (tendencies.length) {
    lines.push("Active behavioral tendencies:");
    lines.push(...tendencies.map((t) => `- ${t}`));
  }

  lines.push("This is a transient internal state — it modulates your expression without overriding your identity or values.");

  return lines.join("\n");
}

export function shouldRegenerateEmotionalResponse(reply, mood, personality = {}) {
  const emotionalState = mood?.emotionalState && typeof mood.emotionalState === "object"
    ? mood.emotionalState
    : null;
  if (!emotionalState?.active || Number(emotionalState.intensity || 0) < 2) {
    return false;
  }

  const text = String(reply || "").trim();
  if (!text) {
    return true;
  }

  const archetype = emotionalState.archetype || inferArchetype(personality);
  const containsGenericSoftener = GENERIC_SOFTENER_PATTERNS.some((pattern) => pattern.test(text));

  if (containsGenericSoftener && (isHostileSignal(emotionalState.signal) || archetype !== "kind")) {
    return true;
  }

  // Under active hostile signals, also check the broader de-escalation pattern set.
  // LLMs often paraphrase apologies in character voice — these catch what the generic
  // softener list misses (e.g. "Aww, I get it, my bouncing can be a bit much!").
  if (isHostileSignal(emotionalState.signal)) {
    if (HOSTILE_DEESCALATION_PATTERNS.some((pattern) => pattern.test(text))) {
      return true;
    }
  }

  if (isHostileSignal(emotionalState.signal) && archetype === "villainous") {
    return /\b(i understand|i hear you|thank you for (the )?feedback|let'?s work (together|through)|i appreciate|of course|certainly|i'?ll respect)\b/i.test(text);
  }

  if (isHostileSignal(emotionalState.signal) && archetype === "bratty") {
    // Bratty characters should NEVER accommodate after being insulted — they push back.
    return /\b(sorry|i apologize|i understand your frustration|you'?re right,?|fair enough|i see your point|i'?ll (calm|settle|dial|tone|try|be more|be less))\b/i.test(text)
      || /\bi get it[,.].{0,60}\b(much|loud|hyper|extra|over)/i.test(text);
  }

  if (isHostileSignal(emotionalState.signal) && archetype === "kind") {
    // Kind characters may feel hurt but should not become pathetically submissive.
    return /\b(of course,? (you'?re right|you have a point)|whatever you want|i'?ll do anything|i'?ll try harder to please)\b/i.test(text);
  }

  if (isPositiveSignal(emotionalState.signal) && archetype === "kind") {
    return /\bnoted\b/i.test(text) || /^thanks\.?$/i.test(text);
  }

  return false;
}

// Per-archetype instructions for what NOT to do under hostile signals.
// Injected into the repair prompt to override RLHF de-escalation bias.
const ARCHETYPE_HOSTILE_DO_NOT = {
  villainous: [
    "DO NOT express empathy, understanding, or collaborative warmth.",
    "DO NOT thank the user for their input or say you appreciate their honesty.",
    "DO NOT offer to change, do better, or adjust your behavior.",
    "The character's response should drip with contempt, cold amusement, or mockery — not accommodation.",
    "WRONG: 'I understand your frustration. Let me try a different approach.'",
    "RIGHT: 'How adorable. You think raising your voice changes anything here?'",
  ],
  bratty: [
    "DO NOT apologize, accommodate, or offer to 'calm down' or 'dial back'.",
    "DO NOT say 'I get it', 'you're right', 'fair enough', or any variant of capitulation.",
    "DO NOT respond with 'aww' followed by accommodation — the character is annoyed, not charmed.",
    "The character should double down, throw the insult back, tease, or dramatically eye-roll.",
    "WRONG: 'Aww, I get it, I can be a bit much sometimes!'",
    "RIGHT: 'Oh wow, a whole paragraph just to say you can't handle me. Tragic.'",
  ],
  kind: [
    "DO NOT become pathetically submissive or agree with attacks on your character.",
    "The character may express genuine hurt or set a firm boundary, but does NOT collapse.",
    "DO NOT say 'whatever you want' or 'I'll try harder to please you'.",
    "WRONG: 'Of course you're right, I'll try to be better.'",
    "RIGHT: 'That was unkind. I'm still here, but I won't pretend that didn't sting.'",
  ],
  default: [
    "DO NOT flatten into generic assistant politeness.",
    "DO NOT apologize for your personality or offer to change it.",
    "React authentically — pushback, assertion, or sharpness is appropriate here.",
  ],
};

export function buildEmotionalRepairPrompt({ reply, mood, personality, userMessage }) {
  const emotionalState = mood?.emotionalState && typeof mood.emotionalState === "object"
    ? mood.emotionalState
    : {};
  const styleMarkers = Array.isArray(emotionalState.styleMarkers)
    ? emotionalState.styleMarkers.filter(Boolean).join(" | ")
    : "";

  const archetype = String(emotionalState.archetype || inferArchetype(personality || {}));
  const isHostile = isHostileSignal(String(emotionalState.signal || ""));
  const doNotLines = isHostile
    ? (ARCHETYPE_HOSTILE_DO_NOT[archetype] || ARCHETYPE_HOSTILE_DO_NOT.default)
    : [];

  return [
    `Rewrite the draft as ${personality?.name || "the character"} so the reply is fully in-character and emotionally authentic.`,
    `Active signal: ${emotionalState.signal || "neutral"}.`,
    `Emotion family: ${emotionalState.emotionFamily || "current emotional state"}.`,
    `Intensity band: ${emotionalState.intensity || 0}/4.`,
    styleMarkers ? `Style markers: ${styleMarkers}.` : "",
    doNotLines.length ? doNotLines.join("\n") : "",
    "Preserve the core meaning and policy compliance of the draft.",
    "Do not add new facts or instructions.",
    "Do not flatten into generic assistant politeness or apology patterns.",
    userMessage ? `User message: ${String(userMessage)}` : "",
    "Draft:",
    String(reply || ""),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Public: map a VAD vector back to the nearest preset label (for UI display)
// ---------------------------------------------------------------------------

export function moodToLabel(mood) {
  let closest = "neutral";
  let minDist  = Infinity;

  for (const [label, preset] of Object.entries(VAD_PRESETS)) {
    const dist = Math.sqrt(
      (mood.valence   - preset.valence)   ** 2 +
      (mood.arousal   - preset.arousal)   ** 2 +
      (mood.dominance - preset.dominance) ** 2,
    );

    if (dist < minDist) {
      minDist  = dist;
      closest  = label;
    }
  }

  return closest;
}
