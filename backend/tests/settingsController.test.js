import { describe, expect, it, vi, beforeEach } from "vitest";

const mockClearLlmRuntimeConfig = vi.fn();
const mockGetLlmRuntimeConfig = vi.fn();
const mockGetSavedLlmCredential = vi.fn();
const mockGetSavedLlmCredentials = vi.fn();
const mockSetLlmRuntimeConfig = vi.fn();
const mockUpsertSavedLlmCredential = vi.fn();
const mockGetAllTtsCredentials = vi.fn();
const mockGetVoiceDefaults = vi.fn();
const mockSetVoiceDefaults = vi.fn();
const mockGetMoodRuntimeConfig = vi.fn();
const mockSetMoodRuntimeConfig = vi.fn();
const mockGetExpressionSamplingConfig = vi.fn();
const mockSetExpressionSamplingConfig = vi.fn();
const mockGetCompanionAliasConfig = vi.fn();
const mockSetCompanionAliasConfig = vi.fn();

const mockDetectProviderByApiKey = vi.fn();
const mockFetchProviderModels = vi.fn();
const mockGetSuggestedProviderIdFromApiKey = vi.fn();
const mockListSupportedProviders = vi.fn();
const mockGetOllamaStatus = vi.fn();

vi.mock("../models/settingsModel.js", () => ({
  clearLlmRuntimeConfig: mockClearLlmRuntimeConfig,
  getLlmRuntimeConfig: mockGetLlmRuntimeConfig,
  getSavedLlmCredential: mockGetSavedLlmCredential,
  getSavedLlmCredentials: mockGetSavedLlmCredentials,
  setLlmRuntimeConfig: mockSetLlmRuntimeConfig,
  upsertSavedLlmCredential: mockUpsertSavedLlmCredential,
  getAllTtsCredentials: mockGetAllTtsCredentials,
  getTtsCredential: vi.fn(),
  setTtsCredential: vi.fn(),
  clearTtsCredential: vi.fn(),
  getAllowedTtsCredentialProviders: vi.fn(() => ["cartesia", "elevenlabs", "openai"]),
  isTtsDebugProviderLockEnabled: vi.fn(() => false),
  getVoiceDefaults: mockGetVoiceDefaults,
  setVoiceDefaults: mockSetVoiceDefaults,
  getMoodRuntimeConfig: mockGetMoodRuntimeConfig,
  setMoodRuntimeConfig: mockSetMoodRuntimeConfig,
  getExpressionSamplingConfig: mockGetExpressionSamplingConfig,
  setExpressionSamplingConfig: mockSetExpressionSamplingConfig,
  getCompanionAliasConfig: mockGetCompanionAliasConfig,
  setCompanionAliasConfig: mockSetCompanionAliasConfig,
}));

