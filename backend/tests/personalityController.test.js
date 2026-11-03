import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClaimLegacyPersonalities = vi.fn();
const mockCreatePersonality = vi.fn();
const mockDeletePersonality = vi.fn();
const mockGetAllPersonalities = vi.fn();
const mockGetLegacyPersonalityCount = vi.fn();
const mockGetPersonalityById = vi.fn();
const mockResetPersonalityState = vi.fn();
const mockUpdatePersonality = vi.fn();
const mockInsertPersonaShiftAudit = vi.fn(() => ({ id: 9 }));
const mockUpdatePersonalityVoiceProfile = vi.fn();
const mockClearChatMessagesForPersonality = vi.fn();
const mockClearPersonalityMemory = vi.fn();
const mockMoodFromLabel = vi.fn();
const mockMapToVoxisPersonality = vi.fn();
const mockGetAllVoicePresets = vi.fn();
const mockRecommendVoicePreset = vi.fn();
const mockSanitizeVoiceProfile = vi.fn((value) => value);

vi.mock("../models/personalityModel.js", () => ({
  claimLegacyPersonalities: mockClaimLegacyPersonalities,
  createPersonality: mockCreatePersonality,
  deletePersonality: mockDeletePersonality,
  getAllPersonalities: mockGetAllPersonalities,
  getLegacyPersonalityCount: mockGetLegacyPersonalityCount,
  getPersonalityById: mockGetPersonalityById,
  resetPersonalityState: mockResetPersonalityState,
  insertPersonaShiftAudit: mockInsertPersonaShiftAudit,
  updatePersonality: mockUpdatePersonality,
  updatePersonalityVoiceProfile: mockUpdatePersonalityVoiceProfile,
}));

vi.mock("../models/chatModel.js", () => ({
  clearChatMessagesForPersonality: mockClearChatMessagesForPersonality,
}));

vi.mock("../models/memoryModel.js", () => ({
  clearPersonalityMemory: mockClearPersonalityMemory,
}));

vi.mock("../services/moodEngine.js", () => ({
  moodFromLabel: mockMoodFromLabel,
}));

vi.mock("../services/hybridPersonalityService.js", () => ({
  mapToVoxisPersonality: mockMapToVoxisPersonality,
  deriveDefaultResponseFocusProfile: () => ({ defaultLens: "balanced", lenses: [] }),
}));

vi.mock("../services/voicePresetsService.js", () => ({
  getAllVoicePresets: mockGetAllVoicePresets,
  recommendVoicePreset: mockRecommendVoicePreset,
}));

