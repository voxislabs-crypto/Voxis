// ---------------------------------------------------------------------------
// Voxis Emotion Memory Drift
//
// Characters develop emotional habits over time based on interaction history.
// Not fine-tuning — more like emotional scars, reflexes, and reinforced patterns.
//
// Architecture:
//   EmotionDriftState — per-persona drift weights per emotion
//   applyEmotionDrift  — reinforce drift when an emotion fires
//   applyDecay         — decay unused emotions toward baseline
//   computeSingingLeakage — check if drift has pushed singing threshold over
//
// Anonymous sessions persist this JSON on personalities.emotionDrift.
// Signed-in sessions persist it on personality_user_mood.emotionDrift.
// ---------------------------------------------------------------------------

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

// Known trackable emotion labels — must match EABG keys in singingEngine.js
const TRACKABLE_EMOTIONS = [
  "dominant",
  "excited",
  "playful",
  "seductive",
  "calm",
  "cold",
  "assertive",
  "angry",
  "neutral",
];

// How much each occurrence reinforces the drift weight (per unit of intensity)
const DRIFT_REINFORCEMENT_RATE = 0.02;

// Maximum drift multiplier relative to baseline weight
const DRIFT_MAX_MULTIPLIER = 2.5;
const DRIFT_MIN_MULTIPLIER = 0.5;

// Default baseline weight for each emotion (equal odds)
const DRIFT_BASELINE = 1.0;

// Decay rate per second of real elapsed time — fast enough to feel alive,
// slow enough to remember yesterday's tone.
const DEFAULT_DECAY_RATE = 0.004;

// Decay rates per archetype — more volatile personas forget faster,
// stoic ones carry scars longer.
const ARCHETYPE_DECAY_RATES = {
  none:       DEFAULT_DECAY_RATE,
  latent:     0.003,    // slow decay — habits persist
  expressive: 0.005,    // faster — more emotionally fluid
  chaotic:    0.007,    // fastest — volatile by nature
};

// Singing leakage threshold — drift must reach this multiple of baseline
// before singing leaks through as a natural artifact
const SINGING_LEAK_THRESHOLD = 1.8;

// How much drift boost is added to singing chance when threshold is crossed
const SINGING_LEAK_BOOST = 0.04;

// ---------------------------------------------------------------------------
// Emotion Graph Edges — influence between emotion nodes
// positive influence: firing A raises B
// negative influence: firing A suppresses B
// ---------------------------------------------------------------------------

export const DEFAULT_EMOTION_EDGES = [
  { from: "dominant",  to: "seductive",  influence:  0.40 },
  { from: "dominant",  to: "cold",       influence:  0.20 },
  { from: "angry",     to: "dominant",   influence:  0.60 },
  { from: "angry",     to: "playful",    influence: -0.30 },
  { from: "seductive", to: "playful",    influence:  0.25 },
  { from: "excited",   to: "playful",    influence:  0.50 },
  { from: "playful",   to: "excited",    influence:  0.30 },
  { from: "calm",      to: "cold",       influence:  0.15 },
  { from: "calm",      to: "angry",      influence: -0.40 },
  { from: "cold",      to: "dominant",   influence: -0.20 },
];

// Singing pressure accumulates on nodes — it builds like steam in a pipe.
// When total pressure exceeds the threshold, singing emerges.
const SINGING_PRESSURE_PER_INTENSITY = 0.5;  // added per trigger
const SINGING_PRESSURE_DECAY = 0.98;          // multiplied each turn (fades fast)
const SINGING_PRESSURE_GLOBAL_THRESHOLD = 1.0; // trigger threshold

// ---------------------------------------------------------------------------
// Build a fresh drift state for a persona
// ---------------------------------------------------------------------------