vi.mock("../services/providerDiscoveryService.js", () => ({
  detectProviderByApiKey: mockDetectProviderByApiKey,
  fetchProviderModels: mockFetchProviderModels,
  getSuggestedProviderIdFromApiKey: mockGetSuggestedProviderIdFromApiKey,
  listSupportedProviders: mockListSupportedProviders,
  getOllamaStatus: mockGetOllamaStatus,
  listInstalledOllamaModels: vi.fn(() => ({ roots: [], models: [] })),
}));

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("settingsController", () => {
  beforeEach(() => {
    vi.resetModules();
    mockClearLlmRuntimeConfig.mockReset();
    mockGetLlmRuntimeConfig.mockReset();
    mockGetSavedLlmCredential.mockReset();
    mockGetSavedLlmCredentials.mockReset();
    mockSetLlmRuntimeConfig.mockReset();
    mockUpsertSavedLlmCredential.mockReset();
    mockGetAllTtsCredentials.mockReset();
    mockGetVoiceDefaults.mockReset();
    mockSetVoiceDefaults.mockReset();
    mockGetMoodRuntimeConfig.mockReset();
    mockSetMoodRuntimeConfig.mockReset();
    mockGetExpressionSamplingConfig.mockReset();
    mockSetExpressionSamplingConfig.mockReset();
    mockGetCompanionAliasConfig.mockReset();
    mockSetCompanionAliasConfig.mockReset();
    mockDetectProviderByApiKey.mockReset();
    mockFetchProviderModels.mockReset();
    mockGetSuggestedProviderIdFromApiKey.mockReset();
    mockListSupportedProviders.mockReset();
    mockGetOllamaStatus.mockReset();
    mockGetSavedLlmCredentials.mockReturnValue([]);
    mockGetAllTtsCredentials.mockReturnValue([]);
    mockGetVoiceDefaults.mockReturnValue({ source: "tts", updatedAt: "2026-04-09T00:00:00.000Z" });
  });

  it("returns saved provider hints with the public LLM settings", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-secret",
      model: "openai/gpt-4o-mini",
      models: [],
      connectedAt: "2026-04-04T00:00:00.000Z",
    });
    mockGetSavedLlmCredentials.mockReturnValue([
      {
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-v1-secret",
        updatedAt: "2026-04-04T00:00:00.000Z",
      },
    ]);

    const { getLlmSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();

    getLlmSettingsHandler({}, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        connected: true,
        keyHint: "sk-o...cret",
        savedProviders: [
          {
            provider: "openrouter",
            baseUrl: "https://openrouter.ai/api/v1",
            keyHint: "sk-o...cret",
            updatedAt: "2026-04-04T00:00:00.000Z",
          },
        ],
      }),
    );
  });

  it("reuses the saved provider key when reconnecting without a new one", async () => {
    mockGetSavedLlmCredential.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-saved",
      updatedAt: "2026-04-04T00:00:00.000Z",
    });
    mockFetchProviderModels.mockResolvedValue({
      provider: "openrouter",
      providerName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      models: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false }],
      model: "openai/gpt-4o-mini",
    });
    mockSetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-saved",
      model: "openai/gpt-4o-mini",
      models: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false }],
      connectedAt: "2026-04-04T00:00:00.000Z",
    });
    mockGetSavedLlmCredentials.mockReturnValue([
      {
        provider: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-v1-saved",
        updatedAt: "2026-04-04T00:00:00.000Z",
      },
    ]);

    const { connectLlmSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();
    const next = vi.fn();

    await connectLlmSettingsHandler(
      {
        body: {
          provider: "openrouter",
          apiKey: "",
          baseUrl: "https://openrouter.ai/api/v1",
        },
      },
      res,
      next,
    );

    expect(mockFetchProviderModels).toHaveBeenCalledWith({
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-saved",
    });
    expect(mockUpsertSavedLlmCredential).toHaveBeenCalledWith({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-saved",
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        connected: true,
        providerName: "OpenRouter",
      }),
    );
  });

  it("auto-corrects the provider when the API key prefix clearly indicates another provider", async () => {
    mockGetSuggestedProviderIdFromApiKey.mockReturnValue("openrouter");
    mockFetchProviderModels.mockResolvedValue({
      provider: "openrouter",
      providerName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      models: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false }],
      model: "openai/gpt-4o-mini",
    });
    mockSetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-live",
      model: "openai/gpt-4o-mini",
      models: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false }],
      connectedAt: "2026-04-11T00:00:00.000Z",
    });

    const { connectLlmSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();
    const next = vi.fn();

    await connectLlmSettingsHandler(
      {
        body: {
          provider: "grok",
          apiKey: "sk-or-v1-live",
        },
      },
      res,
      next,
    );

    expect(mockFetchProviderModels).toHaveBeenCalledWith({
      providerId: "openrouter",
      baseUrl: "",
      apiKey: "sk-or-v1-live",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        requestedProvider: "grok",
        autoCorrectedProvider: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("allows connecting Ollama without an API key", async () => {
    mockFetchProviderModels.mockResolvedValue({
      provider: "ollama",
      providerName: "Ollama (Offline)",
      baseUrl: "http://127.0.0.1:11434/v1",
      models: [{ id: "llama3.2:latest", name: "llama3.2:latest", isFree: true }],
      model: "llama3.2:latest",
    });
    mockSetLlmRuntimeConfig.mockReturnValue({
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "",
      model: "llama3.2:latest",
      models: [{ id: "llama3.2:latest", name: "llama3.2:latest", isFree: true }],
      connectedAt: "2026-04-23T00:00:00.000Z",
    });

    const { connectLlmSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();
    const next = vi.fn();

    await connectLlmSettingsHandler(
      {
        body: {
          provider: "ollama",
          apiKey: "",
        },
      },
      res,
      next,
    );

    expect(mockFetchProviderModels).toHaveBeenCalledWith({
      providerId: "ollama",
      baseUrl: "",
      apiKey: "",
    });
    expect(mockUpsertSavedLlmCredential).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        connected: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns Ollama runtime status", async () => {
    mockGetOllamaStatus.mockResolvedValue({
      provider: "ollama",
      providerName: "Ollama (Offline)",
      baseUrl: "http://127.0.0.1:11434/v1",
      reachable: true,
      version: "0.5.7",
      models: [{ id: "llama3.2:latest", name: "llama3.2:latest", isFree: true }],
      model: "llama3.2:latest",
      checkedAt: "2026-04-23T00:00:00.000Z",
    });

    const { getOllamaStatusHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();
    const next = vi.fn();

    await getOllamaStatusHandler(
      {
        query: {
          baseUrl: "http://127.0.0.1:11434/v1",
        },
      },
      res,
      next,
    );

    expect(mockGetOllamaStatus).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:11434/v1",
    });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        reachable: true,
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns shared default voice source with the public TTS settings", async () => {
    mockGetAllTtsCredentials.mockReturnValue([
      {
        provider: "elevenlabs",
        apiKey: "sk_tts_secret",
        voiceId: "voice-1",
        model: "eleven_multilingual_v2",
        updatedAt: "2026-04-09T00:00:00.000Z",
      },
    ]);
    mockGetVoiceDefaults.mockReturnValue({ source: "llm", updatedAt: "2026-04-09T01:00:00.000Z" });

    const { getTtsSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();

    getTtsSettingsHandler({}, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        voiceDefaults: {
          source: "llm",
          updatedAt: "2026-04-09T01:00:00.000Z",
        },
        providers: expect.arrayContaining([
          expect.objectContaining({
            provider: "elevenlabs",
            connected: true,
            voiceId: "voice-1",
          }),
        ]),
      }),
    );
  });

  it("returns expression sampling settings", async () => {
    mockGetExpressionSamplingConfig.mockReturnValue({
      enabled: true,
      deterministicSeed: true,
      modeProfiles: {
        kids: { enabled: true, topK: 2, temperature: 0.3, maxReplacements: 1 },
        scientist: { enabled: false, topK: 1, temperature: 0.1, maxReplacements: 0 },
        normal: { enabled: true, topK: 3, temperature: 0.6, maxReplacements: 2 },
      },
    });

    const { getExpressionSamplingSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();

    getExpressionSamplingSettingsHandler({}, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        deterministicSeed: true,
      }),
    );
  });

  it("saves expression sampling settings", async () => {
    mockSetExpressionSamplingConfig.mockReturnValue({
      enabled: true,
      deterministicSeed: false,
      modeProfiles: {
        kids: { enabled: true, topK: 2, temperature: 0.3, maxReplacements: 1 },
        scientist: { enabled: false, topK: 1, temperature: 0.1, maxReplacements: 0 },
        normal: { enabled: true, topK: 4, temperature: 0.8, maxReplacements: 2 },
      },
    });

    const { saveExpressionSamplingSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();

    saveExpressionSamplingSettingsHandler(
      {
        body: {
          enabled: true,
          deterministicSeed: false,
          modeProfiles: {
            normal: { topK: 4, temperature: 0.8 },
          },
        },
      },
      res,
    );

    expect(mockSetExpressionSamplingConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        deterministicSeed: false,
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        deterministicSeed: false,
      }),
    );
  });

  it("returns companion alias settings", async () => {
    mockGetCompanionAliasConfig.mockReturnValue({
      enabled: true,
      aliases: ["morty", "sidekick"],
      updatedAt: "2026-05-04T00:00:00.000Z",
    });

    const { getCompanionAliasSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();

    getCompanionAliasSettingsHandler({}, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        aliases: ["morty", "sidekick"],
      }),
    );
  });

  it("saves companion alias settings", async () => {
    mockSetCompanionAliasConfig.mockReturnValue({
      enabled: true,
      aliases: ["morty", "assistant"],
      updatedAt: "2026-05-04T00:00:00.000Z",
    });

    const { saveCompanionAliasSettingsHandler } = await import("../controllers/settingsController.js");
    const res = createResponse();

    saveCompanionAliasSettingsHandler(
      {
        body: {
          enabled: true,
          aliases: ["Morty", "assistant", "morty"],
        },
      },
      res,
    );

    expect(mockSetCompanionAliasConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        aliases: ["Morty", "assistant", "morty"],
      }),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        aliases: ["morty", "assistant"],
      }),
    );
  });
});