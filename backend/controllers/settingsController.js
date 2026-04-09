import {
  clearLlmRuntimeConfig,
  getLlmRuntimeConfig,
  getSavedLlmCredential,
  getSavedLlmCredentials,
  setLlmRuntimeConfig,
  upsertSavedLlmCredential,
  getAllTtsCredentials,
  getTtsCredential,
  setTtsCredential,
  clearTtsCredential,
} from "../models/settingsModel.js";
import {
  detectProviderByApiKey,
  fetchProviderModels,
  listSupportedProviders,
} from "../services/providerDiscoveryService.js";

function maskApiKey(apiKey) {
  const key = String(apiKey || "");
  if (key.length <= 8) {
    return "****";
  }

  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function toPublicConfig(config) {
  const savedProviders = getSavedLlmCredentials().map((credential) => ({
    provider: credential.provider,
    baseUrl: credential.baseUrl,
    keyHint: maskApiKey(credential.apiKey),
    updatedAt: credential.updatedAt || "",
  }));

  if (!config) {
    return {
      connected: false,
      provider: "",
      baseUrl: "",
      model: "",
      models: [],
      keyHint: "",
      connectedAt: "",
      savedProviders,
    };
  }

  return {
    connected: Boolean(config.apiKey && config.baseUrl),
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    models: config.models || [],
    keyHint: maskApiKey(config.apiKey),
    connectedAt: config.connectedAt || "",
    savedProviders,
  };
}

export function getLlmSettingsHandler(_req, res) {
  const config = getLlmRuntimeConfig();
  return res.json(toPublicConfig(config));
}

export function listLlmProvidersHandler(_req, res) {
  return res.json({
    providers: [
      ...listSupportedProviders(),
      {
        id: "custom",
        name: "Custom OpenAI-Compatible",
        baseUrl: "",
      },
    ],
  });
}

export async function connectLlmSettingsHandler(req, res, next) {
  try {
    const provider = String(req.body?.provider || "").trim();
    const baseUrl = String(req.body?.baseUrl || "").trim();
    const requestedModel = String(req.body?.model || "").trim();
    const suppliedApiKey = String(req.body?.apiKey || "").trim();

    if (!provider) {
      return res.status(400).json({ error: "provider is required." });
    }

    const savedCredential = getSavedLlmCredential({ provider, baseUrl });
    const apiKey = suppliedApiKey || savedCredential?.apiKey || "";

    if (!apiKey) {
      return res.status(400).json({ error: "apiKey is required unless a saved key already exists for this provider." });
    }

    const connected = await fetchProviderModels({
      providerId: provider,
      baseUrl,
      apiKey,
    });

    const selectedModel =
      requestedModel && connected.models.some((model) => model.id === requestedModel)
        ? requestedModel
        : connected.model;

    const saved = setLlmRuntimeConfig({
      provider: connected.provider,
      baseUrl: connected.baseUrl,
      apiKey,
      model: selectedModel,
      models: connected.models,
    });

    upsertSavedLlmCredential({
      provider: connected.provider,
      baseUrl: connected.baseUrl,
      apiKey,
    });

    return res.json({
      ...toPublicConfig(saved),
      providerName: connected.providerName,
    });
  } catch (error) {
    return next(error);
  }
}

export async function detectLlmProviderHandler(req, res, next) {
  try {
    const apiKey = String(req.body?.apiKey || "").trim();
    if (!apiKey) {
      return res.status(400).json({ error: "apiKey is required." });
    }

    const detected = await detectProviderByApiKey(apiKey);
    return res.json(detected);
  } catch (error) {
    return next(error);
  }
}

export function selectLlmModelHandler(req, res) {
  const selectedModel = String(req.body?.model || "").trim();
  if (!selectedModel) {
    return res.status(400).json({ error: "model is required." });
  }

  const current = getLlmRuntimeConfig();
  if (!current) {
    return res.status(404).json({ error: "No provider is connected." });
  }

  const exists = (current.models || []).some((model) => model.id === selectedModel);
  if (!exists) {
    return res.status(400).json({ error: "Selected model is not available for the connected provider." });
  }

  const updated = setLlmRuntimeConfig({
    ...current,
    model: selectedModel,
  });

  return res.json(toPublicConfig(updated));
}

export function disconnectLlmSettingsHandler(_req, res) {
  clearLlmRuntimeConfig();
  return res.json(toPublicConfig(null));
}

// ── TTS Settings (BYOK) ────────────────────────────────────────────────────

const TTS_PROVIDER_META = {
  elevenlabs: {
    name: "ElevenLabs",
    defaultVoiceId: "21m00Tcm4TlvDq8ikWAM",
    defaultModel: "eleven_multilingual_v2",
    pricingNote: "Free tier: 10k chars/month. Paid from ~$11/million.",
    docsUrl: "https://elevenlabs.io/voice-library",
  },
  cartesia: {
    name: "Cartesia",
    defaultVoiceId: "a0e99841-438c-4a64-b679-ae501e7d6091",
    defaultModel: "sonic-2",
    pricingNote: "Free tier available. Paid ~$0.65/million chars.",
    docsUrl: "https://play.cartesia.ai/voices",
  },
};

function toPublicTtsCredential(cred) {
  if (!cred) return null;
  return {
    provider: cred.provider,
    connected: Boolean(cred.apiKey),
    keyHint: maskApiKey(cred.apiKey),
    voiceId: cred.voiceId || "",
    model: cred.model || "",
    updatedAt: cred.updatedAt || "",
    ...TTS_PROVIDER_META[cred.provider],
  };
}

export function getTtsSettingsHandler(_req, res) {
  const saved = getAllTtsCredentials();
  const result = Object.entries(TTS_PROVIDER_META).map(([id, meta]) => {
    const cred = saved.find((c) => c.provider === id);
    return {
      provider: id,
      connected: Boolean(cred?.apiKey),
      keyHint: cred ? maskApiKey(cred.apiKey) : "",
      voiceId: cred?.voiceId || "",
      model: cred?.model || "",
      updatedAt: cred?.updatedAt || "",
      ...meta,
    };
  });
  return res.json({ providers: result });
}

export function saveTtsCredentialHandler(req, res, next) {
  try {
    const provider = String(req.params.provider || "").trim().toLowerCase();
    const apiKey = String(req.body?.apiKey || "").trim();
    const voiceId = String(req.body?.voiceId || "").trim();
    const model = String(req.body?.model || "").trim();

    if (!apiKey) {
      return res.status(400).json({ error: "apiKey is required." });
    }

    const saved = setTtsCredential({ provider, apiKey, voiceId, model });
    return res.json(toPublicTtsCredential(saved));
  } catch (error) {
    return next(error);
  }
}

export function clearTtsCredentialHandler(req, res, next) {
  try {
    const provider = String(req.params.provider || "").trim().toLowerCase();
    clearTtsCredential(provider);
    return res.json({ provider, connected: false });
  } catch (error) {
    return next(error);
  }
}
