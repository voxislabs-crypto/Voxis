import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPersonalityById = vi.fn();
const mockUpdateMoodState = vi.fn();
const mockLoadContextCandidateMemories = vi.fn();
const mockUpsertMemoryFact = vi.fn();
const mockMoodFromLabel = vi.fn();
const mockMoodToLabel = vi.fn();

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityById: mockGetPersonalityById,
  updateMoodState: mockUpdateMoodState,
}));

vi.mock("../models/memoryModel.js", () => ({
  loadContextCandidateMemories: mockLoadContextCandidateMemories,
  upsertMemoryFact: mockUpsertMemoryFact,
}));

vi.mock("../services/moodEngine.js", () => ({
  moodFromLabel: mockMoodFromLabel,
  moodToLabel: mockMoodToLabel,
}));

const { internalContextHandler, internalRoundHandler } = await import("../controllers/internalContextController.js");
const { flushRoundQueue, resetRoundWriteQueue } = await import("../services/roundWriteQueue.js");

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

describe("internal context routes", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetRoundWriteQueue();
    process.env = { ...env };
    delete process.env.VOXIS_SEAT_MAP;
    delete process.env.VOXIS_SEAT_GPT;
    delete process.env.VOXIS_SEAT_CLAUDE;
    delete process.env.VOXIS_SEAT_GROK;
    mockMoodFromLabel.mockReturnValue({ valence: 0, arousal: 0, dominance: 0 });
    mockMoodToLabel.mockReturnValue("focused");
    mockGetPersonalityById.mockReturnValue({
      id: 13,
      name: "Jobs Test Persona",
      mood: "focused",
      moodState: { valence: 0.2, arousal: 0.1, dominance: 0.4 },
    });
    mockLoadContextCandidateMemories.mockReturnValue({
      retrieval: "index",
      memories: [
        { memoryType: "note", content: "Harbor budgets slip when the vote is rushed", importance: 7 },
        { memoryType: "council", content: "Council on harbor vote: keep the plan small", importance: 6 },
      ],
    });
    mockUpsertMemoryFact.mockReturnValue(41);
  });

  it("returns a compact context block and does not generate a reply", async () => {
    process.env.VOXIS_SEAT_GPT = "13";
    const res = mockRes();

    await internalContextHandler({
      body: { seatId: "gpt", topic: "harbor vote", maxChars: 700 },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.bound).toBe(true);
    expect(res.body.personalityId).toBe(13);
    expect(res.body.context).toContain("Mood: focused");
    expect(res.body.context).toContain("Harbor budgets slip");
    expect(res.body.context).toContain("Council:");
    expect(res.body.chars).toBeLessThanOrEqual(700);
    expect(res.body.text).toBeUndefined();
    expect(res.body.retrieval).toBe("index");
    expect(mockLoadContextCandidateMemories).toHaveBeenCalledWith(13, "harbor vote");
  });

  it("returns an empty block for an unbound seat", async () => {
    const res = mockRes();
    await internalContextHandler({
      body: { seatId: "claude", topic: "harbor vote" },
    }, res, vi.fn());

    expect(res.body).toEqual({
      seatId: "claude",
      personalityId: null,
      context: "",
      bound: false,
    });
    expect(mockGetPersonalityById).not.toHaveBeenCalled();
  });

  it("writes council history and a clamped mood delta", async () => {
    process.env.VOXIS_SEAT_GPT = "13";
    const res = mockRes();

    await internalRoundHandler({
      body: {
        topic: "harbor vote",
        outcome: "Delay the vote until the budget is explicit.",
        seats: [{ seatId: "gpt", moodDelta: { valence: 2, arousal: 0, dominance: 0 } }],
      },
    }, res, vi.fn());

    expect(res.body).toEqual({
      ok: true,
      queued: true,
      written: [{ seatId: "gpt", personalityId: 13 }],
    });
    expect(mockUpsertMemoryFact).not.toHaveBeenCalled();

    flushRoundQueue();

    expect(mockUpsertMemoryFact).toHaveBeenCalledWith(
      13,
      expect.stringContaining("Delay the vote"),
      "council",
      6,
    );
    expect(mockUpdateMoodState).toHaveBeenCalledWith(13, expect.objectContaining({
      valence: 0.5,
      arousal: 0.1,
      dominance: 0.4,
    }));
  });

  it("accepts a round when a seat is not bound", async () => {
    const res = mockRes();
    await internalRoundHandler({
      body: {
        topic: "harbor vote",
        outcome: "Delay it.",
        seats: ["gpt"],
      },
    }, res, vi.fn());

    expect(res.body).toEqual({ ok: true, queued: true, written: [] });
    expect(mockUpsertMemoryFact).not.toHaveBeenCalled();
  });
});
