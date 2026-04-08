import { describe, expect, it } from "vitest";

import { getSpeechProfile } from "../services/speechProfiles.js";

describe("speechProfiles getSpeechProfile", () => {
  it("maps sarcastic trait to sarcastic profile", () => {
    const profile = getSpeechProfile({
      traits: ["sarcastic"],
      speechStyle: "dry wit",
      expressionStyle: { energy: "high", sentenceStyle: "sharp" },
    });

    expect(profile.id).toBe("sarcastic");
    expect(profile.emphasisWords).toContain("genius");
  });

  it("maps calm trait to calm profile", () => {
    const profile = getSpeechProfile({
      traits: ["calm"],
      expressionStyle: { energy: "low", sentenceStyle: "measured" },
    });

    expect(profile.id).toBe("calm");
    expect(profile.pacing).toBe("slow");
  });
});