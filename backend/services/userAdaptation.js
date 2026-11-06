// Thin response directives derived from user signals.
// Passed to the persona prompt only. Does not write character VAD or EmotionFrame.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const DIRECTIVES = {
  acknowledgment_before_solution: {
    responseStyle: "acknowledge-first",
    pacing: "unhurried",
    contentFocus: "feeling-then-one-step",
    promptFragment: "Adaptation: acknowledge the feeling before offering a fix. Pace unhurried. Focus the concern, then one next step.",
  },
  acknowledge_then_steps: {
    responseStyle: "acknowledge-first",
    pacing: "normal",
    contentFocus: "steps",
    promptFragment: "Adaptation: acknowledge the frustration in one line, then give the steps. Pace normally.",
  },
  direct_help: {
    responseStyle: "direct",
    pacing: "normal",
    contentFocus: "steps",
    promptFragment: "Adaptation: answer the request directly. Pace normally. Focus concrete steps.",
  },
  brief_warmth: {
    responseStyle: "warm",
    pacing: "brief",
    contentFocus: "thanks",
    promptFragment: "Adaptation: keep the reply warm and brief. Do not open a new plan.",
  },
  notice_positive: {
    responseStyle: "warm",
    pacing: "normal",
    contentFocus: "the positive share",
    promptFragment: "Adaptation: notice what the user is glad about before changing the subject.",
  },
  brief_greeting: {
    responseStyle: "steady",
    pacing: "brief",
    contentFocus: "greeting",
    promptFragment: "Adaptation: greet briefly and leave room for the user.",
  },
  ongoing_concern: {
    responseStyle: "steady",
    pacing: "unhurried",
    contentFocus: "ongoing-concern",
    promptFragment: "Adaptation: treat this as an ongoing concern. Pace unhurried. Do not act as if it is new.",
  },
  steady_reply: {
    responseStyle: "steady",
    pacing: "normal",
    contentFocus: "the request",
    promptFragment: "Adaptation: stay steady. Pace normally. Focus what the user actually asked.",
  },
};

function prefersBrief(userModel) {
  const preferences = Array.isArray(userModel?.preferences) ? userModel.preferences : [];
  return preferences.some((item) => item?.kind === "likes" && /\b(short|brief|concise)\b/i.test(String(item.text || "")));
}

export function buildAdaptationDirectives({ affect = null, userModel = null, theoryOfMind = null } = {}) {
  const want = theoryOfMind?.want || "steady_reply";
  const base = { ...(DIRECTIVES[want] || DIRECTIVES.steady_reply) };
  const gapMs = Number(userModel?.timeSignals?.gapMs);
  const away = Number.isFinite(gapMs) && gapMs >= WEEK_MS;
  const rapid = Number(userModel?.patterns?.rapidTurns) >= 2 && (affect?.valence ?? 0) < -0.3;

  if (away && base.pacing === "normal") {
    base.pacing = "unhurried";
    base.promptFragment = `${base.promptFragment} The user has been away for a while; start gently.`;
  }
  if (rapid && base.responseStyle !== "acknowledge-first") {
    base.pacing = "unhurried";
    base.promptFragment = `${base.promptFragment} Recent turns are coming in fast and tense; slow the pace.`;
  }
  if (prefersBrief(userModel) && want === "direct_help") {
    base.pacing = "brief";
    base.promptFragment = `${base.promptFragment} The user prefers a brief reply.`;
  }

  return base;
}
