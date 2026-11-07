import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildPersonaPromptPackage } from "../services/llmService.js";
import {
  applyMaxTokensHint,
  buildResponseStrategyPromptSection,
  classifyResponseStrategy,
  isResponseStrategyEnabled,
  RESPONSE_LENGTH_DIRECTIVES,
} from "../services/responseStrategy.js";

const personality = {
  id: 910430,
  name: "Length Persona",
  description: "A steady test persona.",
  traits: ["steady"],
  behaviorRules: ["answer plainly"],
  quirks: [],
  mood: "calm",
};

describe("response length strategy", () => {
  it("keeps a greeting brief", () => {
    const strategy = classifyResponseStrategy({
      message: "hey",
      mood: { valence: 0.8, arousal: 0.9, dominance: 0.4 },
      energy: "high",
    });

    expect(strategy.length).toBe("brief");
    expect(strategy.reason).toMatch(/greeting/i);
    expect(strategy.maxTokensHint).toBe(120);
    expect(buildResponseStrategyPromptSection(strategy)).toBe(
      `== RESPONSE LENGTH ==\n${RESPONSE_LENGTH_DIRECTIVES.brief}`,
    );
  });

  it("lets a short request run at normal length for any persona", () => {
    const greet = { valence: 0.1, arousal: 0.3, intent: "greet", confidence: 0.7 };
    const joke = classifyResponseStrategy({
      message: "Hey Ara tell me a joke",
      affect: greet,
    });
    const story = classifyResponseStrategy({ message: "Hey, tell me a story" });
    const oneWord = classifyResponseStrategy({ message: "joke" });

    expect(joke.length).toBe("normal");
    expect(joke.maxTokensHint).toBeUndefined();
    expect(story.length).toBe("normal");
    expect(oneWord.length).toBe("normal");
    expect(classifyResponseStrategy({ message: "Hey Ara", affect: greet }).length).toBe("brief");
  });

  it("keeps acknowledgments and short check-ins brief", () => {
    expect(classifyResponseStrategy({ message: "thanks" }).length).toBe("brief");
    expect(classifyResponseStrategy({ message: "you there?" }).length).toBe("brief");
    expect(classifyResponseStrategy({
      message: "lunch was fine",
      affect: { valence: 0.1, arousal: 0.2, intent: "share", confidence: 0.4 },
    }).length).toBe("brief");
  });

  it("lets a deep question run long", () => {
    const strategy = classifyResponseStrategy({
      message: "Can you explain how the memory decay works when two facts conflict?",
    });

    expect(strategy.length).toBe("expansive");
    expect(strategy.reason).toMatch(/deeper question/i);
    expect(strategy.maxTokensHint).toBeUndefined();
    expect(buildResponseStrategyPromptSection(strategy)).toContain(RESPONSE_LENGTH_DIRECTIVES.expansive);
  });

  it("expands a high-arousal topic and a goal-relevant turn", () => {
    const aroused = classifyResponseStrategy({
      message: "I am so frustrated about the deploy",
      affect: { valence: -0.7, arousal: 0.8, intent: "vent", confidence: 0.8, focus: "the deploy" },
    });
    const relevant = classifyResponseStrategy({
      message: "The harbor again.",
      goals: ["protect the harbor"],
      memoryFacts: [],
    });

    expect(aroused.length).toBe("expansive");
    expect(aroused.reason).toMatch(/high-arousal/i);
    expect(relevant.length).toBe("expansive");
    expect(relevant.reason).toMatch(/goals or memory/i);
  });

  it("uses character energy only on a substantive turn", () => {
    const message = "I have been thinking about what you said last night and I am not sure I agree with it";
    const hot = classifyResponseStrategy({
      message,
      mood: { valence: -0.2, arousal: 0.82, dominance: 0.1 },
      affect: { valence: -0.2, arousal: 0.5, intent: "unclear", confidence: 0.4 },
    });
    const calm = classifyResponseStrategy({
      message,
      mood: { valence: 0, arousal: 0.1, dominance: 0 },
      energy: "low",
    });

    expect(hot.length).toBe("expansive");
    expect(hot.reason).toMatch(/character energy/i);
    expect(calm.length).toBe("normal");
    expect(buildResponseStrategyPromptSection(calm)).toContain(RESPONSE_LENGTH_DIRECTIVES.normal);
  });

  it("does not treat a short answer to a question as a check-in", () => {
    const strategy = classifyResponseStrategy({
      message: "the harbor",
      history: [
        { role: "assistant", content: "Which place did you mean?" },
      ],
      goals: ["protect the harbor"],
    });

    expect(strategy.length).not.toBe("brief");
  });

  it("can be turned off without classifying", () => {
    expect(isResponseStrategyEnabled({})).toBe(true);
    expect(isResponseStrategyEnabled({ VOXIS_RESPONSE_STRATEGY: "off" })).toBe(false);
    expect(classifyResponseStrategy({ message: "hey", enabled: false })).toBeNull();
    expect(buildResponseStrategyPromptSection(null)).toBe("");
  });

  it("adds the directive only when a strategy is passed", () => {
    const brief = classifyResponseStrategy({ message: "hey" });
    const withStrategy = buildPersonaPromptPackage(personality, [], "hey", {
      responseStrategy: brief,
    });
    const withoutStrategy = buildPersonaPromptPackage(personality, [], "hey", {});

    expect(withStrategy.prompt).toContain("== RESPONSE LENGTH ==");
    expect(withStrategy.prompt).toContain("Reply in 1–2 short sentences.");
    expect(withStrategy.debug.sections.responseStrategy.length).toBe("brief");
    expect(withoutStrategy.prompt).not.toContain("== RESPONSE LENGTH ==");
  });

  it("adds a soft token hint only for a brief cap", () => {
    expect(applyMaxTokensHint({ model: "m", messages: [], temperature: 0.85 }, 120)).toMatchObject({
      max_tokens: 120,
    });
    const open = applyMaxTokensHint({ model: "m", temperature: 0.85 }, undefined);
    expect(open.max_tokens).toBeUndefined();
  });

  it("stays off the mood and memory writers", () => {
    const source = readFileSync(new URL("../services/responseStrategy.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/moodEngine|emotionSpectrum|interpretEmotionSpectrum|stepMood|upsertMemory/);

    const chat = readFileSync(new URL("../controllers/chatController.js", import.meta.url), "utf8");
    const chatStart = chat.indexOf("export async function chatHandler");
    const chatBody = chat.slice(chatStart);
    const mood = chatBody.indexOf("stepAndPersistTurnMood({");
    const affect = chatBody.indexOf("userContext = runUserContextTurn");
    const strategy = chatBody.indexOf("responseStrategy = classifyResponseStrategy");
    const prompt = chatBody.indexOf("responseStrategy,");
    expect(strategy).toBeGreaterThan(mood);
    expect(strategy).toBeGreaterThan(affect);
    expect(prompt).toBeGreaterThan(strategy);

    const openerBody = chat.slice(chat.indexOf("export async function personaOpenerHandler"), chatStart);
    expect(openerBody.indexOf("responseStrategy = classifyResponseStrategy")).toBeGreaterThan(openerBody.indexOf("advanceTurnMood"));
    expect(openerBody.indexOf("responseStrategy,")).toBeGreaterThan(openerBody.indexOf("userContext = runUserContextTurn"));
  });
});
