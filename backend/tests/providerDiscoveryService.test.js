import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { afterEach, beforeEach, vi } from "vitest";

describe("providerDiscoveryService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects obvious provider and API key mismatches before probing", async () => {
    const { fetchProviderModels } = await import("../services/providerDiscoveryService.js");

    await expect(
      fetchProviderModels({
        providerId: "openrouter",
        apiKey: "xai-test-key",
        baseUrl: "https://openrouter.ai/api/v1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Grok"),
    });
  });

  it("supports keyless Ollama model discovery", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [
          { id: "llama3.2:latest" },
          { id: "qwen2.5:latest" },
        ],
      }),
    });

    const { fetchProviderModels } = await import("../services/providerDiscoveryService.js");
    const result = await fetchProviderModels({
      providerId: "ollama",
      apiKey: "",
      baseUrl: "http://127.0.0.1:11434/v1",
    });

    expect(result.provider).toBe("ollama");
    expect(result.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(result.models.length).toBeGreaterThan(0);
  });

  it("reads installed model names from an Ollama manifests folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "voxis-ollama-"));
    const manifests = path.join(root, "manifests", "registry.ollama.ai");
    await mkdir(path.join(manifests, "library", "llama3.1"), { recursive: true });
    await mkdir(path.join(manifests, "library", "qwen2.5"), { recursive: true });
    await mkdir(path.join(manifests, "mannix", "llama3.1-8b-lexi"), { recursive: true });
    await writeFile(path.join(manifests, "library", "llama3.1", "8b"), "{}");
    await writeFile(path.join(manifests, "library", "qwen2.5", "7b"), "{}");
    await writeFile(path.join(manifests, "mannix", "llama3.1-8b-lexi", "q4_k_m"), "{}");

    try {
      const { listInstalledOllamaModels } = await import("../services/providerDiscoveryService.js");
      const installed = listInstalledOllamaModels({ roots: [root] });
      expect(installed.models.map((model) => model.id)).toEqual([
        "llama3.1:8b",
        "mannix/llama3.1-8b-lexi:q4_k_m",
        "qwen2.5:7b",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});