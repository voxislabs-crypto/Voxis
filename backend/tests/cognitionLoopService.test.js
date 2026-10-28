import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRecentChatMessages = vi.fn();
const mockGetRelevantPersonalityMemory = vi.fn();
const mockUpsertMemoryFactWithEmbedding = vi.fn();
const mockPruneMemory = vi.fn();
const mockGetPersonalityMemoryByType = vi.fn();
const mockUpdateMemoryFact = vi.fn();

const mockGetAllPersonalities = vi.fn();
const mockUpdatePersonality = vi.fn();
const mockUpdateMoodState = vi.fn();

const mockGetCognitionLoopConfig = vi.fn();

const mockGenerateChatCompletion = vi.fn();
const mockIsLlmConfigured = vi.fn();

vi.mock("../models/chatModel.js", () => ({
  getRecentChatMessages: mockGetRecentChatMessages,
}));

vi.mock("../models/memoryModel.js", () => ({
  getRelevantPersonalityMemory: mockGetRelevantPersonalityMemory,
  upsertMemoryFactWithEmbedding: mockUpsertMemoryFactWithEmbedding,
  pruneMemory: mockPruneMemory,
  getPersonalityMemoryByType: mockGetPersonalityMemoryByType,
  updateMemoryFact: mockUpdateMemoryFact,
}));

vi.mock("../models/personalityModel.js", () => ({
  getAllPersonalities: mockGetAllPersonalities,
  updatePersonality: mockUpdatePersonality,
  updateMoodState: mockUpdateMoodState,
}));

vi.mock("../models/settingsModel.js", () => ({
  getCognitionLoopConfig: mockGetCognitionLoopConfig,
}));

vi.mock("../services/llmService.js", () => ({
  generateChatCompletion: mockGenerateChatCompletion,
  isLlmConfigured: mockIsLlmConfigured,
}));

function buildConfig(overrides = {}) {
  return {
    enabled: true,
    intervalMinutes: 5,
    maxPersonalitiesPerRun: 3,
    recentMessagesWindow: 8,
    memoryContextLimit: 8,
    inactivityHoursForReachOut: 24,
    curiosityThreshold: 0.75,
    maxNewGoalsPerRun: 1,
    deliveryEnabled: true,
    deliveryMinIntervalMinutes: 10,
    deliveryMaxPerHour: 2,
    deliveryPriorityThreshold: 0.6,
    activeUserWindowMinutes: 2,
    quietHoursEnabled: false,
    quietHoursStartHour: 1,
    quietHoursEndHour: 7,
    startupGraceMinutes: 0,
    ...overrides,
  };
}