export function initDriftState(existingDrift = {}) {
  const state = {};
  for (const emotion of TRACKABLE_EMOTIONS) {
    const existing = existingDrift[emotion];
    state[emotion] = {
      baselineWeight: DRIFT_BASELINE,
      driftWeight: typeof existing?.driftWeight === "number" ? existing.driftWeight : DRIFT_BASELINE,
      exposureCount: typeof existing?.exposureCount === "number" ? existing.exposureCount : 0,
      intensityMemory: typeof existing?.intensityMemory === "number" ? existing.intensityMemory : 0,
      lastTriggeredMs: typeof existing?.lastTriggeredMs === "number" ? existing.lastTriggeredMs : 0,
      // singing pressure: builds with repeated emotional intensity, decays naturally
      singingPressure: typeof existing?.singingPressure === "number" ? existing.singingPressure : 0,
    };
  }
  return state;
}

// ---------------------------------------------------------------------------
// Apply reinforcement when an emotion fires this turn
// intensity: 0.0 - 1.0 (emotional intensity of the current mood event)
// ---------------------------------------------------------------------------

export function applyEmotionDrift(driftState, emotionLabel, intensity = 0.5, edges = DEFAULT_EMOTION_EDGES) {
  const label = String(emotionLabel || "neutral").toLowerCase();
  if (!TRACKABLE_EMOTIONS.includes(label)) return driftState;

  const state = { ...driftState };
  const mem = { ...state[label] };

  mem.exposureCount += 1;
  mem.intensityMemory = mem.intensityMemory * 0.9 + intensity * 0.1; // rolling average
  mem.lastTriggeredMs = Date.now();

  const reinforcement = intensity * DRIFT_REINFORCEMENT_RATE;
  mem.driftWeight = clamp(
    mem.driftWeight + reinforcement,
    mem.baselineWeight * DRIFT_MIN_MULTIPLIER,
    mem.baselineWeight * DRIFT_MAX_MULTIPLIER,
  );

  // Singing pressure builds with intensity — like steam in a pipe
  mem.singingPressure = (mem.singingPressure || 0) + intensity * SINGING_PRESSURE_PER_INTENSITY;

  state[label] = mem;

  // Graph propagation — ripple this emotion's influence to connected nodes
  const outgoing = edges.filter((e) => e.from === label);
  for (const edge of outgoing) {
    const targetEmotion = edge.to;
    if (!TRACKABLE_EMOTIONS.includes(targetEmotion)) continue;
    const target = { ...state[targetEmotion] };
    const influenceDelta = intensity * edge.influence * DRIFT_REINFORCEMENT_RATE * 0.5;
    target.driftWeight = clamp(
      target.driftWeight + influenceDelta,
      target.baselineWeight * DRIFT_MIN_MULTIPLIER,
      target.baselineWeight * DRIFT_MAX_MULTIPLIER,
    );
    state[targetEmotion] = target;
  }

  return state;
}

// ---------------------------------------------------------------------------
// Apply natural decay to all emotion drift weights
// deltaSeconds: time since last decay pass (or per-turn constant)
// If decayRate is not provided, uses the DEFAULT_DECAY_RATE
// ---------------------------------------------------------------------------

export function applyDecay(driftState, deltaSeconds = 60, archetype = "none") {
  const decayRate = ARCHETYPE_DECAY_RATES[archetype] ?? DEFAULT_DECAY_RATE;
  const state = { ...driftState };

  for (const emotion of TRACKABLE_EMOTIONS) {
    const mem = { ...state[emotion] };
    const decayed = mem.driftWeight - decayRate * deltaSeconds;
    mem.driftWeight = Math.max(mem.baselineWeight * DRIFT_MIN_MULTIPLIER, decayed);
    // Singing pressure decays naturally each turn
    mem.singingPressure = (mem.singingPressure || 0) * SINGING_PRESSURE_DECAY;
    state[emotion] = mem;
  }

  return state;
}

// ---------------------------------------------------------------------------
// Check singing trigger based on accumulated pressure across all nodes
// This replaces probabilistic random with pressure-based emergence.
// Returns: { shouldSing, totalPressure, dominantNode }
// ---------------------------------------------------------------------------

