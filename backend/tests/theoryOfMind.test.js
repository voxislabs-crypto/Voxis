import { describe, expect, it } from "vitest";

import { buildAdaptationDirectives } from "../services/userAdaptation.js";
import { buildTheoryOfMind } from "../services/theoryOfMind.js";

describe("theory of mind", () => {
  it("asks for acknowledgment before a solution when the user is venting", () => {
    const note = buildTheoryOfMind({
      affect: {
        valence: -0.7,
        arousal: 0.78,
        intent: "vent",
        confidence: 0.72,
        focus: "the deploy",
      },
      message: "I am so frustrated about the deploy",
      history: [{ role: "user", content: "the deploy failed" }],
    });

    expect(note.want).toBe("acknowledgment_before_solution");
    expect(note.promptFragment).toBe(
      "User appears frustrated about the deploy; likely wants acknowledgment before solution.",
    );
    expect(note.confidence).toBe(0.72);
  });

  it("names a concern that has already come up", () => {
    const note = buildTheoryOfMind({
      affect: { valence: -0.2, arousal: 0.3, intent: "ask_help", confidence: 0.6, focus: "the deploy" },
      userModel: {
        topics: [{ label: "the deploy", count: 3, lastValence: -0.6 }],
      },
      message: "How do I fix the deploy?",
    });

    expect(note.want).toBe("ongoing_concern");
    expect(note.note).toContain("This concern has come up 3 times.");
  });

  it("does not invent a feeling when the tone is unclear", () => {
    const note = buildTheoryOfMind({
      affect: { valence: 0, arousal: 0, intent: "unclear", confidence: 0.28, focus: null },
      message: "maybe later",
    });

    expect(note.note).toBe("User tone is unclear; do not assume a strong feeling.");
    expect(note.want).toBe("steady_reply");
  });
});

describe("user adaptation", () => {
  it("turns a vent into an acknowledge-first directive", () => {
    const directives = buildAdaptationDirectives({
      affect: { valence: -0.7, arousal: 0.8, intent: "vent" },
      theoryOfMind: { want: "acknowledgment_before_solution" },
    });

    expect(directives.responseStyle).toBe("acknowledge-first");
    expect(directives.pacing).toBe("unhurried");
    expect(directives.contentFocus).toBe("feeling-then-one-step");
    expect(directives.promptFragment).toContain("acknowledge the feeling");
  });

  it("keeps a known brief preference on a direct answer", () => {
    const directives = buildAdaptationDirectives({
      affect: { valence: 0, arousal: 0.3, intent: "ask_help" },
      userModel: {
        preferences: [{ kind: "likes", text: "short answers" }],
        timeSignals: { gapMs: 1000 },
        patterns: { rapidTurns: 0 },
      },
      theoryOfMind: { want: "direct_help" },
    });

    expect(directives.pacing).toBe("brief");
    expect(directives.promptFragment).toContain("prefers a brief reply");
  });
});
