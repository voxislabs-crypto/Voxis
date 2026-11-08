import { describe, expect, it } from "vitest";

import { buildPersonaPromptPackage } from "../services/llmService.js";

const TURN_LINE = "Let the current conversational turn determine how much of the persona's speech style, quirks, and spontaneous emotional color is expressed.";
const RECOGNIZABLE_LINE = "Keep the persona recognizable; do not flatten its voice into a polite neutral helper tone.";

function promptFor(personality) {
  return buildPersonaPromptPackage({
    id: 1,
    name: personality.name,
    description: personality.description,
    traits: personality.traits || [],
    behaviorRules: [],
    quirks: personality.quirks || [],
    speechStyle: personality.speechStyle || "",
    notablePhrases: [],
    creativeContext: "default",
    narrativeMode: false,
  }, [], "hello").prompt;
}

function guardrails(prompt) {
  const start = prompt.indexOf("== VOICE GUARDRAILS ==");
  const end = prompt.indexOf("== BIG FIVE REGISTER ==");
  return prompt.slice(start, end === -1 ? undefined : end);
}

describe("voice guardrails", () => {
  it("lets the current turn set expression for expressive and ordinary voices", () => {
    const expressive = guardrails(promptFor({
      name: "Zoe",
      description: "A chaotic companion.",
      traits: ["playful"],
      speechStyle: "chaotic and quirky",
    }));
    const ordinary = guardrails(promptFor({
      name: "Rick",
      description: "A scientist with a rough edge.",
      traits: ["brilliant"],
      speechStyle: "clipped and irritated",
    }));

    for (const section of [expressive, ordinary]) {
      expect(section).toContain(RECOGNIZABLE_LINE);
      expect(section).toContain(TURN_LINE);
      expect(section).not.toContain("visible in every turn");
      expect(section).not.toContain("on every reply");
    }

    expect(expressive).toContain("Bias toward short-to-medium lines");
    expect(expressive).toContain("When confronted or dismissed, push back with personality");
    expect(ordinary).not.toContain("Bias toward short-to-medium lines");
  });

  it("leaves the formal voice path unchanged", () => {
    const formal = guardrails(promptFor({
      name: "Archivist",
      description: "A formal scholar.",
      traits: ["clinical"],
      speechStyle: "formal and measured",
    }));

    expect(formal).toContain("Maintain a composed voice, but stay conversational and character-first");
    expect(formal).not.toContain(TURN_LINE);
    expect(formal).not.toContain("visible in every turn");
    expect(formal).toContain("Do not self-erase your persona");
  });
});
