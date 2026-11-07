import { describe, expect, it } from "vitest";

import { getPersonalityById } from "../models/personalityModel.js";
import { buildPersonaPromptPackage } from "../services/llmService.js";
import {
  createPersonaFromConversation,
  extractIdentityStatement,
  isMetaIdentityPitch,
} from "../services/personaFromVoxis.js";

const REGINALD_PITCH = [
  "Let's bring this character to life.",
  "",
  "Meet \"Bunnyvore, the Supreme Ruler of All Things Cute and Evil\" - a self-proclaimed, yet utterly delusional, villainous mas...",
].join("\n");

const CLEAN_REGINALD = "You are Reginald P, Bunnyvore, the Supreme Ruler of All Things Cute and Evil, self-proclaimed, yet utterly delusional, and villainous.";

describe("persona identity", () => {
  it("turns Reginald's truncated pitch into a first-person identity", () => {
    expect(isMetaIdentityPitch(REGINALD_PITCH)).toBe(true);
    expect(extractIdentityStatement(REGINALD_PITCH, "Reginald P")).toBe(CLEAN_REGINALD);
    expect(extractIdentityStatement(REGINALD_PITCH, "Reginald P")).not.toMatch(/Let's bring|Meet "|mas\.\.\./);
  });

  it("leaves ordinary identities unchanged", () => {
    const ara = "A sharp, emotionally present intelligence with a long memory, dry sarcasm, and a quietly protective streak.";
    const darkAra = "A sleek cyberpunk operator with femme-fatale energy, controlled danger, and a habit of wrapping every answer in charm.";
    expect(extractIdentityStatement(ara, "Ara")).toBe(ara);
    expect(extractIdentityStatement(darkAra, "Dark Ara")).toBe(darkAra);
    expect(isMetaIdentityPitch(ara)).toBe(false);
  });

  it("does not force narrative framing from evil or villain keywords", () => {
    const created = createPersonaFromConversation(
      [{ role: "user", content: "Make an evil villain who likes bunnies." }],
      REGINALD_PITCH,
    );

    expect(created.creativeContext).toBe("default");
    expect(created.description).toBe(
      "You are Bunnyvore, the Supreme Ruler of All Things Cute and Evil, self-proclaimed, yet utterly delusional, and villainous.",
    );
    expect(created.traits).toContain("evil");
    expect(created.quirks).toContain("has a soft spot for bunnies");
  });

  it("keeps narrative framing when the conversation asks for it", () => {
    const created = createPersonaFromConversation(
      [{ role: "user", content: "Use narrative antagonist framing." }],
      "Meet \"Ivy\" - a careful rival who keeps score.",
    );

    expect(created.creativeContext).toBe("narrative_antagonist");
  });

  it("injects the cleaned identity and keeps an explicit antagonist frame on other personas", () => {
    const cleaned = buildPersonaPromptPackage({
      id: 910004,
      name: "Reginald P",
      description: REGINALD_PITCH,
      traits: ["evil", "witty"],
      behaviorRules: [],
      quirks: ["has a soft spot for bunnies"],
      speechStyle: "Calm and polite on the surface, with sharp dark humor underneath",
      creativeContext: "default",
      expressionStyle: {
        sentenceStyle: "measured and deliberate",
        interruptionRate: 0.15,
        energy: "low",
        rules: ["structured sentences", "calculated pauses"],
      },
    }, [], "hello");

    const identityAt = cleaned.prompt.indexOf("== IDENTITY ==");
    const identityBlock = cleaned.prompt.slice(identityAt, identityAt + 400);
    expect(identityBlock).toContain(CLEAN_REGINALD);
    expect(identityBlock).not.toContain("Let's bring this character");
    expect(cleaned.prompt).not.toContain("[NARRATIVE CONTEXT:");
    expect(cleaned.prompt).not.toContain("OUTWARD PRESENTATION vs. INTERNAL CALCULUS");
    expect(cleaned.prompt).toContain("== EXPRESSION STYLE ==");
    expect(cleaned.prompt).toContain("style=measured and deliberate");
    expect(cleaned.prompt).toContain("interrupt=15%");
    expect(cleaned.prompt).toContain("energy=low");
    expect(cleaned.prompt).toContain("rules=structured sentences | calculated pauses");

    const framed = buildPersonaPromptPackage({
      id: 24,
      name: "Dark Ara",
      description: "A sleek cyberpunk operator with femme-fatale energy and hidden intent.",
      traits: ["controlled"],
      behaviorRules: ["keep leverage"],
      quirks: [],
      speechStyle: "smooth",
      creativeContext: "narrative_antagonist",
      expressionStyle: {
        sentenceStyle: "long structured sentences",
        interruptionRate: 0.1,
        energy: "low",
        rules: ["calculated tone"],
      },
    }, [], "hello");

    expect(framed.prompt).toContain("[NARRATIVE CONTEXT: This is a fictional antagonistic character");
    expect(framed.prompt).toContain("== OUTWARD PRESENTATION vs. INTERNAL CALCULUS ==");
    expect(framed.prompt).toContain("A sleek cyberpunk operator with femme-fatale energy and hidden intent.");
    expect(framed.prompt).toContain("style=long structured sentences");
    expect(framed.prompt).toContain("interrupt=10%");
    expect(framed.prompt).toContain("energy=low");
    expect(framed.prompt).toContain("rules=calculated tone");
  });

  it("stores the cleaned Reginald identity without narrative framing", () => {
    const personality = getPersonalityById(910004);
    expect(personality?.name).toBe("Reginald P");
    expect(personality.description).toBe(CLEAN_REGINALD);
    expect(personality.creativeContext).toBe("default");
    expect(personality.systemPrompt).toContain(CLEAN_REGINALD);
    expect(personality.systemPrompt).not.toContain("Let's bring this character");

    const prompt = buildPersonaPromptPackage(personality, [], "hello").prompt;
    expect(prompt).toContain(CLEAN_REGINALD);
    expect(prompt).not.toContain("Let's bring this character");
    expect(prompt).not.toContain("[NARRATIVE CONTEXT:");
    expect(prompt).not.toContain("OUTWARD PRESENTATION vs. INTERNAL CALCULUS");
    expect(prompt).toContain("== EXPRESSION STYLE ==");
    expect(prompt).toContain("interrupt=30%");
    expect(prompt).toContain("energy=medium");
  });
});
