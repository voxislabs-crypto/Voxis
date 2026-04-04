import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetLlmRuntimeConfig = vi.fn();
const mockSetLlmRuntimeConfig = vi.fn();

vi.mock("../models/settingsModel.js", () => ({
  getLlmRuntimeConfig: mockGetLlmRuntimeConfig,
  setLlmRuntimeConfig: mockSetLlmRuntimeConfig,
}));

describe("llmService model fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetLlmRuntimeConfig.mockReset();
    mockSetLlmRuntimeConfig.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
});