function buildPersonality() {
  return {
    id: 42,
    name: "Ara",
    description: "Test persona",
    mood: "Neutral",
    moodState: { valence: 0.1, arousal: 0.2, dominance: 0.3 },
    creativeContext: "default",
    goals: ["Understand user better"],
  };
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe("cognitionLoopService", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    mockGetRecentChatMessages.mockReset();
    mockGetRelevantPersonalityMemory.mockReset();
    mockUpsertMemoryFactWithEmbedding.mockReset();
    mockPruneMemory.mockReset();
    mockGetPersonalityMemoryByType.mockReset();
    mockUpdateMemoryFact.mockReset();

    mockGetAllPersonalities.mockReset();
    mockUpdatePersonality.mockReset();
    mockUpdateMoodState.mockReset();

    mockGetCognitionLoopConfig.mockReset();

    mockGenerateChatCompletion.mockReset();
    mockIsLlmConfigured.mockReset();

    mockGetCognitionLoopConfig.mockReturnValue(buildConfig());
    mockIsLlmConfigured.mockReturnValue(true);
    mockGetAllPersonalities.mockReturnValue([buildPersonality()]);
    mockGetRecentChatMessages.mockReturnValue([
      { role: "user", content: "I am stuck at work", createdAt: hoursAgo(30) },
      { role: "assistant", content: "Want to unpack it?", createdAt: hoursAgo(29.9) },
    ]);
    mockGetRelevantPersonalityMemory.mockResolvedValue([]);
    mockGenerateChatCompletion.mockResolvedValue("{}");
    mockGetPersonalityMemoryByType.mockReturnValue([]);
    mockUpdateMemoryFact.mockResolvedValue(null);
  });

  afterEach(async () => {
    const mod = await import("../services/cognitionLoopService.js");
    mod.resetCognitionLoopRuntimeForTests();
    vi.useRealTimers();
  });

  it("runs once on scheduled interval", async () => {
    const mod = await import("../services/cognitionLoopService.js");

    mod.startCognitionLoop();
    await vi.advanceTimersByTimeAsync(300_000);

    expect(mockGenerateChatCompletion).toHaveBeenCalledTimes(1);
  });

  it("does not allow overlapping runs", async () => {
    const deferred = {};
    const promise = new Promise((resolve) => {
      deferred.resolve = resolve;
    });

    mockGenerateChatCompletion.mockReturnValueOnce(promise);

    const mod = await import("../services/cognitionLoopService.js");

    const firstRunPromise = mod.runCognitionLoopOnce({ reason: "manual" });
    const secondRun = await mod.runCognitionLoopOnce({ reason: "manual" });

    expect(secondRun).toEqual(
      expect.objectContaining({
        ok: false,
        skipped: true,
        skipReason: "already_running",
      }),
    );

    deferred.resolve("{}");
    const firstRun = await firstRunPromise;
    expect(firstRun.ok).toBe(true);
  });

  it("skips delivery for low-priority candidates", async () => {
    mockGetCognitionLoopConfig.mockReturnValue(
      buildConfig({
        startupGraceMinutes: 0,
        deliveryPriorityThreshold: 0.6,
      }),
    );

    mockGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        reachOut: {
          shouldReachOut: true,
          type: "curiosity",
          curiosityScore: 0.4,
          reason: "unresolved_topic",
          draft: "I kept wondering about what you said.",
          cooldownKey: "general",
        },
      }),
    );

    mockGetPersonalityMemoryByType.mockImplementation((_personalityId, memoryType) => {
      if (memoryType === "reach_out_candidate") {
        return [
          {
            id: 100,
            content: JSON.stringify({
              id: "roc-low",
              type: "curiosity",
              content: "I kept wondering about what you said.",
              priority: 0.4,
              status: "pending",
              reason: "unresolved_topic",
              cooldownKey: "general",
              createdAt: hoursAgo(1),
            }),
            importance: 5,
            enabled: 1,
            createdAt: hoursAgo(1),
          },
        ];
      }
      return [];
    });

    const mod = await import("../services/cognitionLoopService.js");
    const summary = await mod.runCognitionLoopOnce({ reason: "manual" });

    const writeTypes = mockUpsertMemoryFactWithEmbedding.mock.calls.map((call) => call[2]);
    expect(writeTypes).toContain("reach_out_candidate");
    expect(writeTypes).not.toContain("reach_out_delivery");
    expect(summary.deliveredReachOut).toBe(0);
  });

  it("respects delivery cooldown", async () => {
    mockGetCognitionLoopConfig.mockReturnValue(
      buildConfig({
        startupGraceMinutes: 0,
        deliveryMinIntervalMinutes: 10,
        deliveryPriorityThreshold: 0.6,
      }),
    );

    mockGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        reachOut: {
          shouldReachOut: true,
          type: "reflection",
          curiosityScore: 0.9,
          reason: "high_curiosity",
          draft: "I have been thinking about your earlier point.",
          cooldownKey: "general",
        },
      }),
    );

    mockGetPersonalityMemoryByType.mockImplementation((_personalityId, memoryType) => {
      if (memoryType === "reach_out_candidate") {
        return [
          {
            id: 201,
            content: JSON.stringify({
              id: "roc-high",
              type: "reflection",
              content: "I have been thinking about your earlier point.",
              priority: 0.9,
              status: "pending",
              reason: "high_curiosity",
              cooldownKey: "general",
              createdAt: hoursAgo(2),
            }),
            importance: 8,
            enabled: 1,
            createdAt: hoursAgo(2),
          },
        ];
      }

      if (memoryType === "reach_out_delivery") {
        return [
          {
            id: 301,
            content: JSON.stringify({ type: "reflection", content: "Earlier message" }),
            importance: 7,
            enabled: 1,
            createdAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ];
      }

      return [];
    });

    const mod = await import("../services/cognitionLoopService.js");
    const summary = await mod.runCognitionLoopOnce({ reason: "manual" });

    const writeTypes = mockUpsertMemoryFactWithEmbedding.mock.calls.map((call) => call[2]);
    expect(writeTypes).not.toContain("reach_out_delivery");
    expect(summary.deliveredReachOut).toBe(0);
  });

  it("writes reflection, open loop, candidate, and delivery memory types", async () => {
    mockGetCognitionLoopConfig.mockReturnValue(
      buildConfig({
        startupGraceMinutes: 0,
        inactivityHoursForReachOut: 1,
        deliveryPriorityThreshold: 0.6,
      }),
    );

    mockGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        privateThoughts: ["The user may feel conflicted about work."],
        openLoops: [{ content: "User mentioned work frustration without details.", urgency: 0.8 }],
        goalCandidates: ["Ask a gentle follow-up about work stressors"],
        reachOut: {
          shouldReachOut: true,
          type: "curiosity",
          curiosityScore: 0.9,
          reason: "unresolved_topic",
          draft: "Random thought: I keep wondering what part of work feels heaviest lately.",
          cooldownKey: "career",
        },
      }),
    );

    mockGetPersonalityMemoryByType.mockImplementation((_personalityId, memoryType) => {
      if (memoryType === "reach_out_candidate") {
        return [
          {
            id: 777,
            content: JSON.stringify({
              id: "roc-deliver",
              type: "curiosity",
              content: "Random thought: I keep wondering what part of work feels heaviest lately.",
              priority: 0.9,
              status: "pending",
              reason: "unresolved_topic",
              cooldownKey: "career",
              createdAt: hoursAgo(3),
            }),
            importance: 8,
            enabled: 1,
            createdAt: hoursAgo(3),
          },
        ];
      }
      return [];
    });

    const mod = await import("../services/cognitionLoopService.js");
    const summary = await mod.runCognitionLoopOnce({ reason: "manual" });

    const writeTypes = mockUpsertMemoryFactWithEmbedding.mock.calls.map((call) => call[2]);
    expect(writeTypes).toContain("reflection");
    expect(writeTypes).toContain("open_loop");
    expect(writeTypes).toContain("reach_out_candidate");
    expect(writeTypes).toContain("reach_out_delivery");

    expect(mockUpdatePersonality).toHaveBeenCalledTimes(1);
    expect(mockUpdateMemoryFact).toHaveBeenCalledTimes(1);
    expect(summary.reachOutCandidates).toBe(1);
    expect(summary.deliveredReachOut).toBe(1);
  });

  it("does NOT deliver during quiet hours even if high priority", async () => {
    // Set quiet hours 1–7, then freeze time to 3 AM
    vi.setSystemTime(new Date("2026-04-23T03:00:00"));

    mockGetCognitionLoopConfig.mockReturnValue(
      buildConfig({
        startupGraceMinutes: 0,
        inactivityHoursForReachOut: 1,
        deliveryPriorityThreshold: 0.6,
        quietHoursEnabled: true,
        quietHoursStartHour: 1,
        quietHoursEndHour: 7,
      }),
    );

    mockGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        reachOut: {
          shouldReachOut: true,
          type: "curiosity",
          curiosityScore: 0.98,
          reason: "unresolved_topic",
          draft: "I have been thinking about this all night.",
          cooldownKey: "general",
        },
      }),
    );

    mockGetPersonalityMemoryByType.mockImplementation((_personalityId, memoryType) => {
      if (memoryType === "reach_out_candidate") {
        return [
          {
            id: 900,
            content: JSON.stringify({
              id: "roc-quiet",
              type: "curiosity",
              content: "I have been thinking about this all night.",
              priority: 0.98,
              status: "pending",
              reason: "unresolved_topic",
              cooldownKey: "general",
              createdAt: hoursAgo(3),
            }),
            importance: 9,
            enabled: 1,
            createdAt: hoursAgo(3),
          },
        ];
      }
      return [];
    });

    const mod = await import("../services/cognitionLoopService.js");
    const summary = await mod.runCognitionLoopOnce({ reason: "manual" });

    const writeTypes = mockUpsertMemoryFactWithEmbedding.mock.calls.map((c) => c[2]);
    expect(writeTypes).not.toContain("reach_out_delivery");
    expect(summary.deliveredReachOut).toBe(0);
  });

  it("resumes delivery after quiet hours window ends", async () => {
    // quiet hours 1–7, set time to 9 AM — outside window, should deliver
    vi.setSystemTime(new Date("2026-04-23T09:00:00"));

    mockGetCognitionLoopConfig.mockReturnValue(
      buildConfig({
        startupGraceMinutes: 0,
        inactivityHoursForReachOut: 1,
        deliveryPriorityThreshold: 0.6,
        quietHoursEnabled: true,
        quietHoursStartHour: 1,
        quietHoursEndHour: 7,
      }),
    );

    mockGenerateChatCompletion.mockResolvedValueOnce(
      JSON.stringify({
        reachOut: {
          shouldReachOut: true,
          type: "reflection",
          curiosityScore: 0.85,
          reason: "high_curiosity",
          draft: "Good morning — I kept thinking about something.",
          cooldownKey: "morning",
        },
      }),
    );

    mockGetPersonalityMemoryByType.mockImplementation((_personalityId, memoryType) => {
      if (memoryType === "reach_out_candidate") {
        return [
          {
            id: 901,
            content: JSON.stringify({
              id: "roc-morning",
              type: "reflection",
              content: "Good morning — I kept thinking about something.",
              priority: 0.85,
              status: "pending",
              reason: "high_curiosity",
              cooldownKey: "morning",
              createdAt: hoursAgo(8),
            }),
            importance: 8,
            enabled: 1,
            createdAt: hoursAgo(8),
          },
        ];
      }
      return [];
    });

    const mod = await import("../services/cognitionLoopService.js");
    const summary = await mod.runCognitionLoopOnce({ reason: "manual" });

    const writeTypes = mockUpsertMemoryFactWithEmbedding.mock.calls.map((c) => c[2]);
    expect(writeTypes).toContain("reach_out_candidate");
    expect(summary.deliveredReachOut).toBe(0);
  });
});