export function checkSingingTrigger(driftState, globalBias = 1.0) {
  let totalPressure = 0;
  let dominantNode = "neutral";
  let maxPressure = 0;

  for (const emotion of TRACKABLE_EMOTIONS) {
    const pressure = driftState?.[emotion]?.singingPressure ?? 0;
    totalPressure += pressure;
    if (pressure > maxPressure) {
      maxPressure = pressure;
      dominantNode = emotion;
    }
  }

  const weighted = totalPressure * globalBias;
  return {
    shouldSing: weighted > SINGING_PRESSURE_GLOBAL_THRESHOLD,
    totalPressure,
    weightedPressure: weighted,
    dominantNode,
  };
}

// ---------------------------------------------------------------------------
// Compute drift-to-singing leakage boost
//
// For each dominant emotion in the drift state where the weight has crossed
// SINGING_LEAK_THRESHOLD, add a boost to the singing chance for that emotion.
//
// Returns the total boost (additive to computeSingingChance result).
// ---------------------------------------------------------------------------

export function computeSingingLeakage(driftState, emotionLabel) {
  const label = String(emotionLabel || "neutral").toLowerCase();
  const mem = driftState?.[label];
  if (!mem) return 0;

  // Only leaks if this specific emotion has been dominant
  const ratio = mem.driftWeight / mem.baselineWeight;
  if (ratio < SINGING_LEAK_THRESHOLD) return 0;

  // Scale boost by how far over the threshold we are
  const overshoot = ratio - SINGING_LEAK_THRESHOLD;
  return clamp(overshoot * SINGING_LEAK_BOOST, 0, 0.15);
}

// ---------------------------------------------------------------------------
// Get the dominant emotion in the drift state (highest drift weight)
// Used to detect "what emotional habit has formed"
// ---------------------------------------------------------------------------

export function getDominantDriftEmotion(driftState) {
  let best = "neutral";
  let bestWeight = 0;

  for (const emotion of TRACKABLE_EMOTIONS) {
    const weight = driftState?.[emotion]?.driftWeight ?? DRIFT_BASELINE;
    if (weight > bestWeight) {
      bestWeight = weight;
      best = emotion;
    }
  }

  return { emotion: best, weight: bestWeight };
}

// ---------------------------------------------------------------------------
// Build a short textual description of the drift state — used for debug UI
// ---------------------------------------------------------------------------

export function describeDriftState(driftState) {
  const top = Object.entries(driftState || {})
    .filter(([, mem]) => mem.driftWeight > DRIFT_BASELINE * 1.1)
    .sort(([, a], [, b]) => b.driftWeight - a.driftWeight)
    .slice(0, 3)
    .map(([emotion, mem]) => `${emotion}×${mem.driftWeight.toFixed(2)}`);

  if (top.length === 0) return "baseline (no significant drift)";
  return top.join(", ");
}

// ---------------------------------------------------------------------------
// Apply emotion residue ("emotional echo" from the previous turn)
// The previous dominant emotion bleeds 15% of its weight into the new state.
// This is what makes a character still feel "a little dangerous even when calm."
// ---------------------------------------------------------------------------

export function applyEmotionResidue(driftState, previousEmotionLabel, residueFraction = 0.15) {
  const prev = String(previousEmotionLabel || "").toLowerCase();
  if (!TRACKABLE_EMOTIONS.includes(prev)) return driftState;

  const state = { ...driftState };
  const mem = { ...state[prev] };

  // Soft boost — residue keeps the previous state slightly alive
  const residue = mem.driftWeight * residueFraction;
  mem.driftWeight = Math.min(
    mem.baselineWeight * DRIFT_MAX_MULTIPLIER,
    mem.driftWeight + residue * 0.05,
  );

  state[prev] = mem;
  return state;
}

// ---------------------------------------------------------------------------
// Normalize/validate drift state from raw DB JSON
// ---------------------------------------------------------------------------

export function normalizeDriftState(raw) {
  if (!raw || typeof raw !== "object") return initDriftState({});
  return initDriftState(raw);
}
