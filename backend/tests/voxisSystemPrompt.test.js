import { readFileSync } from "fs";

import { describe, expect, it } from "vitest";

import { buildPersonaPromptPackage } from "../services/llmService.js";
import {
  buildVoxisPrompt,
  voxisPersonaShapingBlock,
  voxisSystemPrompt,
} from "../prompts/voxisSystemPrompt.js";

const SHAPING_MARK = "You are Voxis, the core intelligence of the platform.";

describe("voxis persona shaping block", () => {
  it("prepends the shaping voice on the guide create and edit prompt", () => {
    const prompt = buildVoxisPrompt(
      { name: "Ara", description: "A sharp companion.", traits: [], behaviorRules: [], quirks: [] },
      [{ id: 23, name: "Ara" }],
      "edit context",
    );

    expect(prompt.startsWith("**Identity**")).toBe(true);
    expect(prompt).toContain(SHAPING_MARK);
    expect(prompt).toContain("Make the sentences shorter and raise arousal by 10.");
    expect(prompt).toContain("raise the VAD arousal baseline by 0.10");
    expect(prompt.indexOf(SHAPING_MARK)).toBeLessThan(prompt.indexOf("living personality engine"));
    expect(prompt).toContain("Name: Ara");
  });

  it("keeps the stored architect prompt free of the shaping block", () => {
    expect(voxisSystemPrompt).not.toContain(SHAPING_MARK);
    expect(voxisPersonaShapingBlock).toContain(SHAPING_MARK);
  });

  it("stays off normal persona chat and the personality store", () => {
    const persona = buildPersonaPromptPackage({
      id: 23,
      name: "Ara",
      description: "A sharp, emotionally present intelligence.",
      traits: ["dry"],
      behaviorRules: [],
      quirks: [],
      speechStyle: "measured",
      creativeContext: "default",
    }, [], "hello");

    expect(persona.prompt).not.toContain(SHAPING_MARK);
    expect(persona.prompt).not.toContain("calm librarian");

    const storeFiles = [
      "../models/personalityModel.js",
      "../controllers/personalityController.js",
      "../controllers/chatController.js",
    ];
    for (const relativePath of storeFiles) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(source).not.toContain(SHAPING_MARK);
    }
  });
});
