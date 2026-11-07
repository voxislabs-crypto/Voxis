import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPersonalityById = vi.fn();
const mockGetRelevantPersonalityMemory = vi.fn();
const mockBuildPersonaPromptPackage = vi.fn();
const mockGenerateChatCompletionWithMeta = vi.fn();
const mockMoodFromLabel = vi.fn();
const mockMoodToLabel = vi.fn();
const mockMoodToPromptFragment = vi.fn();
const mockAdvanceTurnMood = vi.fn();
const mockRunUserContextTurn = vi.fn();
const mockCreateChatMessage = vi.fn();
const mockEmbedChatMessageAsync = vi.fn();

vi.mock("../models/personalityModel.js", () => ({
  getPersonalityById: mockGetPersonalityById,
}));

vi.mock("../models/chatModel.js", () => ({
  createChatMessage: (...args) => mockCreateChatMessage(...args),
  embedChatMessageAsync: (...args) => mockEmbedChatMessageAsync(...args),
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

vi.mock("../services/turnMood.js", () => ({
  advanceTurnMood: (...args) => mockAdvanceTurnMood(...args),
}));

vi.mock("../services/userContextTurn.js", () => ({
  runUserContextTurn: (...args) => mockRunUserContextTurn(...args),
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
    mockCreateChatMessage.mockImplementation(({ role }) => ({ id: role === "user" ? 11 : 12 }));
    mockEmbedChatMessageAsync.mockResolvedValue(undefined);
    mockAdvanceTurnMood.mockResolvedValue({
      newMood: { valence: 0.2, arousal: -0.1, dominance: 0.3 },
      moodLabel: "calm",
      moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    });
    mockRunUserContextTurn.mockReturnValue({
      affect: { valence: -0.4, arousal: 0.5, intent: "vent", confidence: 0.7 },
      userModel: { scopeKey: "user:7" },
      theoryOfMind: { note: "wants acknowledgment" },
      adaptation: { promptFragment: "Adaptation: acknowledge the feeling" },
      flags: { affect: true, model: true, theory: true, adaptation: true },
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
    expect(mockAdvanceTurnMood).toHaveBeenCalledWith({
      personality: expect.objectContaining({ id: 7 }),
      userId: null,
      message: "Critique the harbor plan.",
      recentMessages: [{ role: "system", content: "You are the critic seat." }],
    });
    expect(mockRunUserContextTurn).toHaveBeenCalledWith({
      message: "Critique the harbor plan.",
      history: [{ role: "system", content: "You are the critic seat." }],
      userId: null,
      personalityId: 7,
      sessionKey: "7:anon",
    });
    expect(mockAdvanceTurnMood.mock.invocationCallOrder[0]).toBeLessThan(
      mockRunUserContextTurn.mock.invocationCallOrder[0],
    );
    expect(mockBuildPersonaPromptPackage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      [{ content: "likes rain", importance: 5 }],
      "Critique the harbor plan.",
      expect.objectContaining({
        currentMoodLabel: "calm",
        userContext: expect.objectContaining({
          affect: expect.objectContaining({ intent: "vent" }),
        }),
        responseStrategy: expect.objectContaining({
          length: "brief",
          maxTokensHint: 120,
        }),
      }),
    );

    const [llmMessages, options] = mockGenerateChatCompletionWithMeta.mock.calls[0];
    expect(options).toEqual({ temperature: 0.4, maxTokens: 120 });
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
    expect(mockCreateChatMessage).not.toHaveBeenCalled();
    expect(res.body).not.toHaveProperty("moodState");
    expect(res.body).not.toHaveProperty("userContext");
    expect(res.body).not.toHaveProperty("responseStrategy");
  });

  it("steps per-user mood for a signed-in live call", async () => {
    mockAdvanceTurnMood.mockResolvedValue({
      newMood: { valence: -0.4, arousal: 0.6, dominance: 0.2 },
      moodLabel: "annoyed",
      moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    });
    const res = mockRes();
    await internalChatHandler({
      advanceMood: true,
      moodUserId: 7,
      body: {
        personalityId: 7,
        messages: [
          { role: "assistant", content: "Earlier note." },
          { role: "user", content: "That plan is a mess." },
        ],
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.moodState).toEqual({ valence: -0.4, arousal: 0.6, dominance: 0.2 });
    expect(res.body.moodLabel).toBe("annoyed");
    expect(mockAdvanceTurnMood).toHaveBeenCalledWith({
      personality: expect.objectContaining({ id: 7 }),
      userId: 7,
      message: "That plan is a mess.",
      recentMessages: [{ role: "assistant", content: "Earlier note." }],
    });
    expect(mockMoodToPromptFragment).toHaveBeenCalledWith(
      { valence: -0.4, arousal: 0.6, dominance: 0.2 },
      { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    );
    expect(mockRunUserContextTurn).toHaveBeenCalledWith({
      message: "That plan is a mess.",
      history: [{ role: "assistant", content: "Earlier note." }],
      userId: 7,
      personalityId: 7,
      sessionKey: "7:7",
    });
    expect(mockAdvanceTurnMood.mock.invocationCallOrder[0]).toBeLessThan(
      mockRunUserContextTurn.mock.invocationCallOrder[0],
    );
    expect(mockRunUserContextTurn.mock.invocationCallOrder[0]).toBeLessThan(
      mockBuildPersonaPromptPackage.mock.invocationCallOrder[0],
    );
    expect(mockBuildPersonaPromptPackage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      [{ content: "likes rain", importance: 5 }],
      "That plan is a mess.",
      expect.objectContaining({
        currentMoodLabel: "annoyed",
        userContext: expect.objectContaining({
          affect: expect.objectContaining({ intent: "vent" }),
        }),
        responseStrategy: expect.objectContaining({
          length: "normal",
          reason: "Ordinary exchange.",
        }),
      }),
    );
    expect(mockGenerateChatCompletionWithMeta.mock.calls[0][1]).toEqual({
      temperature: 0.85,
      maxTokens: null,
    });
    expect(res.body).not.toHaveProperty("userContext");
    expect(res.body).not.toHaveProperty("responseStrategy");
    expect(mockCreateChatMessage).toHaveBeenNthCalledWith(1, {
      personalityId: 7,
      role: "user",
      content: "That plan is a mess.",
      userId: 7,
      mode: "",
    });
    expect(mockCreateChatMessage).toHaveBeenNthCalledWith(2, {
      personalityId: 7,
      role: "assistant",
      content: "The other two seats missed the constraint.",
      userId: 7,
      mode: "",
    });
  });

  it("caps a short live greeting the same way text does", async () => {
    mockAdvanceTurnMood.mockResolvedValue({
      newMood: { valence: 0.2, arousal: 0.1, dominance: 0.2 },
      moodLabel: "calm",
      moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    });
    mockRunUserContextTurn.mockReturnValue({
      affect: { valence: 0.2, arousal: 0.2, intent: "greet", confidence: 0.8 },
      userModel: { scopeKey: "user:7" },
      theoryOfMind: null,
      adaptation: null,
      flags: { affect: true, model: true, theory: true, adaptation: true },
    });
    const res = mockRes();
    await internalChatHandler({
      advanceMood: true,
      moodUserId: 7,
      body: {
        personalityId: 7,
        messages: [{ role: "user", content: "hey" }],
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    const strategy = mockBuildPersonaPromptPackage.mock.calls[0][3].responseStrategy;
    expect(strategy).toEqual(expect.objectContaining({
      length: "brief",
      maxTokensHint: 120,
    }));
    expect(mockGenerateChatCompletionWithMeta.mock.calls[0][1]).toEqual({
      temperature: 0.85,
      maxTokens: 120,
    });
    expect(res.body).not.toHaveProperty("responseStrategy");
  });

  it("leaves the live length cap off when the response-strategy flag is off", async () => {
    const previous = process.env.VOXIS_RESPONSE_STRATEGY;
    process.env.VOXIS_RESPONSE_STRATEGY = "0";
    mockAdvanceTurnMood.mockResolvedValue({
      newMood: { valence: 0.2, arousal: 0.1, dominance: 0.2 },
      moodLabel: "calm",
      moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    });
    const res = mockRes();
    try {
      await internalChatHandler({
        advanceMood: true,
        moodUserId: 7,
        body: {
          personalityId: 7,
          messages: [{ role: "user", content: "hey" }],
        },
      }, res, vi.fn());
    } finally {
      if (previous === undefined) delete process.env.VOXIS_RESPONSE_STRATEGY;
      else process.env.VOXIS_RESPONSE_STRATEGY = previous;
    }

    expect(res.statusCode).toBe(200);
    expect(mockBuildPersonaPromptPackage.mock.calls[0][3].responseStrategy).toBeNull();
    expect(mockGenerateChatCompletionWithMeta.mock.calls[0][1]).toEqual({
      temperature: 0.85,
      maxTokens: null,
    });
  });

  it("scopes an anonymous live turn the same way anonymous text does", async () => {
    mockAdvanceTurnMood.mockResolvedValue({
      newMood: { valence: 0.1, arousal: 0, dominance: 0.2 },
      moodLabel: "calm",
      moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    });
    const res = mockRes();
    await internalChatHandler({
      advanceMood: true,
      moodUserId: null,
      body: {
        personalityId: 7,
        messages: [
          { role: "user", content: "Hello there." },
          { role: "system", content: "Keep the reply short." },
        ],
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(mockRunUserContextTurn).toHaveBeenCalledWith({
      message: "Hello there.",
      history: [],
      userId: null,
      personalityId: 7,
      sessionKey: "7:anon",
    });
    expect(mockCreateChatMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      personalityId: 7,
      role: "user",
      content: "Hello there.",
      userId: null,
    }));
    expect(mockCreateChatMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      role: "assistant",
      userId: null,
    }));
    expect(res.body).not.toHaveProperty("userContext");
  });

  it("still answers a live turn when the user-context layers throw", async () => {
    mockAdvanceTurnMood.mockResolvedValue({
      newMood: { valence: 0.1, arousal: 0, dominance: 0.2 },
      moodLabel: "calm",
      moodBaseline: { valence: 0.1, arousal: -0.2, dominance: 0.2 },
    });
    mockRunUserContextTurn.mockImplementation(() => {
      throw new Error("context down");
    });
    const res = mockRes();
    await internalChatHandler({
      advanceMood: true,
      moodUserId: 7,
      body: {
        personalityId: 7,
        messages: [{ role: "user", content: "Hello" }],
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(200);
    expect(res.body.text).toBe("The other two seats missed the constraint.");
    expect(mockBuildPersonaPromptPackage.mock.calls[0][3].userContext).toBeNull();
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
