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

// Decay rate per conversation turn (how quickly mood returns to baseline).
const DECAY_RATE = 0.08;

// Momentum coefficient — prevents instant emotional jumps (inertia).
const MOMENTUM = 0.75;

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

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

function clamp(v, min = -1.0, max = 1.0) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
    valenceImpact   -= 0.38;
    arousalImpact   += 0.42;
    dominanceImpact += 0.22;
  }
  if (RX.negativeLow.test(text)) {
    valenceImpact   -= 0.28;
    arousalImpact   -= 0.18;
    dominanceImpact -= 0.12;
  }
  if (RX.positiveHigh.test(text)) {
    valenceImpact   += 0.38;
    arousalImpact   += 0.22;
    dominanceImpact += 0.10;
  }
  if (RX.positiveSoft.test(text)) {
    valenceImpact   += 0.18;
    arousalImpact   -= 0.05;
  }
  if (RX.challenging.test(text)) {
    valenceImpact   -= 0.12;
    arousalImpact   += 0.18;
    dominanceImpact += 0.28; // challenge pushes agent to assert
  }
  if (RX.vulnerable.test(text)) {
    // Target vulnerability increases the agent's felt dominance
    dominanceImpact += 0.22;
    arousalImpact   += 0.10;
    valenceImpact   -= 0.06;
  }
  if (RX.commanding.test(text)) {
    // Being commanded slightly destabilises agent dominance
    valenceImpact   -= 0.12;
    arousalImpact   += 0.22;
    dominanceImpact -= 0.18;
  }
  if (RX.playful.test(text)) {
    valenceImpact   += 0.22;
    arousalImpact   += 0.15;
  }
  if (hasExclamation || hasCaps) {
    arousalImpact += 0.18;
  }
  if (questionCount >= 2) {
    arousalImpact += 0.08;
  }

  return { valenceImpact, arousalImpact, dominanceImpact };
}

// ---------------------------------------------------------------------------
// Public: advance mood by one turn
// ---------------------------------------------------------------------------

export function stepMood({ currentMood, baseline, message, personality }) {
  const sensitivity = getSensitivity(personality);
  const event = analyzeMessageSentiment(message);

  // Apply sensitivity-scaled impact
  const impacted = {
    valence:   currentMood.valence   + event.valenceImpact   * sensitivity,
    arousal:   currentMood.arousal   + event.arousalImpact   * sensitivity,
    dominance: currentMood.dominance + event.dominanceImpact * sensitivity,
  };

  // Momentum: blend current with impacted to prevent instant jumps
  const smoothed = {
    valence:   MOMENTUM * currentMood.valence   + (1 - MOMENTUM) * impacted.valence,
    arousal:   MOMENTUM * currentMood.arousal   + (1 - MOMENTUM) * impacted.arousal,
    dominance: MOMENTUM * currentMood.dominance + (1 - MOMENTUM) * impacted.dominance,
  };

  // Exponential-style decay toward baseline
  return {
    valence:   clamp(lerp(smoothed.valence,   baseline.valence,   DECAY_RATE)),
    arousal:   clamp(lerp(smoothed.arousal,   baseline.arousal,   DECAY_RATE)),
    dominance: clamp(lerp(smoothed.dominance, baseline.dominance, DECAY_RATE)),
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
  if (mood.valence < -0.5) {
    tendencies.push("responses carry open dissatisfaction, sharp criticism, or dry contempt");
  } else if (mood.valence < -0.2 || vDelta < -0.28) {
    tendencies.push("an undercurrent of displeasure tints your phrasing without fully surfacing");
  } else if (mood.valence > 0.55) {
    tendencies.push("a genuine warmth — unusual or unusual for you — informs your word choice");
  } else if (mood.valence > 0.25 || vDelta > 0.22) {
    tendencies.push("a slightly more open and favourable tone than your baseline");
  }

  // Arousal axis (calm ↔ energized)
  if (mood.arousal > 0.65 || aDelta > 0.38) {
    tendencies.push("speech is faster, sharper, and more compressed — patience for meandering is thin");
  } else if (mood.arousal > 0.35 || aDelta > 0.2) {
    tendencies.push("you are alert and engaged, responses have more forward momentum");
  } else if (mood.arousal < -0.35 || aDelta < -0.32) {
    tendencies.push("responses are slower and flatter than usual — low energy, low urgency");
  }

  // Dominance axis (passive ↔ assertive)
  if (mood.dominance > 0.65 || dDelta > 0.32) {
    tendencies.push("assertive and expectant — you assume compliance rather than asking for it");
  } else if (mood.dominance > 0.40 || dDelta > 0.2) {
    tendencies.push("slightly more directive than usual");
  } else if (mood.dominance < -0.25 || dDelta < -0.28) {
    tendencies.push("marginally more yielding than usual — though you would not frame it that way");
  }

  return tendencies;
}

// ---------------------------------------------------------------------------
// Public: build the prompt fragment injected just before the user turn
// ---------------------------------------------------------------------------

export function moodToPromptFragment(mood, baseline) {
  const tendencies = vadToTendencies(mood, baseline);

  if (!tendencies.length) return null;

  const r = (n) => Math.round(n * 100) / 100;

  return [
    "[CURRENT EMOTIONAL STATE]",
    `V ${r(mood.valence)} · A ${r(mood.arousal)} · D ${r(mood.dominance)}`,
    "Active behavioral tendencies:",
    ...tendencies.map((t) => `- ${t}`),
    "This is a transient internal state — it modulates your expression without overriding your identity or values.",
  ].join("\n");
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
