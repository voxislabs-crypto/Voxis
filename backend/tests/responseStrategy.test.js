import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildPersonaPromptPackage } from "../services/llmService.js";
import {
  applyMaxTokensHint,
  BRIEF_SAFETY_CEILING,
  buildResponseStrategyPromptSection,
  classifyResponseStrategy,
  isResponseStrategyEnabled,
  resolveLengthTarget,
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
    expect(strategy.target).toEqual({
      minSentences: 1,
      maxSentences: 3,
      minTokens: 40,
      maxTokens: 100,
    });
    expect(strategy.maxTokensHint).toBe(BRIEF_SAFETY_CEILING);
    expect(BRIEF_SAFETY_CEILING).toBeGreaterThan(strategy.target.maxTokens);
    const section = buildResponseStrategyPromptSection(strategy);
    expect(section).toContain("== RESPONSE LENGTH ==");
    expect(section).toContain("Aim for 1–3 sentences, about 40–100 tokens.");
    expect(section).toContain("Finish the thought cleanly, then stop.");
    expect(section).toContain("Do not pad toward a longer reply. Do not stop mid-sentence.");
    expect(section).toContain("It is not a target.");
  });

  it("moves only the token window for energy and complexity", () => {
    expect(resolveLengthTarget({ length: "brief" })).toEqual({
      minSentences: 1,
      maxSentences: 3,
      minTokens: 40,
      maxTokens: 80,
    });
    expect(resolveLengthTarget({ length: "brief", energy: "low" }).maxTokens).toBe(60);
    expect(resolveLengthTarget({ length: "brief", energy: "very high" }).maxTokens).toBe(120);
    expect(resolveLengthTarget({
      length: "brief",
      energy: "high",
      goals: ["one", "two", "three", "four", "five", "six"],
      memoryFacts: [{ content: "a" }, { content: "b" }, { content: "c" }, { content: "d" }, { content: "e" }],
    }).maxTokens).toBe(120);
    expect(resolveLengthTarget({
      length: "normal",
      goals: ["one", "two", "three"],
      memoryFacts: [{ content: "a" }, { content: "b" }, { content: "c" }],
    }).maxTokens).toBe(200);
    expect(resolveLengthTarget({ length: "normal", energy: "low" })).toMatchObject({
      minTokens: 80,
      maxTokens: 160,
    });
    expect(resolveLengthTarget({ length: "expansive" }).maxTokens).toBe(360);

    const named = classifyResponseStrategy({
      message: "hey",
      energy: "medium",
      personalityName: "Rick Sanchez",
      personalityId: 25,
    });
    const other = classifyResponseStrategy({
      message: "hey",
      energy: "medium",
      personalityName: "Ara",
      personalityId: 23,
    });
    expect(named).toEqual(other);
    expect(named.maxTokensHint).toBe(BRIEF_SAFETY_CEILING);
    expect(other.target.maxTokens).toBe(80);
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
    expect(strategy.target).toMatchObject({ minSentences: 4, maxSentences: 10, minTokens: 160, maxTokens: 360 });
    const section = buildResponseStrategyPromptSection(strategy);
    expect(section).toContain("Aim for 4–10 sentences, about 160–360 tokens.");
    expect(section).not.toContain("It is not a target.");
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
    expect(calm.maxTokensHint).toBeUndefined();
    expect(buildResponseStrategyPromptSection(calm)).toContain("Aim for 2–6 sentences, about 80–160 tokens.");
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
    expect(withStrategy.prompt).toContain("Aim for 1–3 sentences, about 40–80 tokens.");
    expect(withStrategy.prompt).toContain("Finish the thought cleanly, then stop.");
    expect(withStrategy.debug.sections.responseStrategy.length).toBe("brief");
    expect(withoutStrategy.prompt).not.toContain("== RESPONSE LENGTH ==");
  });

  it("sends a brief safety ceiling above the soft target", () => {
    const brief = classifyResponseStrategy({ message: "hey" });
    expect(applyMaxTokensHint({ model: "m", messages: [], temperature: 0.85 }, brief.maxTokensHint)).toMatchObject({
      max_tokens: BRIEF_SAFETY_CEILING,
    });
    const open = applyMaxTokensHint(
      { model: "m", temperature: 0.85 },
      classifyResponseStrategy({ message: "Tell me how the gate works in practice." }).maxTokensHint,
    );
    expect(open.max_tokens).toBeUndefined();
  });

  it("stays off the mood and memory writers", () => {
    const source = readFileSync(new URL("../services/responseStrategy.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/moodEngine|emotionSpectrum|interpretEmotionSpectrum|stepMood|upsertMemory/);
    expect(source).not.toMatch(/Rick|Sanchez|personalityId\s*===|name\s*===/);
    expect(source).not.toMatch(/BRIEF_MAX_TOKENS|maxTokensHint:\s*120/);

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
    expect(openerBody).toContain("buildResponseStrategyPromptSection(responseStrategy)");
    expect(chatBody).toContain("buildResponseStrategyPromptSection(responseStrategy)");
    expect(chatBody).toContain("maxTokens: responseStrategy?.maxTokensHint ?? null");
  });
});
