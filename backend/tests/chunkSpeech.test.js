import { describe, expect, it } from "vitest";

import { splitIntoChunks } from "../services/chunkSpeech.js";

describe("chunkSpeech splitIntoChunks", () => {
  it("splits sentence groups into timed chunks", () => {
    const chunks = splitIntoChunks("Yeah. Move now! No delays?");

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual(expect.objectContaining({ text: "Yeah." }));
    expect(chunks[1].pauseMs).toBeGreaterThanOrEqual(80);
    expect(chunks[2].pauseMs).toBeLessThanOrEqual(500);
  });
});