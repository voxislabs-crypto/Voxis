import {
  listSavedVoiceMaps,
  upsertSavedVoiceMap,
  deleteSavedVoiceMap,
  clearLlmRuntimeConfig,
  getLlmRuntimeConfig,
  getSavedLlmCredential,
  getSavedLlmCredentials,
  setLlmRuntimeConfig,
  upsertSavedLlmCredential,
  removeSavedLlmCredential,
  getProfaneFilterConfig,
  setProfaneFilterConfig,
  getAllTtsCredentials,
  getTtsCredential,
  setTtsCredential,
  clearTtsCredential,
  getVoiceDefaults,
  setVoiceDefaults,
  getAllowedTtsCredentialProviders,
  isTtsDebugProviderLockEnabled,
  getKokoroHfToken,
  setKokoroHfToken,
  clearKokoroHfToken,
  getKokoroLocalPath,
  setKokoroLocalPath,
  clearKokoroLocalPath,
  getMoodRuntimeConfig,
  setMoodRuntimeConfig,
  getExpressionSamplingConfig,
  setExpressionSamplingConfig,
  getSttRuntimeConfig,
  setSttRuntimeConfig,
  getSearchRuntimeConfig,
  setSearchRuntimeConfig,
  getStateRuntimeConfig,
  setStateRuntimeConfig,
  getCognitionLoopConfig,
  setCognitionLoopConfig,
  getCompanionAliasConfig,
  setCompanionAliasConfig,
} from "../models/settingsModel.js";
import { randomUUID } from "node:crypto";
import {
  detectProviderByApiKey,
  fetchProviderModels,
  getSuggestedProviderIdFromApiKey,
  getOllamaStatus,
  listInstalledOllamaModels,
  listSupportedProviders,
} from "../services/providerDiscoveryService.js";

function maskApiKey(apiKey) {
  const key = String(apiKey || "");
  if (!key) {
    return "";
  }

  if (key.length <= 8) {
    return "****";
  }

  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function toPublicConfig(config) {
  const envApiKey = String(process.env.LLM_API_KEY || "").trim();
  const envBaseUrl = String(process.env.LLM_BASE_URL || "").trim();
  const envModel = String(process.env.LLM_MODEL || "").trim();
  const envLocked = String(process.env.LLM_LOCK_ENV || "").trim().toLowerCase() === "true";
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
      envConfigured: Boolean(envApiKey),
      envBaseUrl,
      envModel,
      envLocked,
    };
  }

  return {
    connected: Boolean(config.baseUrl && (config.apiKey || config.provider === "ollama")),
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    models: config.models || [],
    keyHint: maskApiKey(config.apiKey),
    connectedAt: config.connectedAt || "",
    savedProviders,
    envConfigured: Boolean(envApiKey),
    envBaseUrl,
    envModel,
    envLocked,
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
    const requestedProvider = String(req.body?.provider || "").trim();
    const baseUrl = String(req.body?.baseUrl || "").trim();
    const requestedModel = String(req.body?.model || "").trim();
    const suppliedApiKey = String(req.body?.apiKey || "").trim();
    const allowsEmptyApiKey = requestedProvider === "ollama";

    if (!requestedProvider) {
      return res.status(400).json({ error: "provider is required." });
    }

    const savedCredential = getSavedLlmCredential({ provider: requestedProvider, baseUrl });
    const envApiKey = String(process.env.LLM_API_KEY || "").trim();
    const envBaseUrl = String(process.env.LLM_BASE_URL || "").trim();

    // Only use the env key as a fallback if it actually belongs to the requested
    // provider — prevents silently connecting to OpenRouter when the user explicitly
    // selected Groq/OpenAI/etc.
    const envKeyProvider = getSuggestedProviderIdFromApiKey(envApiKey);
    const envKeyMatchesRequest =
      !envKeyProvider || // key has no detectable prefix (e.g. OpenAI sk-proj-)
      envKeyProvider === requestedProvider ||
      requestedProvider === "custom";

    const apiKey = suppliedApiKey || savedCredential?.apiKey || (envKeyMatchesRequest ? envApiKey : "");

    if (!apiKey && !allowsEmptyApiKey) {
      const envKeyProviderHint = envKeyProvider
        ? ` Your only configured key is for ${envKeyProvider}; select ${envKeyProvider} to connect without typing a key.`
        : "";
      return res.status(400).json({
        error: `No API key found for ${requestedProvider}.${envKeyProviderHint}`,
      });
    }

    // When no explicit baseUrl was provided and the provider is custom, fall
    // back to the env base URL so the env-configured endpoint is used.
    const resolvedBaseUrl = baseUrl || (requestedProvider === "custom" ? envBaseUrl : "");

    // Auto-correct provider when the key prefix clearly identifies a different
    // known provider, unless the user selected custom (custom is explicit).
    const suggestedProvider = getSuggestedProviderIdFromApiKey(apiKey);
    const provider =
      requestedProvider !== "custom" &&
      suggestedProvider &&
      suggestedProvider !== requestedProvider
        ? suggestedProvider
        : requestedProvider;

    const connected = await fetchProviderModels({
      providerId: provider,
      baseUrl: resolvedBaseUrl,
      apiKey,
    });

    if (provider === "ollama" && typeof listInstalledOllamaModels === "function") {
      const installed = listInstalledOllamaModels();
      const merged = new Map();
      for (const entry of [...(installed.models || []), ...(connected.models || [])]) {
        const id = String(entry?.id || "").trim();
        if (id && !merged.has(id)) {
          merged.set(id, {
            id,
            name: String(entry?.name || id).trim() || id,
            isFree: entry?.isFree !== false,
          });
        }
      }
      connected.models = [...merged.values()];
    }

    // When the model list is empty (e.g. rate-limited), accept any typed model;
    // otherwise require the model to be in the fetched list.
    const selectedModel =
      requestedModel && (connected.models.length === 0 || connected.models.some((model) => model.id === requestedModel))
        ? requestedModel
        : connected.model;

    const saved = setLlmRuntimeConfig({
      provider: connected.provider,
      baseUrl: connected.baseUrl,
      apiKey,
      model: selectedModel,
      models: connected.models,
    });

    if (apiKey) {
      upsertSavedLlmCredential({
        provider: connected.provider,
        baseUrl: connected.baseUrl,
        apiKey,
      });
    }

    return res.json({
      ...toPublicConfig(saved),
      providerName: connected.providerName,
      autoCorrectedProvider: provider !== requestedProvider,
      requestedProvider,
      rateLimited: Boolean(connected.rateLimited),
    });
  } catch (error) {
    return next(error);
  }
}

