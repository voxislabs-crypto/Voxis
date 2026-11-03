import { describe, expect, it } from "vitest";

import { stripSfxCues } from "../../frontend/src/voice/sfxCueText.js";

describe("stripSfxCues", () => {
  it("keeps emphasized words and drops only sound cues", () => {
    const source = [
      "the thing about old maps, kai, is that they don’t show you where you *are*.",
      "they show you where people *thought* you were.",
      "right. got it. *mental note logged*. *BUUUURP* (burp) <giggle>",
    ].join(" ");

    expect(stripSfxCues(source)).toBe([
      "the thing about old maps, kai, is that they don’t show you where you are.",
      "they show you where people thought you were.",
      "right. got it. mental note logged.",
    ].join(" "));
  });

  it("keeps a parenthetical that is not a sound cue", () => {
    expect(stripSfxCues("a pocket of order (smart) in the chaos")).toBe(
      "a pocket of order (smart) in the chaos",
    );
  });
});
