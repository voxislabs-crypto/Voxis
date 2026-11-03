import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

const PROVIDERS = [
  {
    id: "ollama",
    name: "Ollama (Offline)",
    baseUrl: "http://127.0.0.1:11434/v1",
    auth: "none",
    modelsPath: "/models",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    auth: "bearer",
    modelsPath: "/models",
  },
  {
    id: "grok",
    name: "Grok (xAI)",
    baseUrl: "https://api.x.ai/v1",
    auth: "bearer",
    modelsPath: "/models",
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    auth: "bearer",
    modelsPath: "/models",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    auth: "bearer",
    modelsPath: "/models",
    extraHeaders: {
      "HTTP-Referer": "https://localhost",
      "X-Title": "Voxis",
    },
  },
  {
    id: "together",
    name: "Together",
    baseUrl: "https://api.together.xyz/v1",
    auth: "bearer",
    modelsPath: "/models",
  },
  {
    id: "mistral",
    name: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    auth: "bearer",
    modelsPath: "/models",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    auth: "anthropic",
    modelsPath: "/models",
  },
  {
    id: "awan",
    name: "Awan LLM",
    baseUrl: "https://api.awanllm.com/v1",
    auth: "bearer",
    modelsPath: "/models",
  },
];

const PROVIDER_MAP = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

export function getSuggestedProviderIdFromApiKey(apiKey) {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    return "";
  }

  if (trimmedKey.startsWith("sk-ant-")) return "anthropic";
  if (trimmedKey.startsWith("sk-or-v1-")) return "openrouter";
  if (trimmedKey.startsWith("xai-") || trimmedKey.startsWith("xai_")) return "grok";
  if (trimmedKey.startsWith("gsk_")) return "groq";
  return "";
}

function validateApiKeyMatchesProvider(providerId, apiKey) {
  if (!String(apiKey || "").trim()) {
    return;
  }

  const suggestedProviderId = getSuggestedProviderIdFromApiKey(apiKey);
  if (!suggestedProviderId || !providerId || providerId === "custom" || suggestedProviderId === providerId) {
    return;
  }

  const suggestedProvider = PROVIDER_MAP.get(suggestedProviderId);
  const selectedProvider = PROVIDER_MAP.get(providerId);
  const error = new Error(
    `This API key looks like a ${suggestedProvider?.name || suggestedProviderId} key, but ${selectedProvider?.name || providerId} is selected. Choose ${suggestedProvider?.name || suggestedProviderId} or use Detect Provider first.`,
  );
  error.statusCode = 400;
  throw error;
}

function buildHeaders(provider, apiKey) {
  const headers = {
    "Content-Type": "application/json",
    ...(provider.extraHeaders || {}),
  };

  if (provider.auth === "none") {
    return headers;
  }

  if (provider.auth === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function normalizeModelList(payload) {
  const list = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : Array.isArray(payload)
        ? payload
        : [];

  function hasZeroPricing(pricing) {
    if (!pricing || typeof pricing !== "object") {
      return false;
    }

    const values = [
      pricing.prompt,
      pricing.completion,
      pricing.request,
      pricing.input,
      pricing.output,
      pricing.image,
    ]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));

    return values.length > 0 && values.every((value) => value <= 0);
  }

  function isLikelyFreeModel(item, id, name) {
    if (item?.isFree === true || item?.is_free === true || item?.free === true) {
      return true;
    }

    if (hasZeroPricing(item?.pricing)) {
      return true;
    }

    return /(^|[:/\s_-])free($|[:/\s_-])/i.test(`${id} ${name}`);
  }

  return list
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const id = String(item.id || item.name || "").trim();
      if (!id) {
        return null;
      }

      const name = String(item.name || item.display_name || id).trim();
      return {
        id,
        name,
        isFree: isLikelyFreeModel(item, id, name),
      };
    })
    .filter(Boolean)
    .slice(0, 250);
}

function chooseDefaultModel(providerId, models) {
  if (!models.length) {
    return "";
  }

  const priority = [
    "gpt-4o-mini",
    "gpt-4.1-mini",
    "gpt-4o",
    "llama-3.3-70b-versatile",
    "claude-3-5-sonnet",
    "mistral-large-latest",
  ];

  for (const preferred of priority) {
    const found = models.find((model) => model.id.toLowerCase().includes(preferred.toLowerCase()));
    if (found) {
      return found.id;
    }
  }

  if (providerId === "openrouter") {
    const openRouterChat = models.find((model) => /\/chat|\bgpt|\bclaude|\bllama/i.test(model.id));
    if (openRouterChat) {
      return openRouterChat.id;
    }
  }

  return models[0].id;
}

