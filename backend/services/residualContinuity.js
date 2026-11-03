// Residual emotional continuity.
//
// Looks at the per-user mood history already loaded for a signed-in chat and,
// when valence has stayed meaningfully below the personality baseline, returns
// one short system note. The note colors phrasing. It does not replace identity
// or behavior rules. Anonymous and guide sessions never call this, because they
// have no per-user history.
//
// Cooldown is process-local. The mood table schema and the load/save path stay
// unchanged. A restart can allow the note once more if the history still qualifies.

export const RESIDUAL_WINDOW = 5;
export const RESIDUAL_MIN_POINTS = 4;
export const RESIDUAL_VALENCE_GAP = 0.2;
export const RESIDUAL_COOLDOWN_TURNS = 5;

export const RESIDUAL_NOTES = {
  default: "You are still carrying a slight edge from earlier; let it color phrasing without dominating the reply.",
  sensitive: "You are still carrying a noticeable edge from earlier; let it color phrasing without dominating the reply.",
  stoic: "A faint edge from earlier is still present; let it tint phrasing only, without dominating the reply.",
};

const lastInjectedTurn = new Map();

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function residualTone(personality = {}) {
  const sensitivity = Number(personality?.moodSensitivity);
  if (Number.isFinite(sensitivity) && sensitivity !== 1) {
    if (sensitivity >= 1.3) return "sensitive";
    if (sensitivity <= 0.7) return "stoic";
  }

  const corpus = [
    ...(Array.isArray(personality?.traits) ? personality.traits : []),
    personality?.creativeContext || "",
  ].join(" ").toLowerCase();
  const sensitive = /sensitive|empathetic|emotional|volatile|passionate|fierce|intense|tragic_villain/.test(corpus);
  const stoic = /stoic|cold|detached|calculating|reserved|patient|measured|composed|disciplined|narrative_antagonist/.test(corpus);
  if (sensitive && !stoic) return "sensitive";
  if (stoic && !sensitive) return "stoic";
  return "default";
}

export function assessResidualContinuity({ history, baseline, personality } = {}) {
  const points = Array.isArray(history) ? history : [];
  const window = points.slice(-RESIDUAL_WINDOW);
  const valences = window
    .map((point) => finiteOrNull(point?.valence))
    .filter((value) => value !== null);
  const baselineValence = finiteOrNull(baseline?.valence);
  const tone = residualTone(personality);

  if (baselineValence === null || valences.length < RESIDUAL_MIN_POINTS) {
    return {
      active: false,
      averageValence: null,
      baselineValence,
      gap: null,
      sampleCount: valences.length,
      tone,
      note: null,
    };
  }

  const averageValence = valences.reduce((sum, value) => sum + value, 0) / valences.length;
  const gap = baselineValence - averageValence;
  const active = gap >= RESIDUAL_VALENCE_GAP;

  return {
    active,
    averageValence,
    baselineValence,
    gap,
    sampleCount: valences.length,
    tone,
    note: active ? RESIDUAL_NOTES[tone] || RESIDUAL_NOTES.default : null,
  };
}

export function residualCooldownKey(personalityId, userId) {
  const personality = Number(personalityId);
  const user = Number(userId);
  if (!Number.isInteger(personality) || personality <= 0) return "";
  if (!Number.isInteger(user) || user <= 0) return "";
  return `${personality}:${user}`;
}

export function resetResidualCooldown(key = "") {
  if (key) {
    lastInjectedTurn.delete(key);
    return;
  }
  lastInjectedTurn.clear();
}

// Returns the note when the history qualifies and this user/personality is
// outside the cooldown. Turn index is the conversation turn, not the raw
// message-row count. A blocked turn does not move the cooldown clock.
export function resolveResidualNote({
  personalityId,
  userId,
  history,
  baseline,
  personality,
  turnIndex,
} = {}) {
  const assessment = assessResidualContinuity({ history, baseline, personality });
  if (!assessment.active || !assessment.note) return null;

  const key = residualCooldownKey(personalityId, userId);
  const turn = finiteOrNull(turnIndex);
  if (!key || turn === null) return null;

  const lastTurn = lastInjectedTurn.get(key);
  if (Number.isFinite(lastTurn) && (turn - lastTurn) < RESIDUAL_COOLDOWN_TURNS) {
    return null;
  }

  lastInjectedTurn.set(key, turn);
  return assessment.note;
}
