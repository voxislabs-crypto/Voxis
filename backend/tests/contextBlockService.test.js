import { describe, expect, it } from "vitest";

import {
  applyMoodDelta,
  buildContextBlock,
  clampContextChars,
  rankContextMemories,
} from "../services/contextBlockService.js";
import { resolveSeat } from "../services/seatMap.js";

describe("context blocks", () => {
  it("caps the requested size between 500 and 800 characters", () => {
    expect(clampContextChars(undefined)).toBe(700);
    expect(clampContextChars(200)).toBe(500);
    expect(clampContextChars(900)).toBe(800);
  });

  it("keeps topic-matching council history and drops unrelated council notes", () => {
    const ranked = rankContextMemories([
      { memoryType: "council", content: "Council on harbor vote: delay it", importance: 6 },
      { memoryType: "council", content: "Council on bakery menu: add rye", importance: 6 },
      { memoryType: "note", content: "The harbor plan needs a budget", importance: 5 },
      { memoryType: "note", content: "Unrelated grocery list", importance: 4 },
    ], "harbor vote timing");

    expect(ranked.map((memory) => memory.content)).toEqual([
      "Council on harbor vote: delay it",
      "The harbor plan needs a budget",
    ]);
  });

  it("truncates the formatted block at the ceiling", () => {
    const block = buildContextBlock({
      moodLabel: "focused",
      mood: { valence: 0.2, arousal: 0.1, dominance: 0.4 },
      memories: [
        { memoryType: "note", content: "x".repeat(900), importance: 8 },
      ],
      maxChars: 500,
    });

    expect(block.length).toBeLessThanOrEqual(500);
    expect(block.startsWith("Mood: focused V0.20 A0.10 D0.40")).toBe(true);
  });

  it("clamps a mood delta before applying it", () => {
    expect(applyMoodDelta(
      { valence: 0.9, arousal: 0, dominance: -0.9, label: "keep" },
      { valence: 2, arousal: -1, dominance: -1 },
    )).toEqual({
      valence: 1,
      arousal: -0.3,
      dominance: -1,
      label: "keep",
    });
  });
});

describe("resolveSeat", () => {
  it("maps a named seat from the environment", () => {
    expect(resolveSeat({ seatId: "grok" }, { VOXIS_SEAT_GROK: "25" })).toEqual({
      seatId: "grok",
      personalityId: 25,
    });
  });

  it("returns an unbound seat when nothing is mapped", () => {
    expect(resolveSeat({ seatId: "gpt" }, {})).toEqual({
      seatId: "gpt",
      personalityId: null,
    });
  });
});
