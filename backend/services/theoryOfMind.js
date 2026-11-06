// Builds a short read of what the user likely wants.
// Consumes user affect, the user model, and the recent conversation.
// Does not write character VAD or EmotionFrame.

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function focusLabel(affect, message) {
  const focus = String(affect?.focus || "").replace(/\s+/g, " ").trim();
  if (focus) return focus;
  const text = String(message || "").replace(/\s+/g, " ").trim();
  if (!text) return "this";
  return text.length > 80 ? `${text.slice(0, 77).trim()}...` : text;
}

function recurringTopic(userModel, focus) {
  const topics = Array.isArray(userModel?.topics) ? userModel.topics : [];
  const needle = String(focus || "").trim().toLowerCase();
  if (!needle || needle === "this") return null;
  return topics.find((topic) => String(topic?.label || "").toLowerCase() === needle) || null;
}

export function buildTheoryOfMind({ affect = null, userModel = null, message = "", history = [] } = {}) {
  const focus = focusLabel(affect, message);
  const confidence = clamp(affect?.confidence ?? 0.3, 0, 1);
  const intent = affect?.intent || "unclear";
  const valence = Number(affect?.valence) || 0;
  const arousal = Number(affect?.arousal) || 0;
  const recentCount = Array.isArray(history) ? history.length : 0;

  let want = "steady_reply";
  let note;

  if (!affect || (intent === "unclear" && confidence < 0.4)) {
    note = "User tone is unclear; do not assume a strong feeling.";
  } else if (intent === "seek_acknowledgment" || (intent === "vent" && valence < -0.3)) {
    note = `User appears frustrated about ${focus}; likely wants acknowledgment before solution.`;
    want = "acknowledgment_before_solution";
  } else if (intent === "distress" && valence < -0.3 && arousal < 0.5) {
    note = `User appears low about ${focus}; likely wants a steady presence before advice.`;
    want = "acknowledgment_before_solution";
  } else if (intent === "ask_help" && valence < -0.35) {
    note = `User appears frustrated about ${focus} and is asking for help; likely wants a brief acknowledgment, then the steps.`;
    want = "acknowledge_then_steps";
  } else if (intent === "ask_help") {
    note = `User is asking for help with ${focus}; likely wants a direct answer.`;
    want = "direct_help";
  } else if (intent === "gratitude") {
    note = "User is expressing thanks; likely wants a brief acknowledgment rather than a new plan.";
    want = "brief_warmth";
  } else if (intent === "share" && valence > 0.3) {
    note = `User is sharing something positive about ${focus}; likely wants that noticed before a redirect.`;
    want = "notice_positive";
  } else if (intent === "greet") {
    note = "User is opening the conversation; likely wants a short in-character greeting.";
    want = "brief_greeting";
  } else {
    note = `User intent looks like ${intent} around ${focus}; keep the reply matched to what they asked.`;
  }

  const recurring = recurringTopic(userModel, focus);
  if (recurring && Number(recurring.count) >= 3 && Number(recurring.lastValence) < -0.2) {
    note = `${note} This concern has come up ${recurring.count} times.`;
    if (want === "steady_reply" || want === "direct_help") want = "ongoing_concern";
  } else if (!affect && recentCount === 0) {
    note = "User tone is unclear; do not assume a strong feeling.";
    want = "steady_reply";
  }

  return {
    note,
    focus,
    want,
    confidence: Math.round(confidence * 100) / 100,
    promptFragment: note,
  };
}