export async function detectLlmProviderHandler(req, res, next) {
  try {
    const suppliedKey = String(req.body?.apiKey || "").trim();
    // Fall back to env key for detect — the whole point of detect is to figure
    // out which provider a key belongs to, so the env key is always valid here.
    const apiKey = suppliedKey || String(process.env.LLM_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(400).json({ error: "apiKey is required." });
    }

    const detected = await detectProviderByApiKey(apiKey);
    return res.json(detected);
  } catch (error) {
    return next(error);
  }
}

export async function getOllamaStatusHandler(req, res, next) {
  try {
    const baseUrl = String(req.query?.baseUrl || "").trim();
    const status = await getOllamaStatus({ baseUrl });
    return res.json(status);
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

  let models = Array.isArray(current.models) ? current.models : [];
  let exists = models.some((model) => model.id === selectedModel);
  if (!exists && String(current.provider || "").trim().toLowerCase() === "ollama" && typeof listInstalledOllamaModels === "function") {
    const installed = listInstalledOllamaModels();
    const match = (installed.models || []).find((model) => model.id === selectedModel);
    if (match) {
      models = [...models, { id: match.id, name: match.name || match.id, isFree: true }];
      exists = true;
    }
  }
  if (!exists) {
    return res.status(400).json({ error: "Selected model is not available for the connected provider." });
  }

  const updated = setLlmRuntimeConfig({
    ...current,
    model: selectedModel,
    models,
  });

  return res.json(toPublicConfig(updated));
}

export function disconnectLlmSettingsHandler(_req, res) {
  clearLlmRuntimeConfig();
  return res.json(toPublicConfig(null));
}

export function removeSavedLlmCredentialHandler(req, res) {
  const provider = String(req.body?.provider || "").trim();
  const baseUrl = String(req.body?.baseUrl || "").trim();
  if (!provider) {
    return res.status(400).json({ error: "provider is required." });
  }
  removeSavedLlmCredential({ provider, baseUrl });
  return res.json(toPublicConfig(getLlmRuntimeConfig()));
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

function getActiveTtsProviderMeta() {
  const allowed = new Set(getAllowedTtsCredentialProviders());
  return Object.fromEntries(
    Object.entries(TTS_PROVIDER_META).filter(([id]) => allowed.has(id)),
  );
}

function toPublicTtsCredential(cred) {
  if (!cred) return null;
  const activeMeta = getActiveTtsProviderMeta();
  return {
    provider: cred.provider,
    connected: Boolean(cred.apiKey),
    keyHint: maskApiKey(cred.apiKey),
    voiceId: cred.voiceId || "",
    model: cred.model || "",
    updatedAt: cred.updatedAt || "",
    ...activeMeta[cred.provider],
  };
}

function toPublicKokoroSettings() {
  const saved = getKokoroHfToken();
  const localPath = getKokoroLocalPath();
  return {
    provider: "kokoro",
    connected: Boolean(saved?.token),
    keyHint: saved?.token ? maskApiKey(saved.token) : "",
    updatedAt: saved?.updatedAt || "",
    localPath: localPath || "",
  };
}

export function getTtsSettingsHandler(_req, res) {
  const saved = getAllTtsCredentials();
  const activeMeta = getActiveTtsProviderMeta();
  const result = Object.entries(activeMeta).map(([id, meta]) => {
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
  return res.json({
    providers: result,
    voiceDefaults: getVoiceDefaults(),
    debugLockEnabled: isTtsDebugProviderLockEnabled(),
  });
}

export function saveVoiceDefaultsHandler(req, res) {
  const source = String(req.body?.source || "").trim().toLowerCase();
  if (!["tts", "llm"].includes(source)) {
    return res.status(400).json({ error: "source must be 'tts' or 'llm'." });
  }

  const updated = setVoiceDefaults({ source });
  return res.json(updated);
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

    if (!getActiveTtsProviderMeta()[provider]) {
      return res.status(400).json({
        error: `TTS debug lock is active. Provider '${provider}' is disabled.`,
      });
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
    if (!getActiveTtsProviderMeta()[provider]) {
      return res.status(400).json({
        error: `TTS debug lock is active. Provider '${provider}' is disabled.`,
      });
    }
    clearTtsCredential(provider);
    return res.json({ provider, connected: false });
  } catch (error) {
    return next(error);
  }
}

export function getKokoroSettingsHandler(_req, res) {
  return res.json(toPublicKokoroSettings());
}

export function saveKokoroHfTokenHandler(req, res, next) {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "token is required." });
    }

    setKokoroHfToken({ token });
    return res.json(toPublicKokoroSettings());
  } catch (error) {
    return next(error);
  }
}

