import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import db from "../db/db.js";
import { buildPersonaPromptPackage } from "../services/llmService.js";
import { getUserContextModel, userContextScopeKey } from "../models/userContextModel.js";
import { readUserContextFlags } from "../services/userContextFlags.js";
import { buildUserContextPromptSection } from "../services/userContextPrompt.js";
import { runUserContextTurn } from "../services/userContextTurn.js";

const personalityId = 910420;
const userId = 910521;

function ensureRows() {
  db.prepare(
    `INSERT OR IGNORE INTO personalities (id, name, description, traits, quirks, mood, systemPrompt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(personalityId, "Context Turn Persona", "A steady test persona.", "[]", "[]", "calm", "test prompt");
  db.prepare("INSERT OR IGNORE INTO users (id, displayName) VALUES (?, ?)").run(userId, "Context Turn User");
}

function clearModels() {
  db.prepare("DELETE FROM user_context_models WHERE personalityId = ?").run(personalityId);
}

describe("user context turn", () => {
  it("reads each layer from its own flag", () => {
    expect(readUserContextFlags({})).toEqual({
      affect: true,
      model: true,
      theory: true,
      adaptation: true,
    });
    expect(readUserContextFlags({
      VOXIS_USER_AFFECT: "false",
      VOXIS_USER_MODEL: "0",
      VOXIS_THEORY_OF_MIND: "off",
      VOXIS_USER_ADAPTATION: "no",
    })).toEqual({
      affect: false,
      model: false,
      theory: false,
      adaptation: false,
    });
  });

  it("runs affect, model, theory, and adaptation for one turn", () => {
    ensureRows();
    clearModels();

    const context = runUserContextTurn({
      message: "I am so frustrated about the deploy",
      history: [{ role: "user", content: "the deploy failed yesterday" }],
      userId,
      personalityId,
      sessionKey: `${personalityId}:${userId}`,
      now: new Date("2026-11-04T16:00:00.000Z"),
      flags: { affect: true, model: true, theory: true, adaptation: true },
    });

    expect(context.affect.intent).toBe("vent");
    expect(context.userModel.topics[0].label).toBe("the deploy");
    expect(context.theoryOfMind.promptFragment).toContain("acknowledgment before solution");
    expect(context.adaptation.responseStyle).toBe("acknowledge-first");
    expect(getUserContextModel(personalityId, userContextScopeKey({ userId })).patterns.turnCount).toBe(1);

    clearModels();
  });

  it("skips a disabled model write and still returns affect", () => {
    ensureRows();
    clearModels();

    const context = runUserContextTurn({
      message: "I am frustrated about the deploy",
      userId,
      personalityId,
      sessionKey: `${personalityId}:anon`,
      flags: { affect: true, model: false, theory: false, adaptation: false },
    });

    expect(context.affect.intent).toBe("vent");
    expect(context.userModel).toBeNull();
    expect(context.theoryOfMind).toBeNull();
    expect(context.adaptation).toBeNull();
    expect(getUserContextModel(personalityId, userContextScopeKey({ userId }))).toBeNull();

    clearModels();
  });

  it("reaches the persona prompt and stays out when no user context is passed", () => {
    const personality = {
      id: personalityId,
      name: "Context Turn Persona",
      description: "A steady test persona.",
      traits: ["steady"],
      behaviorRules: ["answer plainly"],
      quirks: [],
      mood: "calm",
    };
    const userContext = {
      affect: { valence: -0.7, arousal: 0.78, intent: "vent", confidence: 0.72 },
      theoryOfMind: {
        note: "User appears frustrated about the deploy; likely wants acknowledgment before solution.",
        promptFragment: "User appears frustrated about the deploy; likely wants acknowledgment before solution.",
      },
      adaptation: {
        promptFragment: "Adaptation: acknowledge the feeling before offering a fix.",
      },
    };

    const withContext = buildPersonaPromptPackage(personality, [], "I am frustrated about the deploy", {
      userContext,
    });
    const withoutContext = buildPersonaPromptPackage(personality, [], "I am frustrated about the deploy", {});

    expect(buildUserContextPromptSection(userContext)).toContain("== USER CONTEXT ==");
    expect(withContext.prompt).toContain("== USER CONTEXT ==");
    expect(withContext.prompt).toContain("acknowledgment before solution");
    expect(withContext.prompt).toContain("Adaptation: acknowledge the feeling");
    expect(withContext.debug.sections.userContext.included).toBe(true);
    expect(withoutContext.prompt).not.toContain("== USER CONTEXT ==");
  });

  it("keeps the new layers off the character mood path", () => {
    const files = [
      "../services/userAffectDetector.js",
      "../services/userContextStore.js",
      "../services/theoryOfMind.js",
      "../services/userAdaptation.js",
      "../services/userContextTurn.js",
      "../services/userContextPrompt.js",
    ];
    const combined = files
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");

    expect(combined).not.toMatch(/moodEngine|emotionSpectrum|interpretEmotionSpectrum|stepMood/);
  });

  it("wires the turn into chat without taking over mood", () => {
    const source = readFileSync(new URL("../controllers/chatController.js", import.meta.url), "utf8");
    const turn = source.indexOf("userContext = runUserContextTurn");
    const mood = source.indexOf("stepMoodDetailed");
    const prompt = source.indexOf("userContext,");

    expect(turn).toBeGreaterThan(mood);
    expect(prompt).toBeGreaterThan(turn);
    expect(source).toContain("currentMoodLabel: moodLabel");
  });
});