async function probeProvider(provider, apiKey, timeoutMs = 15000) {
  // OpenRouter returns 300+ models — give it more time on slow servers.
  const effectiveTimeout = provider.id === "openrouter" ? 30000 : timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeout);

  let response;
  try {
    response = await fetch(`${provider.baseUrl}${provider.modelsPath}`, {
      method: "GET",
      headers: buildHeaders(provider, apiKey),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      const error = new Error(`${provider.name} took too long to respond (>${effectiveTimeout / 1000}s). Try again or check your connection.`);
      error.statusCode = 504;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (provider.id === "ollama" && response.status === 404) {
      const ollamaBase = String(provider.baseUrl || "").replace(/\/v1\/?$/, "");
      const tagsResponse = await fetch(`${ollamaBase}/api/tags`, {
        method: "GET",
        headers: buildHeaders(provider, apiKey),
      });

      if (!tagsResponse.ok) {
        return null;
      }

      const tagsPayload = await tagsResponse.json();
      const tagsModels = normalizeModelList(tagsPayload);
      if (!tagsModels.length) {
        return null;
      }

      return {
        provider: provider.id,
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        models: tagsModels,
        model: chooseDefaultModel(provider.id, tagsModels),
      };
    }

    // 429 means the key is valid but the models endpoint is rate-limited.
    // Return a minimal result so the user can still connect; the model list
    // will just be empty and they can type the model ID manually.
    if (response.status === 429) {
      return {
        provider: provider.id,
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        models: [],
        model: "",
        rateLimited: true,
      };
    }
    return null;
  }

  const payload = await response.json();
  const models = normalizeModelList(payload);
  if (!models.length) {
    return null;
  }

  return {
    provider: provider.id,
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    models,
    model: chooseDefaultModel(provider.id, models),
  };
}

export function listSupportedProviders() {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
  }));
}

export function resolveProviderConfig(providerId, baseUrl = "") {
  const normalizedProvider = String(providerId || "").trim().toLowerCase();
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/$/, "");

  if (normalizedProvider === "custom") {
    if (!normalizedBaseUrl) {
      const error = new Error("baseUrl is required for custom provider.");
      error.statusCode = 400;
      throw error;
    }

    return {
      id: "custom",
      name: "Custom OpenAI-Compatible",
      baseUrl: normalizedBaseUrl,
      auth: "bearer",
      modelsPath: "/models",
    };
  }

  const provider = PROVIDER_MAP.get(normalizedProvider);
  if (!provider) {
    const error = new Error("Unsupported provider.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...provider,
    baseUrl: normalizedBaseUrl || provider.baseUrl,
  };
}

export async function fetchProviderModels({ providerId, apiKey, baseUrl }) {
  const provider = resolveProviderConfig(providerId, baseUrl);
  const trimmedKey = String(apiKey || "").trim();
  const providerRequiresApiKey = provider.auth !== "none";

  if (providerRequiresApiKey && !trimmedKey) {
    const error = new Error("apiKey is required.");
    error.statusCode = 400;
    throw error;
  }

  validateApiKeyMatchesProvider(String(providerId || "").trim().toLowerCase(), trimmedKey);

  const detection = await probeProvider(provider, trimmedKey);
  if (!detection) {
    const error = new Error(`Unable to connect to ${providerId}. The API key may be invalid, or the provider may be temporarily unreachable.`);
    error.statusCode = 400;
    throw error;
  }

  return {
    provider: detection.provider,
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    models: detection.models,
    model: detection.model,
  };
}

export async function detectProviderByApiKey(apiKey) {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    const error = new Error("API key is required.");
    error.statusCode = 400;
    throw error;
  }

  const priorityProviders = [...PROVIDERS];

  if (trimmedKey.startsWith("sk-ant-")) {
    priorityProviders.sort((a, b) => (a.id === "anthropic" ? -1 : b.id === "anthropic" ? 1 : 0));
  } else if (trimmedKey.startsWith("sk-or-v1-")) {
    priorityProviders.sort((a, b) => (a.id === "openrouter" ? -1 : b.id === "openrouter" ? 1 : 0));
  } else if (trimmedKey.startsWith("xai-") || trimmedKey.startsWith("xai_")) {
    priorityProviders.sort((a, b) => (a.id === "grok" ? -1 : b.id === "grok" ? 1 : 0));
  } else if (trimmedKey.startsWith("gsk_")) {
    priorityProviders.sort((a, b) => (a.id === "groq" ? -1 : b.id === "groq" ? 1 : 0));
  }

  for (const provider of priorityProviders) {
    try {
      const detection = await probeProvider(provider, trimmedKey);
      if (detection) {
        return detection;
      }
    } catch {
      // Ignore and continue probing next provider.
    }
  }

  const error = new Error(
    "Unable to identify a supported provider for this API key. Try a key from OpenAI, Grok (xAI), Groq, OpenRouter, Together, Mistral, or Anthropic.",
  );
  error.statusCode = 400;
  throw error;
}

