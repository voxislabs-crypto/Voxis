import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPersonalityById = vi.fn();
const mockGetRelevantPersonalityMemory = vi.fn();
const mockBuildPersonaPromptPackage = vi.fn();
const mockGenerateChatCompletionWithMeta = vi.fn();
const mockMoodFromLabel = vi.fn();
const mockMoodToLabel = vi.fn();
const mockMoodToPromptFragment = vi.fn();

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityById: mockGetPersonalityById,
}));

vi.mock("../models/memoryModel.js", () => ({
  getRelevantPersonalityMemory: mockGetRelevantPersonalityMemory,
}));

vi.mock("../services/llmService.js", () => ({
  buildPersonaPromptPackage: mockBuildPersonaPromptPackage,
  generateChatCompletionWithMeta: mockGenerateChatCompletionWithMeta,
}));

vi.mock("../services/moodEngine.js", () => ({
  moodFromLabel: mockMoodFromLabel,
  moodToLabel: mockMoodToLabel,
  moodToPromptFragment: mockMoodToPromptFragment,
}));

const { internalChatHandler } = await import("../controllers/internalChatController.js");

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

function personality() {
  return {
    id: 7,
    name: "Ara",
    mood: "calm",
    moodState: { valence: 0.2, arousal: -0.1, dominance: 0.3 },
    moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
  };
}

describe("internalChatHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPersonalityById.mockReturnValue(personality());
    mockGetRelevantPersonalityMemory.mockResolvedValue([{ content: "likes rain", importance: 5 }]);
    mockBuildPersonaPromptPackage.mockReturnValue({ prompt: "YOU ARE ARA" });
    mockMoodFromLabel.mockReturnValue({ valence: 0, arousal: 0, dominance: 0 });
    mockMoodToLabel.mockReturnValue("calm");
    mockMoodToPromptFragment.mockReturnValue("MOOD FRAGMENT");
    mockGenerateChatCompletionWithMeta.mockResolvedValue({
      reply: "The other two seats missed the constraint.",
      model: "llama3.1",
      usage: { total_tokens: 42 },
    });
  });

  it("returns plain JSON and injects extraContext ahead of the caller messages", async () => {
    const res = mockRes();
    await internalChatHandler({
      body: {
        personalityId: 7,
        extraContext: "Seat A says expand the harbor. Seat B says keep it small.",
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are the critic seat." },
          { role: "user", content: "Critique the harbor plan." },
        ],
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      text: "The other two seats missed the constraint.",
      personalityId: 7,
      personalityName: "Ara",
      model: "llama3.1",
      usage: { total_tokens: 42 },
    });

    expect(mockGetRelevantPersonalityMemory).toHaveBeenCalledWith(7, "Critique the harbor plan.", 5);
    expect(mockBuildPersonaPromptPackage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      [{ content: "likes rain", importance: 5 }],
      "Critique the harbor plan.",
      expect.objectContaining({ currentMoodLabel: "calm" }),
    );

    const [llmMessages, options] = mockGenerateChatCompletionWithMeta.mock.calls[0];
    expect(options).toEqual({ temperature: 0.4 });
    expect(llmMessages.map((message) => message.role)).toEqual([
      "system",
      "system",
      "system",
      "system",
      "user",
    ]);
    expect(llmMessages[0].content).toBe("YOU ARE ARA");
    expect(llmMessages[1].content).toContain("Seat A says expand the harbor.");
    expect(llmMessages[2].content).toBe("MOOD FRAGMENT");
    expect(llmMessages[3].content).toBe("You are the critic seat.");
    expect(llmMessages[4].content).toBe("Critique the harbor plan.");
  });

  it("accepts systemAppend as an alias for extraContext", async () => {
    const res = mockRes();
    await internalChatHandler({
      body: {
        personalityId: "7",
        systemAppend: "Peer proposal: delay the vote.",
        messages: [{ role: "user", content: "Respond." }],
      },
    }, res, vi.fn());

    const [llmMessages] = mockGenerateChatCompletionWithMeta.mock.calls[0];
    expect(res.statusCode).toBe(200);
    expect(llmMessages[1].content).toContain("Peer proposal: delay the vote.");
  });

  it("returns 404 when the personality does not exist", async () => {
    mockGetPersonalityById.mockReturnValue(null);
    const res = mockRes();
    await internalChatHandler({
      body: {
        personalityId: 99,
        messages: [{ role: "user", content: "Hello" }],
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(mockGenerateChatCompletionWithMeta).not.toHaveBeenCalled();
  });

  it("returns 400 when messages are missing", async () => {
    const res = mockRes();
    await internalChatHandler({
      body: { personalityId: 7, messages: [] },
    }, res, vi.fn());

    expect(res.statusCode).toBe(400);
    expect(mockGenerateChatCompletionWithMeta).not.toHaveBeenCalled();
  });

  it("passes provider rate-limit status through", async () => {
    const error = new Error("LLM request failed with 429: slow down");
    error.statusCode = 429;
    mockGenerateChatCompletionWithMeta.mockRejectedValue(error);
    const res = mockRes();
    const next = vi.fn();

    await internalChatHandler({
      body: {
        personalityId: 7,
        messages: [{ role: "user", content: "Hello" }],
      },
    }, res, next);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toContain("429");
    expect(next).not.toHaveBeenCalled();
  });

  it("still answers when memory retrieval fails", async () => {
    mockGetRelevantPersonalityMemory.mockRejectedValue(new Error("embed down"));
    const res = mockRes();
    await internalChatHandler({
      body: {
        personalityId: 7,
        messages: [{ role: "user", content: "Hello" }],
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(mockBuildPersonaPromptPackage).toHaveBeenCalledWith(
      expect.anything(),
      [],
      "Hello",
      expect.any(Object),
    );
  });
});
