import { describe, expect, it, vi, beforeEach } from "vitest";

const mockClearLlmRuntimeConfig = vi.fn();
const mockGetLlmRuntimeConfig = vi.fn();
const mockGetSavedLlmCredential = vi.fn();
const mockGetSavedLlmCredentials = vi.fn();
const mockSetLlmRuntimeConfig = vi.fn();
const mockUpsertSavedLlmCredential = vi.fn();

const mockDetectProviderByApiKey = vi.fn();
const mockFetchProviderModels = vi.fn();
const mockListSupportedProviders = vi.fn();

vi.mock("../models/settingsModel.js", () => ({
  clearLlmRuntimeConfig: mockClearLlmRuntimeConfig,
  getLlmRuntimeConfig: mockGetLlmRuntimeConfig,
  getSavedLlmCredential: mockGetSavedLlmCredential,
  getSavedLlmCredentials: mockGetSavedLlmCredentials,
  setLlmRuntimeConfig: mockSetLlmRuntimeConfig,
  upsertSavedLlmCredential: mockUpsertSavedLlmCredential,
}));

vi.mock("../services/providerDiscoveryService.js", () => ({
  detectProviderByApiKey: mockDetectProviderByApiKey,
  fetchProviderModels: mockFetchProviderModels,
  listSupportedProviders: mockListSupportedProviders,
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
    mockDetectProviderByApiKey.mockReset();
    mockFetchProviderModels.mockReset();
    mockListSupportedProviders.mockReset();
    mockGetSavedLlmCredentials.mockReturnValue([]);
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
});