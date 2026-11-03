import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLlmRuntimeConfig = vi.fn();
const mockSetLlmRuntimeConfig = vi.fn();
const mockGetSavedLlmCredentials = vi.fn(() => []);
const mockFetchProviderModels = vi.fn();

vi.mock("../models/settingsModel.js", () => ({
  getLlmRuntimeConfig: mockGetLlmRuntimeConfig,
  setLlmRuntimeConfig: mockSetLlmRuntimeConfig,
  getSavedLlmCredentials: mockGetSavedLlmCredentials,
  getProfaneFilterConfig: vi.fn(() => ({ enabled: false })),
}));

vi.mock("../services/providerDiscoveryService.js", () => ({
  fetchProviderModels: mockFetchProviderModels,
}));

describe("llmService model fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetLlmRuntimeConfig.mockReset();
    mockSetLlmRuntimeConfig.mockReset();
    mockGetSavedLlmCredentials.mockReset();
    mockGetSavedLlmCredentials.mockReturnValue([]);
    mockFetchProviderModels.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_LOCK_ENV;
  });

  it("prefers runtime config over env unless env locking is enabled", async () => {
    process.env.LLM_API_KEY = "sk-env";
    process.env.LLM_BASE_URL = "https://openrouter.ai/api/v1";
    process.env.LLM_MODEL = "meta-llama/llama-3.3-8b-instruct:free";

    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "deepseek/deepseek-r1:free",
      models: [
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", isFree: true },
      ],
    });

    global.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          { message: { content: "Runtime wins" } },
        ],
      }),
    });

    const { generateChatCompletion } = await import("../services/llmService.js");
    const result = await generateChatCompletion([{ role: "user", content: "hello" }]);

    expect(result).toBe("Runtime wins");
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).model).toBe("deepseek/deepseek-r1:free");

    vi.resetModules();
    global.fetch.mockClear();
    process.env.LLM_LOCK_ENV = "true";
    global.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          { message: { content: "Env wins" } },
        ],
      }),
    });

    const lockedModule = await import("../services/llmService.js");
    const lockedResult = await lockedModule.generateChatCompletion([{ role: "user", content: "hello" }]);

    expect(lockedResult).toBe("Env wins");
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).model).toBe("meta-llama/llama-3.3-8b-instruct:free");
  });

  it("retries a rate-limited runtime model with the next configured alternative", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "meta-llama/llama-3.3-70b-instruct:free",
      models: [
        { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", isFree: true },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", isFree: true },
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false },
      ],
    });

    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              message: "Provider returned error",
              metadata: {
                raw: "meta-llama/llama-3.3-70b-instruct:free is temporarily rate-limited upstream.",
              },
            },
          }),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "Recovered reply",
              },
            },
          ],
        }),
      });

    const { generateChatCompletion } = await import("../services/llmService.js");
    const result = await generateChatCompletion([{ role: "user", content: "hello" }]);

    expect(result).toBe("Recovered reply");
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const firstCall = global.fetch.mock.calls[0];
    const secondCall = global.fetch.mock.calls[1];
    expect(JSON.parse(firstCall[1].body).model).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(JSON.parse(secondCall[1].body).model).toBe("deepseek/deepseek-r1:free");
    expect(secondCall[1].headers["HTTP-Referer"]).toBe("https://localhost");
    expect(secondCall[1].headers["X-Title"]).toBe("Voxis");

    expect(mockSetLlmRuntimeConfig).toHaveBeenCalledWith({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "deepseek/deepseek-r1:free",
      models: [
        { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", isFree: true },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", isFree: true },
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false },
      ],
    });
  });

  it("does not retry non-rate-limit errors", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "meta-llama/llama-3.3-70b-instruct:free",
      models: [
        { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", isFree: true },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", isFree: true },
      ],
    });

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue(JSON.stringify({ error: { message: "Bad request" } })),
    });

    const { generateChatCompletion } = await import("../services/llmService.js");

    await expect(generateChatCompletion([{ role: "user", content: "hello" }])).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("Bad request"),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockSetLlmRuntimeConfig).not.toHaveBeenCalled();
  });

  it("switches to the next saved provider when the active account is out of credits", async () => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;

    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "grok",
      baseUrl: "https://api.x.ai/v1",
      apiKey: "xai-test",
      model: "grok-4.20-0309-reasoning",
      models: [
        { id: "grok-4.20-0309-reasoning", name: "Grok reasoning" },
        { id: "grok-4.3", name: "Grok 4.3" },
      ],
    });
    mockGetSavedLlmCredentials.mockReturnValue([
      {
        provider: "grok",
        baseUrl: "https://api.x.ai/v1",
        apiKey: "xai-test",
      },
      {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai-test",
      },
    ]);

    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(JSON.stringify({
          code: "permission-denied",
          error: "Your team has either used all available credits or reached its monthly spending limit.",
        })),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "Switched reply" } }],
          model: "gpt-4o-mini",
        }),
      });

    const { generateChatCompletion } = await import("../services/llmService.js");
    const result = await generateChatCompletion([{ role: "user", content: "hello" }]);

    expect(result).toBe("Switched reply");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe("https://api.x.ai/v1/chat/completions");
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).model).toBe("grok-4.20-0309-reasoning");
    expect(global.fetch.mock.calls[1][0]).toBe("https://api.openai.com/v1/chat/completions");
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).model).toBe("gpt-4o-mini");
    expect(mockSetLlmRuntimeConfig).toHaveBeenCalledWith({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-openai-test",
      model: "gpt-4o-mini",
      models: [{ id: "gpt-4o-mini", name: "gpt-4o-mini", isFree: false }],
    });
  });

  it("allows keyless runtime calls for Ollama", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "",
      model: "llama3.2:latest",
      models: [
        { id: "llama3.2:latest", name: "llama3.2:latest", isFree: true },
      ],
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "Local Ollama reply",
            },
          },
        ],
      }),
    });

    const { generateChatCompletion } = await import("../services/llmService.js");
    const result = await generateChatCompletion([{ role: "user", content: "hello" }]);

    expect(result).toBe("Local Ollama reply");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe("http://127.0.0.1:11434/v1/chat/completions");
  });

  it("uses a larger persona prompt budget when Ollama is active", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "",
      model: "llama3.2:latest",
      models: [],
    });

    const { describePersonaPromptBudget } = await import("../services/llmService.js");
    const budget = describePersonaPromptBudget({ creativeContext: "default" }, "short prompt");

    expect(budget.charBudget).toBeGreaterThanOrEqual(24000);
  });

  it("retries an unavailable openrouter model when the provider reports no endpoints", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "meta-llama/llama-3.3-8b-instruct:free",
      models: [
        { id: "meta-llama/llama-3.3-8b-instruct:free", name: "Llama 3.3 8B", isFree: true },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", isFree: true },
      ],
    });

    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              message: "No endpoints found for meta-llama/llama-3.3-8b-instruct:free.",
            },
          }),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "Fallback reply after unavailable model",
              },
            },
          ],
        }),
      });

    const { generateChatCompletion } = await import("../services/llmService.js");
    const result = await generateChatCompletion([{ role: "user", content: "hello" }]);

    expect(result).toBe("Fallback reply after unavailable model");
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).model).toBe("meta-llama/llama-3.3-8b-instruct:free");
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).model).toBe("deepseek/deepseek-r1:free");
    expect(mockSetLlmRuntimeConfig).toHaveBeenCalledWith({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "deepseek/deepseek-r1:free",
      models: [
        { id: "meta-llama/llama-3.3-8b-instruct:free", name: "Llama 3.3 8B", isFree: true },
        { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1", isFree: true },
      ],
    });
  });

  it("refreshes live openrouter models on 429 when cached alternatives are stale", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "meta-llama/llama-3.3-70b-instruct:free",
      models: [
        { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B", isFree: true },
      ],
    });
    mockFetchProviderModels.mockResolvedValue({
      provider: "openrouter",
      providerName: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      models: [
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false },
        { id: "qwen/qwen3.6-plus:free", name: "Qwen 3.6 Plus", isFree: true },
      ],
    });

    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              message: "Provider returned error",
              metadata: {
                raw: "meta-llama/llama-3.3-70b-instruct:free is temporarily rate-limited upstream.",
              },
            },
          }),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: "Fresh fallback reply",
              },
            },
          ],
        }),
      });

    const { generateChatCompletion } = await import("../services/llmService.js");
    const result = await generateChatCompletion([{ role: "user", content: "hello" }]);

    expect(result).toBe("Fresh fallback reply");
    expect(mockFetchProviderModels).toHaveBeenCalledWith({
      providerId: "openrouter",
      apiKey: "sk-or-v1-test",
      baseUrl: "https://openrouter.ai/api/v1",
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).model).toBe("openai/gpt-4o-mini");
    expect(mockSetLlmRuntimeConfig).toHaveBeenCalledWith({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-or-v1-test",
      model: "openai/gpt-4o-mini",
      models: [
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini", isFree: false },
        { id: "qwen/qwen3.6-plus:free", name: "Qwen 3.6 Plus", isFree: true },
      ],
    });
  });

  it("inlines system instructions for Google-compatible Gemma models", async () => {
    mockGetLlmRuntimeConfig.mockReturnValue({
      provider: "custom",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "google-test-key",
      model: "gemma-3-12b-it",
      models: [
        { id: "gemma-3-12b-it", name: "Gemma 3 12B IT", isFree: false },
      ],
    });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: "Gemma reply",
            },
          },
        ],
      }),
    });

    const { generateChatCompletion } = await import("../services/llmService.js");
    const result = await generateChatCompletion([
      { role: "system", content: "Stay in character." },
      { role: "assistant", content: "Previous assistant turn." },
      { role: "user", content: "Hello there" },
    ]);

    expect(result).toBe("Gemma reply");

    const payload = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(payload.model).toBe("gemma-3-12b-it");
    expect(payload.messages).toEqual([
      { role: "assistant", content: "Previous assistant turn." },
      {
        role: "user",
        content: [
          "Follow these conversation instructions exactly before answering:",
          "Stay in character.",
          "User message:",
          "Hello there",
        ].join("\n\n"),
      },
    ]);
  });

  it("injects an active response lens into the persona prompt package", async () => {
    const { buildPersonaPromptPackage } = await import("../services/llmService.js");

    const promptPackage = buildPersonaPromptPackage(
      {
        name: "Aegis",
        description: "A principled protector who steadies people under pressure.",
        traits: ["heroic", "steady", "protective"],
        behaviorRules: ["never abandon someone to panic", "speak with calm resolve"],
        quirks: [],
        speechStyle: "measured but warm",
        notablePhrases: [],
        values: ["justice", "care", "courage"],
        goals: ["protect the innocent", "restore resolve"],
        mood: "focused",
        bigFiveProfile: {
          openness: 0.6,
          conscientiousness: 0.78,
          extraversion: 0.52,
          agreeableness: 0.72,
          neuroticism: 0.2,
        },
        alignmentProfile: {
          enabled: true,
          alignment: "lawful_good",
        },
        responseFocusProfile: {
          defaultLens: "balanced",
          lenses: [
            {
              id: "balanced",
              label: "Balanced",
              weight: 0.7,
              priority: ["integrate core traits proportionally"],
              triggers: { emotions: [], intents: [], topics: [] },
              antiPatterns: [],
              styleHints: [],
              cooldown: 0.1,
            },
            {
              id: "courage",
              label: "Courage",
              weight: 0.95,
              priority: ["reinforce agency", "frame fear as survivable"],
              triggers: {
                emotions: ["afraid", "uncertain"],
                intents: ["encourage"],
                topics: ["failure", "risk"],
              },
              antiPatterns: ["do not coddle"],
              styleHints: ["steady resolve"],
              cooldown: 0.2,
            },
          ],
        },
      },
      [],
      "I'm afraid I'm going to fail this and I need encouragement.",
      {
        currentMoodLabel: "focused",
        conversationKey: "test-conversation",
      },
    );

    expect(promptPackage.activeResponseLens?.id).toBe("courage");
    expect(promptPackage.prompt).toContain("== ACTIVE RESPONSE LENS ==");
    expect(promptPackage.prompt).toContain("Primary lens: Courage");
    expect(promptPackage.prompt).toContain("- reinforce agency");
    expect(promptPackage.debug?.responseLens?.label).toBe("Courage");
  });

  it("maps legacy companion names to the current user name in prompt output", async () => {
    const { buildPersonaPromptPackage } = await import("../services/llmService.js");

    const promptPackage = buildPersonaPromptPackage(
      {
        name: "Rick Sanchez",
        description: "A cynical scientist who occasionally softens around Morty.",
        traits: ["world-weary", "protective of Morty"],
        behaviorRules: ["Keep Morty focused during dangerous situations."],
        quirks: ["calls Morty out when he's panicking"],
        speechStyle: "blunt, sarcastic, and paternal toward Morty",
        notablePhrases: ["Listen, Morty"],
        values: ["Morty's safety"],
        goals: ["Get Morty home alive"],
        mood: "primarily cynical, occasionally concerned for Morty",
        responseFocusProfile: {
          defaultLens: "balanced",
          lenses: [],
        },
      },
      [],
      "",
      {
        userName: "Alex",
        conversationKey: "name-swap-test",
      },
    );

    expect(promptPackage.prompt).toContain("Alex");
    expect(promptPackage.prompt).not.toContain("around Morty");
    expect(promptPackage.prompt).not.toContain("Listen, Morty");
    expect(promptPackage.prompt).toContain("== USER ANCHOR ==");
  });
});