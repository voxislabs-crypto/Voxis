function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(Math.round(number * 100) / 100);
}

// Prompt fragment only. The character mood path does not read this section.
export function buildUserContextPromptSection(userContext) {
  if (!userContext || typeof userContext !== "object") return "";

  const lines = [
    "== USER CONTEXT ==",
    "This is read-only context about the user. It does not change your own mood or identity.",
  ];
  const affect = userContext.affect;
  if (affect && typeof affect === "object") {
    lines.push(
      `User affect: valence ${round(affect.valence)}, arousal ${round(affect.arousal)}, intent ${affect.intent || "unclear"}, confidence ${round(affect.confidence)}.`,
    );
  }
  const note = userContext.theoryOfMind?.promptFragment || userContext.theoryOfMind?.note;
  if (note) lines.push(`Theory of mind: ${note}`);
  if (userContext.adaptation?.promptFragment) lines.push(userContext.adaptation.promptFragment);

  if (lines.length <= 2) return "";
  return lines.join("\n").slice(0, 900);
}