vi.mock("../services/voiceProfileSanitizer.js", () => ({
  sanitizeVoiceProfile: mockSanitizeVoiceProfile,
}));

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("personalityController", () => {
  beforeEach(() => {
    vi.resetModules();
    mockClaimLegacyPersonalities.mockReset();
    mockCreatePersonality.mockReset();
    mockDeletePersonality.mockReset();
    mockGetAllPersonalities.mockReset();
    mockGetLegacyPersonalityCount.mockReset();
    mockGetPersonalityById.mockReset();
    mockResetPersonalityState.mockReset();
    mockUpdatePersonality.mockReset();
    mockInsertPersonaShiftAudit.mockReset();
    mockInsertPersonaShiftAudit.mockReturnValue({ id: 9 });
    mockUpdatePersonalityVoiceProfile.mockReset();
    mockClearChatMessagesForPersonality.mockReset();
    mockClearPersonalityMemory.mockReset();
    mockMoodFromLabel.mockReset();
    mockMapToVoxisPersonality.mockReset();
    mockGetAllVoicePresets.mockReset();
    mockRecommendVoicePreset.mockReset();
    mockSanitizeVoiceProfile.mockReset();
    mockSanitizeVoiceProfile.mockImplementation((value) => value);
  });

  it("includes the remaining legacy persona count when listing personalities", async () => {
    mockGetAllPersonalities.mockReturnValue([{ id: 910005, name: "Dark Ara" }]);
    mockGetLegacyPersonalityCount.mockReturnValue(10);

    const { listPersonalitiesHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    listPersonalitiesHandler({ voxisUser: { id: 4 } }, res, next);

    expect(mockGetAllPersonalities).toHaveBeenCalledWith(4);
    expect(mockGetLegacyPersonalityCount).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      personalities: [{ id: 910005, name: "Dark Ara" }],
      legacyPersonaCount: 10,
    });
  });

  it("claims legacy personas into the authenticated user's account", async () => {
    mockClaimLegacyPersonalities.mockReturnValue(10);
    mockGetAllPersonalities.mockReturnValue([
      { id: 910005, name: "Dark Ara", ownerId: 4 },
      { id: 910004, name: "Ara", ownerId: 4 },
    ]);
    mockGetLegacyPersonalityCount.mockReturnValue(0);

    const { claimLegacyPersonalitiesHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    claimLegacyPersonalitiesHandler({ voxisUser: { id: 4 } }, res, next);

    expect(mockClaimLegacyPersonalities).toHaveBeenCalledWith(4);
    expect(mockGetAllPersonalities).toHaveBeenCalledWith(4);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      claimedCount: 10,
      personalities: [
        { id: 910005, name: "Dark Ara", ownerId: 4 },
        { id: 910004, name: "Ara", ownerId: 4 },
      ],
      legacyPersonaCount: 0,
    });
  });

  it("rejects a legacy-claim request without a valid authenticated user", async () => {
    const { claimLegacyPersonalitiesHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    claimLegacyPersonalitiesHandler({ voxisUser: null }, res, next);

    expect(mockClaimLegacyPersonalities).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: "A valid authenticated user is required to claim legacy personas.",
    });
  });

  function savedPersona() {
    return {
      id: 42,
      name: "Joker",
      description: "A laugh in the dark.",
      mood: "cold",
      traits: ["dry"],
      quirks: ["late laugh"],
      sourceQuery: "Joker",
      sourceUrls: [],
      researchSources: [],
      researchSummary: "",
      speechStyle: "clipped",
      notablePhrases: [],
      behaviorRules: [],
      goals: [],
      values: ["chaos"],
      voiceProfile: { enabled: true },
      expressionProfile: { preset: "auto", calmness: 0.5, intensity: 0.5, blinkRate: 0.5, gazeDrift: 0.5 },
      bigFiveProfile: {
        openness: 0.5,
        conscientiousness: 0.5,
        extraversion: 0.5,
        agreeableness: 0.6,
        neuroticism: 0.5,
      },
      alignmentProfile: { enabled: false, alignment: "true_neutral" },
      expressionStyle: {
        energy: "medium",
        sentenceStyle: "fragments",
        interruptionRate: 0.3,
        rules: [],
        quirkDensity: 0.44,
        energyScore: 0.5,
      },
      stateFlaws: {},
      vocalMannerisms: { items: [], frequency: 0.15 },
      creativeContext: "default",
      moodBaseline: { valence: 0.2, arousal: -0.1, dominance: 0.4 },
      moodState: { valence: 0.2, arousal: -0.1, dominance: 0.4 },
      moodSensitivity: 1,
      responseFocusProfile: { defaultLens: "balanced", lenses: [{ id: "kept" }] },
      systemPrompt: "HAND EDIT",
      gender: "male",
      avatarImageUrl: "/avatars/joker.png",
      singingProfile: { archetype: "tenor" },
      emotionDrift: { warmth: 0.2 },
      llmConfig: { model: "local" },
    };
  }

  it("keeps unnamed profile columns when a save does not mention them", async () => {
    mockMoodFromLabel.mockReturnValue({ valence: 0, arousal: 0, dominance: 0.9 });
    mockGetPersonalityById.mockReturnValue(savedPersona());
    mockUpdatePersonality.mockImplementation((_id, payload) => ({ id: 42, ...payload }));

    const { updatePersonalityHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    updatePersonalityHandler({
      params: { id: "42" },
      voxisUser: { id: 4 },
      body: {
        name: "Joker",
        description: "A laugh in the dark.",
        mood: "cold",
        expressionStyle: {
          energy: "high",
          sentenceStyle: "fragments",
          interruptionRate: 0.3,
          rules: [],
        },
      },
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    const saved = mockUpdatePersonality.mock.calls[0][1];
    expect(saved.gender).toBe("male");
    expect(saved.avatarImageUrl).toBe("/avatars/joker.png");
    expect(saved.singingProfile).toEqual({ archetype: "tenor" });
    expect(saved.emotionDrift).toEqual({ warmth: 0.2 });
    expect(saved.llmConfig).toEqual({ model: "local" });
    expect(saved.moodBaseline.dominance).toBe(0.4);
    expect(saved.expressionStyle.quirkDensity).toBe(0.44);
    expect(saved.expressionStyle.energy).toBe("high");
    expect(saved.systemPrompt).toContain("You are Joker");
    expect(saved.traits).toEqual(["dry"]);
  });

  it("keeps a hand-edited system prompt and an explicit avatar", async () => {
    mockGetPersonalityById.mockReturnValue(savedPersona());
    mockUpdatePersonality.mockImplementation((_id, payload) => payload);

    const { updatePersonalityHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();

    updatePersonalityHandler({
      params: { id: "42" },
      voxisUser: { id: 4 },
      body: {
        name: "Joker",
        description: "A laugh in the dark.",
        mood: "cold",
        systemPrompt: "HAND EDIT",
        avatarImageUrl: "/avatars/new.png",
      },
    }, res, vi.fn());

    const saved = mockUpdatePersonality.mock.calls[0][1];
    expect(saved.systemPrompt).toBe("HAND EDIT");
    expect(saved.avatarImageUrl).toBe("/avatars/new.png");
    expect(saved.gender).toBe("male");
    expect(saved.singingProfile).toEqual({ archetype: "tenor" });
  });

  it("stores spoken coreValues on create", async () => {
    mockMoodFromLabel.mockReturnValue({ valence: 0.2, arousal: 0, dominance: 0 });
    mockCreatePersonality.mockImplementation((payload) => ({ id: 7, ...payload }));

    const { createPersonalityHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    createPersonalityHandler({
      voxisUser: { id: 4 },
      body: {
        name: "Dark Ara",
        description: "A quieter Ara.",
        coreValues: ["honesty", "nerve"],
      },
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockCreatePersonality.mock.calls[0][0].values).toEqual(["honesty", "nerve"]);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("does not create a spoken persona until the shift is confirmed", async () => {
    const { createPersonalityHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();

    createPersonalityHandler({
      voxisUser: { id: 4 },
      body: {
        name: "Dark Ara",
        description: "A quieter Ara.",
        coreValues: ["honesty"],
        spokenShift: { shifts: ["darker"], magnitude: "moderate", confirm: false },
      },
    }, res, vi.fn());

    expect(mockCreatePersonality).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("previews a spoken shift without writing", async () => {
    mockGetPersonalityById.mockReturnValue(savedPersona());
    const { previewSpokenShiftHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    previewSpokenShiftHandler({
      voxisUser: { id: 4 },
      body: { personalityId: 42, shifts: ["darker"] },
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockUpdatePersonality).not.toHaveBeenCalled();
    expect(mockInsertPersonaShiftAudit).not.toHaveBeenCalled();
    const preview = res.json.mock.calls[0][0];
    expect(preview.magnitudes.moderate.sentence).toContain("lowering agreeableness from sixty to fifty-two");
  });

  it("refuses to apply a spoken shift before confirmation", async () => {
    mockGetPersonalityById.mockReturnValue(savedPersona());
    const { applySpokenShiftHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();

    applySpokenShiftHandler({
      params: { id: "42" },
      voxisUser: { id: 4 },
      body: { shifts: ["add more sarcasm"], magnitude: "moderate", confirm: false },
    }, res, vi.fn());

    expect(mockUpdatePersonality).not.toHaveBeenCalled();
    expect(mockInsertPersonaShiftAudit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("does not write when the confirmed request is prose", async () => {
    mockGetPersonalityById.mockReturnValue(savedPersona());
    const { applySpokenShiftHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    applySpokenShiftHandler({
      params: { id: "42" },
      voxisUser: { id: 4 },
      body: { shifts: ["wear a red hat"], magnitude: "moderate", confirm: true },
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockUpdatePersonality).not.toHaveBeenCalled();
    expect(mockInsertPersonaShiftAudit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("applies a confirmed spoken shift onto the existing record and audits it", async () => {
    mockGetPersonalityById.mockReturnValue(savedPersona());
    mockUpdatePersonality.mockImplementation((_id, payload) => ({ id: 42, ...payload }));
    const { applySpokenShiftHandler } = await import("../controllers/personalityController.js");
    const res = createResponse();
    const next = vi.fn();

    applySpokenShiftHandler({
      params: { id: "42" },
      voxisUser: { id: 4 },
      body: { shifts: ["add more sarcasm"], magnitude: "moderate", confirm: true },
    }, res, next);

    expect(next).not.toHaveBeenCalled();
    const saved = mockUpdatePersonality.mock.calls[0][1];
    expect(saved.traits).toEqual(["dry"]);
    expect(saved.gender).toBe("male");
    expect(saved.avatarImageUrl).toBe("/avatars/joker.png");
    expect(saved.singingProfile).toEqual({ archetype: "tenor" });
    expect(saved.emotionDrift).toEqual({ warmth: 0.2 });
    expect(saved.llmConfig).toEqual({ model: "local" });
    expect(saved.systemPrompt).toBe("HAND EDIT");
    expect(saved.bigFiveProfile.agreeableness).toBe(0.52);
    expect(JSON.stringify(saved.traits)).not.toContain("sarcasm");
    expect(mockInsertPersonaShiftAudit).toHaveBeenCalledTimes(1);
    expect(mockInsertPersonaShiftAudit.mock.calls[0][0].sentence).toContain(
      "lowering agreeableness from sixty to fifty-two",
    );
    expect(mockInsertPersonaShiftAudit.mock.calls[0][0].magnitude).toBe("moderate");
  });
});
