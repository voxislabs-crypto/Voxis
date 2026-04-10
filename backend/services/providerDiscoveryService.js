const PROVIDERS = [
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
];

const PROVIDER_MAP = new Map(PROVIDERS.map((provider) => [provider.id, provider]));

function buildHeaders(provider, apiKey) {
  const headers = {
    "Content-Type": "application/json",
    ...(provider.extraHeaders || {}),
  };

  if (provider.auth === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function normalizeModelList(payload) {
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];

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
    .slice(0, 400);
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

async function probeProvider(provider, apiKey) {
  const response = await fetch(`${provider.baseUrl}${provider.modelsPath}`, {
    method: "GET",
    headers: buildHeaders(provider, apiKey),
  });

  if (!response.ok) {
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
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey) {
    const error = new Error("apiKey is required.");
    error.statusCode = 400;
    throw error;
  }

  const provider = resolveProviderConfig(providerId, baseUrl);
  const detection = await probeProvider(provider, trimmedKey);
  if (!detection) {
    const error = new Error("Unable to fetch models for the selected provider. Verify API key and base URL.");
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