function readOllamaAppModelsPath() {
  const localAppData = String(process.env.LOCALAPPDATA || "").trim();
  if (!localAppData) {
    return "";
  }

  const dbPath = path.join(localAppData, "Ollama", "db.sqlite");
  try {
    if (!fs.existsSync(dbPath)) {
      return "";
    }
  } catch {
    return "";
  }

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare("SELECT models FROM settings LIMIT 1").get();
      return String(row?.models || "").trim();
    } finally {
      db.close();
    }
  } catch {
    return "";
  }
}

function findOllamaModelRoots() {
  const candidates = [];
  const envDir = String(process.env.OLLAMA_MODELS || "").trim();
  if (envDir) {
    candidates.push(envDir);
  }

  const homeDir = os.homedir();
  if (homeDir) {
    candidates.push(path.join(homeDir, ".ollama", "models"));
  }

  const appDir = readOllamaAppModelsPath();
  if (appDir) {
    candidates.push(appDir);
  }

  if (process.platform === "win32") {
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      candidates.push(`${letter}:\\.ollama\\models`);
    }
  }

  const roots = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const resolved = path.resolve(String(candidate || "").trim());
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (!resolved || seen.has(key)) {
      continue;
    }
    seen.add(key);
    try {
      if (fs.statSync(resolved).isDirectory()) {
        roots.push(resolved);
      }
    } catch {
      // Missing drives and unused homes are expected.
    }
  }
  return roots;
}

function collectFiles(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, out);
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
  return out;
}

function modelIdFromManifest(manifestsDir, filePath) {
  const relative = path.relative(manifestsDir, filePath);
  const parts = relative.split(path.sep).filter(Boolean);
  if (parts.length < 3) {
    return "";
  }

  const tag = parts[parts.length - 1];
  const name = parts[parts.length - 2];
  const namespace = parts[parts.length - 3];
  if (!tag || !name) {
    return "";
  }
  if (!namespace || namespace === "library" || namespace === "registry.ollama.ai") {
    return `${name}:${tag}`;
  }
  return `${namespace}/${name}:${tag}`;
}

export function listInstalledOllamaModels({ roots } = {}) {
  const modelRoots = Array.isArray(roots) ? roots.filter(Boolean) : findOllamaModelRoots();
  const models = new Map();

  for (const root of modelRoots) {
    const manifestsDir = path.join(root, "manifests");
    for (const filePath of collectFiles(manifestsDir)) {
      const id = modelIdFromManifest(manifestsDir, filePath);
      if (!id || models.has(id)) {
        continue;
      }
      models.set(id, {
        id,
        name: id,
        isFree: true,
        source: "disk",
      });
    }
  }

  return {
    roots: modelRoots,
    models: [...models.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function mergeOllamaModels(primary = [], extra = []) {
  const merged = new Map();
  for (const model of [...primary, ...extra]) {
    const id = String(model?.id || "").trim();
    if (!id || merged.has(id)) {
      continue;
    }
    merged.set(id, {
      id,
      name: String(model?.name || id).trim() || id,
      isFree: model?.isFree !== false,
      source: String(model?.source || "").trim(),
    });
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export async function getOllamaStatus({ baseUrl = "" } = {}) {
  const provider = resolveProviderConfig("ollama", baseUrl);
  const ollamaBase = String(provider.baseUrl || "").replace(/\/v1\/?$/, "");
  const installed = listInstalledOllamaModels();

  const status = {
    provider: "ollama",
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    reachable: false,
    version: "",
    models: installed.models,
    model: installed.models[0]?.id || "",
    modelRoots: installed.roots,
    checkedAt: new Date().toISOString(),
  };

  try {
    const [versionResponse, modelsResponse] = await Promise.all([
      fetch(`${ollamaBase}/api/version`, {
        method: "GET",
        headers: buildHeaders(provider, ""),
      }),
      fetchProviderModels({
        providerId: "ollama",
        apiKey: "",
        baseUrl: provider.baseUrl,
      }),
    ]);

    if (versionResponse.ok) {
      const versionPayload = await versionResponse.json();
      status.version = String(versionPayload?.version || "").trim();
    }

    status.reachable = true;
    status.models = mergeOllamaModels(installed.models, modelsResponse.models);
    status.model = String(modelsResponse.model || status.models[0]?.id || "").trim();
    return status;
  } catch (error) {
    status.reachable = false;
    status.error = error?.message || "Unable to reach local Ollama runtime.";
    return status;
  }
}
