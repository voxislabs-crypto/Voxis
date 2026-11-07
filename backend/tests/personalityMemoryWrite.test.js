import { beforeEach, describe, expect, it, vi } from "vitest";

const extractMemoryFacts = vi.fn();
const upsertMemoryFactWithEmbedding = vi.fn();
const pruneMemory = vi.fn();

vi.mock("../services/llmService.js", () => ({
  extractMemoryFacts,
}));

vi.mock("../models/memoryModel.js", () => ({
  upsertMemoryFactWithEmbedding,
  pruneMemory,
}));

const { writeExtractedPersonalityMemories } = await import("../services/personalityMemoryWrite.js");

describe("writeExtractedPersonalityMemories", () => {
  beforeEach(() => {
    extractMemoryFacts.mockReset();
    upsertMemoryFactWithEmbedding.mockReset();
    pruneMemory.mockReset();
    upsertMemoryFactWithEmbedding.mockResolvedValue(1);
  });

  it("writes extracted facts and prunes when any were saved", async () => {
    extractMemoryFacts.mockResolvedValue([
      { content: "likes rain", memoryType: "user_pref", importance: 6 },
    ]);

    const facts = await writeExtractedPersonalityMemories({
      personality: { id: 7, name: "Ara" },
      personalityId: 7,
      userMessage: "I like rain",
      assistantReply: "Noted.",
      existingFacts: [],
    });

    expect(extractMemoryFacts).toHaveBeenCalledWith({
      personality: { id: 7, name: "Ara" },
      recentMessages: [
        { role: "user", content: "I like rain" },
        { role: "assistant", content: "Noted." },
      ],
      existingFacts: [],
    });
    expect(upsertMemoryFactWithEmbedding).toHaveBeenCalledWith(7, "likes rain", "user_pref", 6);
    expect(pruneMemory).toHaveBeenCalledWith(7, 50);
    expect(facts).toHaveLength(1);
  });

  it("does not prune when nothing new was extracted", async () => {
    extractMemoryFacts.mockResolvedValue([]);

    await writeExtractedPersonalityMemories({
      personality: { name: "Ara" },
      personalityId: 7,
      userMessage: "hi",
      assistantReply: "hey",
    });

    expect(upsertMemoryFactWithEmbedding).not.toHaveBeenCalled();
    expect(pruneMemory).not.toHaveBeenCalled();
  });
});
