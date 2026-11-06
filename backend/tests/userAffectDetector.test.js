import { describe, expect, it } from "vitest";

import { detectUserAffect } from "../services/userAffectDetector.js";

describe("user affect detector", () => {
  it("reads frustration without writing a character mood", () => {
    const affect = detectUserAffect({
      message: "I am so frustrated about the deploy",
    });

    expect(affect.intent).toBe("vent");
    expect(affect.valence).toBeLessThan(-0.4);
    expect(affect.arousal).toBeGreaterThan(0.5);
    expect(affect.confidence).toBeGreaterThan(0.4);
    expect(affect.focus).toBe("the deploy");
    expect(affect).not.toHaveProperty("dominance");
  });

  it("reads a direct help request", () => {
    const affect = detectUserAffect({
      message: "How do I reset the local database?",
    });

    expect(affect.intent).toBe("ask_help");
    expect(affect.confidence).toBeGreaterThan(0.4);
  });

  it("lets earlier frustrated turns sharpen the current one", () => {
    const alone = detectUserAffect({ message: "it is still broken" });
    const withHistory = detectUserAffect({
      message: "it is still broken",
      history: [
        { role: "user", content: "this is so frustrating" },
        { role: "assistant", content: "Want me to look at the logs?" },
        { role: "user", content: "I am annoyed that it failed again" },
      ],
    });

    expect(withHistory.valence).toBeLessThan(alone.valence);
    expect(withHistory.confidence).toBeGreaterThan(alone.confidence);
  });

  it("keeps a plain greeting light", () => {
    const affect = detectUserAffect({ message: "hey" });

    expect(affect.intent).toBe("greet");
    expect(affect.valence).toBeGreaterThan(0);
    expect(affect.focus).toBeNull();
  });
});