export function clearKokoroHfTokenHandler(_req, res, next) {
  try {
    clearKokoroHfToken();
    return res.json(toPublicKokoroSettings());
  } catch (error) {
    return next(error);
  }
}

export function saveKokoroLocalPathHandler(req, res, next) {
  try {
    const path = String(req.body?.path || "").trim();
    if (!path) {
      return res.status(400).json({ error: "path is required." });
    }

    setKokoroLocalPath({ path });
    return res.json(toPublicKokoroSettings());
  } catch (error) {
    return next(error);
  }
}

export function clearKokoroLocalPathHandler(_req, res, next) {
  try {
    clearKokoroLocalPath();
    return res.json(toPublicKokoroSettings());
  } catch (error) {
    return next(error);
  }
}

export function getMoodRuntimeSettingsHandler(_req, res) {
  return res.json(getMoodRuntimeConfig());
}

export function saveMoodRuntimeSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setMoodRuntimeConfig(body);
  return res.json(updated);
}

export function getExpressionSamplingSettingsHandler(_req, res) {
  return res.json(getExpressionSamplingConfig());
}

export function saveExpressionSamplingSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setExpressionSamplingConfig(body);
  return res.json(updated);
}

export function getSttRuntimeSettingsHandler(_req, res) {
  return res.json(getSttRuntimeConfig());
}

export function saveSttRuntimeSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setSttRuntimeConfig(body);
  return res.json(updated);
}

export function getSearchRuntimeSettingsHandler(_req, res) {
  return res.json(getSearchRuntimeConfig());
}

export function saveSearchRuntimeSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setSearchRuntimeConfig(body);
  return res.json(updated);
}

export function getStateRuntimeSettingsHandler(_req, res) {
  return res.json(getStateRuntimeConfig());
}

export function saveStateRuntimeSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setStateRuntimeConfig(body);
  return res.json(updated);
}

export function getCognitionLoopSettingsHandler(_req, res) {
  return res.json(getCognitionLoopConfig());
}

export function saveCognitionLoopSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setCognitionLoopConfig(body);
  return res.json(updated);
}

export function getProfaneFilterSettingsHandler(_req, res) {
  return res.json(getProfaneFilterConfig());
}

export function saveProfaneFilterSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setProfaneFilterConfig(body);
  return res.json(updated);
}

export function getCompanionAliasSettingsHandler(_req, res) {
  return res.json(getCompanionAliasConfig());
}

export function saveCompanionAliasSettingsHandler(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const updated = setCompanionAliasConfig(body);
  return res.json(updated);
}

export function getVoiceMapsHandler(req, res) {
  const userId = req.voxisUser?.id ?? null;
  return res.json({ maps: listSavedVoiceMaps({ userId }) });
}

export function saveVoiceMapHandler(req, res) {
  const userId = req.voxisUser?.id ?? null;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const voiceName = String(body.voiceName || body.name || "").trim();
  if (!voiceName) {
    return res.status(400).json({ error: "voiceName is required." });
  }

  if (!body.voiceProfile || typeof body.voiceProfile !== "object") {
    return res.status(400).json({ error: "voiceProfile is required." });
  }

  const id = String(body.id || "").trim() || randomUUID();
  const maps = upsertSavedVoiceMap({
    userId,
    map: {
      id,
      voiceName,
      linkedPersonalityId: body.linkedPersonalityId,
      linkedPersonalityName: body.linkedPersonalityName,
      voiceProfile: body.voiceProfile,
      createdAt: body.createdAt,
    },
  });

  return res.json({
    savedId: id,
    maps,
  });
}

export function deleteVoiceMapHandler(req, res) {
  const userId = req.voxisUser?.id ?? null;
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "voice map id is required." });
  }

  const maps = deleteSavedVoiceMap({ userId, id });
  return res.json({ maps });
}
