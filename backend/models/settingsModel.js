import db from "../db/db.js";

const LLM_CONFIG_KEY = "llm_config";
const LLM_SAVED_CREDENTIALS_KEY = "llm_saved_credentials";
const TTS_CREDENTIALS_KEY = "tts_credentials";
const VOICE_DEFAULTS_KEY = "voice_defaults";
const VOICE_MAPS_KEY = "voice_maps";
const KOKORO_HF_TOKEN_KEY = "kokoro_hf_token";
const KOKORO_LOCAL_PATH_KEY = "kokoro_local_path";
const MOOD_RUNTIME_CONFIG_KEY = "mood_runtime_config";
const EXPRESSION_SAMPLING_CONFIG_KEY = "expression_sampling_config";
const COGNITION_LOOP_CONFIG_KEY = "cognition_loop_config";
const STT_RUNTIME_CONFIG_KEY = "stt_runtime_config";
const SEARCH_RUNTIME_CONFIG_KEY = "search_runtime_config";
const STATE_RUNTIME_CONFIG_KEY = "state_runtime_config";
const PROFANE_FILTER_CONFIG_KEY = "profane_filter_config";
const COMPANION_ALIAS_CONFIG_KEY = "companion_alias_config";
function isTtsDebugProviderLockEnabledRuntime() {
  return String(process.env.TTS_DEBUG_PROVIDER_LOCK ?? "true").trim().toLowerCase() !== "false";
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeModels(models) {
  if (!Array.isArray(models)) {
    return [];
  }

  return models
    .map((model) => {
      if (!model || typeof model !== "object") {
        return null;
      }

      return {
        id: String(model.id || "").trim(),
        name: String(model.name || model.id || "").trim(),
        isFree: Boolean(model.isFree),
      };
    })
    .filter((model) => model && model.id)
    .slice(0, 300);
}

function normalizeCredentialTarget(provider, baseUrl) {
  return {
    provider: String(provider || "").trim(),
    baseUrl: String(baseUrl || "").trim().replace(/\/$/, ""),
  };
}

function sanitizeSavedCredentials(credentials) {
  if (!Array.isArray(credentials)) {
    return [];
  }

  const seen = new Set();

  return credentials
    .map((credential) => {
      if (!credential || typeof credential !== "object") {
        return null;
      }

      const target = normalizeCredentialTarget(credential.provider, credential.baseUrl);
      const apiKey = String(credential.apiKey || "").trim();
      if (!target.provider || !apiKey) {
        return null;
      }

      const dedupeKey = `${target.provider}::${target.baseUrl}`;
      if (seen.has(dedupeKey)) {
        return null;
      }
      seen.add(dedupeKey);

      return {
        provider: target.provider,
        baseUrl: target.baseUrl,
        apiKey,
        updatedAt: String(credential.updatedAt || "").trim(),
      };
    })
    .filter(Boolean)
    .slice(0, 30);
}

function writeAppSetting(key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updatedAt)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP`,
  ).run(key, JSON.stringify(value));
}

function sanitizeVoiceSource(source) {
  return ["tts", "llm"].includes(String(source || "").trim().toLowerCase())
    ? String(source).trim().toLowerCase()
    : "tts";
}

function sanitizeVoiceMapProfile(profile) {
  const source = profile && typeof profile === "object" ? profile : {};
  return {
    enabled: source.enabled !== false,
    autoplay: Boolean(source.autoplay),
    engine: String(source.engine || "auto").trim().toLowerCase() || "auto",
    pitch: Number(source.pitch) || 1,
    rate: Number(source.rate) || 1,
    preferredVoice: String(source.preferredVoice || "").trim(),
    providerVoice: String(source.providerVoice || "").trim(),
    providerModel: String(source.providerModel || "").trim(),
    piperModelPath: String(source.piperModelPath || "").trim(),
    piperSpeaker: source.piperSpeaker == null ? null : Number(source.piperSpeaker),
    kokoroVoice: String(source.kokoroVoice || "").trim(),
    elevenLabsVoiceId: String(source.elevenLabsVoiceId || "").trim(),
    elevenLabsModel: String(source.elevenLabsModel || "").trim(),
    stability: Number(source.stability ?? 0.5),
    similarityBoost: Number(source.similarityBoost ?? 0.75),
    style: Number(source.style ?? 0.5),
    cartesiaVoiceId: String(source.cartesiaVoiceId || "").trim(),
    cartesiaModel: String(source.cartesiaModel || "").trim(),
  };
}

function sanitizeVoiceMaps(maps) {
  if (!Array.isArray(maps)) {
    return [];
  }

  return maps
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const voiceName = String(entry.voiceName || entry.name || "").trim();
      const id = String(entry.id || "").trim();
      if (!id || !voiceName) {
        return null;
      }

      const linkedPersonalityId = Number(entry.linkedPersonalityId);
      return {
        id,
        voiceName,
        linkedPersonalityId: Number.isInteger(linkedPersonalityId) ? linkedPersonalityId : null,
        linkedPersonalityName: String(entry.linkedPersonalityName || "").trim(),
        voiceProfile: sanitizeVoiceMapProfile(entry.voiceProfile),
        createdAt: String(entry.createdAt || "").trim(),
        updatedAt: String(entry.updatedAt || "").trim(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.voiceName.localeCompare(right.voiceName))
    .slice(0, 500);
}

function getVoiceMapsStore() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(VOICE_MAPS_KEY);
  return parseJsonObject(row?.value || "") || {};
}

function saveVoiceMapsStore(store) {
  writeAppSetting(VOICE_MAPS_KEY, store && typeof store === "object" ? store : {});
}

function getVoiceMapsForUser(userId = null) {
  const store = getVoiceMapsStore();
  const mapsByUser = store.mapsByUser && typeof store.mapsByUser === "object" ? store.mapsByUser : {};
  const legacyMaps = Array.isArray(store.maps) ? store.maps : [];
  const key = String(userId || "global");
  const scoped = Array.isArray(mapsByUser[key]) ? mapsByUser[key] : [];
  const source = scoped.length ? scoped : legacyMaps;
  return sanitizeVoiceMaps(source);
}

export function listSavedVoiceMaps({ userId = null } = {}) {
  return getVoiceMapsForUser(userId);
}

export function upsertSavedVoiceMap({ userId = null, map }) {
  const input = map && typeof map === "object" ? map : {};
  const id = String(input.id || "").trim();
  const voiceName = String(input.voiceName || input.name || "").trim();
  if (!id || !voiceName) {
    return listSavedVoiceMaps({ userId });
  }

  const current = getVoiceMapsForUser(userId).filter((entry) => entry.id !== id);
  const now = new Date().toISOString();
  const createdAt = String(input.createdAt || "").trim() || now;

  current.push({
    id,
    voiceName,
    linkedPersonalityId: Number.isInteger(Number(input.linkedPersonalityId))
      ? Number(input.linkedPersonalityId)
      : null,
    linkedPersonalityName: String(input.linkedPersonalityName || "").trim(),
    voiceProfile: sanitizeVoiceMapProfile(input.voiceProfile),
    createdAt,
    updatedAt: now,
  });

  const sorted = sanitizeVoiceMaps(current);
  const store = getVoiceMapsStore();
  const mapsByUser = store.mapsByUser && typeof store.mapsByUser === "object" ? store.mapsByUser : {};
  const key = String(userId || "global");
  mapsByUser[key] = sorted;
  saveVoiceMapsStore({ mapsByUser });

  return sorted;
}

export function deleteSavedVoiceMap({ userId = null, id }) {
  const target = String(id || "").trim();
  if (!target) {
    return listSavedVoiceMaps({ userId });
  }

  const filtered = getVoiceMapsForUser(userId).filter((entry) => entry.id !== target);
  const store = getVoiceMapsStore();
  const mapsByUser = store.mapsByUser && typeof store.mapsByUser === "object" ? store.mapsByUser : {};
  const key = String(userId || "global");
  mapsByUser[key] = filtered;
  saveVoiceMapsStore({ mapsByUser });

  return sanitizeVoiceMaps(filtered);
}

export function getLlmRuntimeConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(LLM_CONFIG_KEY);
  const config = parseJsonObject(row?.value || "");
  if (!config) {
    return null;
  }

  return {
    provider: String(config.provider || "").trim(),
    baseUrl: String(config.baseUrl || "").trim(),
    apiKey: String(config.apiKey || "").trim(),
    model: String(config.model || "").trim(),
    models: sanitizeModels(config.models),
    connectedAt: String(config.connectedAt || "").trim(),
  };
}

export function setLlmRuntimeConfig(config) {
  const normalized = {
    provider: String(config.provider || "").trim(),
    baseUrl: String(config.baseUrl || "").trim().replace(/\/$/, ""),
    apiKey: String(config.apiKey || "").trim(),
    model: String(config.model || "").trim(),
    models: sanitizeModels(config.models),
    connectedAt: new Date().toISOString(),
  };

  writeAppSetting(LLM_CONFIG_KEY, normalized);

  return getLlmRuntimeConfig();
}

export function clearLlmRuntimeConfig() {
  db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(LLM_CONFIG_KEY);
}

export function getSavedLlmCredentials() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(LLM_SAVED_CREDENTIALS_KEY);
  const saved = parseJsonObject(row?.value || "");
  return sanitizeSavedCredentials(saved?.credentials || saved?.providers || []);
}

export function getSavedLlmCredential({ provider, baseUrl } = {}) {
  const target = normalizeCredentialTarget(provider, baseUrl);
  if (!target.provider) {
    return null;
  }

  const savedCredentials = getSavedLlmCredentials();
  const exactMatch = savedCredentials.find(
    (credential) => credential.provider === target.provider && credential.baseUrl === target.baseUrl,
  );
  if (exactMatch) {
    return exactMatch;
  }

  // When the caller omitted baseUrl (non-custom providers), also accept the
  // first credential that matches on provider alone so saved keys are reused.
  if (!target.baseUrl) {
    return savedCredentials.find(
      (credential) => credential.provider === target.provider,
    ) || null;
  }

  return savedCredentials.find(
    (credential) => credential.provider === target.provider && credential.baseUrl === "",
  ) || null;
}

export function removeSavedLlmCredential({ provider, baseUrl }) {
  const target = normalizeCredentialTarget(provider, baseUrl);
  if (!target.provider) {
    return getSavedLlmCredentials();
  }

  const savedCredentials = getSavedLlmCredentials().filter(
    (credential) => !(credential.provider === target.provider && credential.baseUrl === target.baseUrl),
  );

  writeAppSetting(LLM_SAVED_CREDENTIALS_KEY, {
    credentials: sanitizeSavedCredentials(savedCredentials),
  });

  return getSavedLlmCredentials();
}

export function upsertSavedLlmCredential({ provider, baseUrl, apiKey }) {
  const target = normalizeCredentialTarget(provider, baseUrl);
  const normalizedKey = String(apiKey || "").trim();
  if (!target.provider || !normalizedKey) {
    return getSavedLlmCredentials();
  }

  const now = new Date().toISOString();
  const savedCredentials = getSavedLlmCredentials().filter(
    (credential) => !(credential.provider === target.provider && credential.baseUrl === target.baseUrl),
  );

  savedCredentials.unshift({
    provider: target.provider,
    baseUrl: target.baseUrl,
    apiKey: normalizedKey,
    updatedAt: now,
  });

  writeAppSetting(LLM_SAVED_CREDENTIALS_KEY, {
    credentials: sanitizeSavedCredentials(savedCredentials),
  });

  return getSavedLlmCredentials();
}

// ── TTS Credentials (BYOK) ──────────────────────────────────────────────────
// Stores per-provider API keys for ElevenLabs and Cartesia in SQLite so users
// can configure them from the browser without touching .env files.

const TTS_PROVIDERS = ["elevenlabs", "cartesia"];

export function isTtsDebugProviderLockEnabled() {
  return isTtsDebugProviderLockEnabledRuntime();
}

export function getAllowedTtsCredentialProviders() {
  return isTtsDebugProviderLockEnabledRuntime() ? ["cartesia"] : TTS_PROVIDERS;
}

function sanitizeTtsProvider(id) {
  return getAllowedTtsCredentialProviders().includes(String(id || "").trim().toLowerCase())
    ? String(id).trim().toLowerCase()
    : null;
}

function sanitizeTtsCredential(provider, data) {
  if (!data || typeof data !== "object") return null;
  return {
    provider,
    apiKey: String(data.apiKey || "").trim(),
    voiceId: String(data.voiceId || "").trim(),
    model: String(data.model || "").trim(),
    updatedAt: String(data.updatedAt || "").trim(),
  };
}

function readTtsStore() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(TTS_CREDENTIALS_KEY);
  return parseJsonObject(row?.value || "") || {};
}

export function getTtsCredential(provider) {
  const id = sanitizeTtsProvider(provider);
  if (!id) return null;
  const store = readTtsStore();
  return sanitizeTtsCredential(id, store[id]) || null;
}

export function getAllTtsCredentials() {
  const store = readTtsStore();
  return getAllowedTtsCredentialProviders().map((id) => sanitizeTtsCredential(id, store[id])).filter(Boolean);
}

export function setTtsCredential({ provider, apiKey, voiceId = "", model = "" }) {
  const id = sanitizeTtsProvider(provider);
  if (!id) throw Object.assign(new Error(`Unknown TTS provider: ${provider}`), { statusCode: 400 });
  const key = String(apiKey || "").trim();
  if (!key) throw Object.assign(new Error("apiKey is required."), { statusCode: 400 });

  const store = readTtsStore();
  store[id] = {
    apiKey: key,
    voiceId: String(voiceId || "").trim(),
    model: String(model || "").trim(),
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(TTS_CREDENTIALS_KEY, store);
  return getTtsCredential(id);
}

export function clearTtsCredential(provider) {
  const id = sanitizeTtsProvider(provider);
  if (!id) throw Object.assign(new Error(`Unknown TTS provider: ${provider}`), { statusCode: 400 });
  const store = readTtsStore();
  delete store[id];
  writeAppSetting(TTS_CREDENTIALS_KEY, store);
}

export function getVoiceDefaults() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(VOICE_DEFAULTS_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  return {
    source: sanitizeVoiceSource(parsed.source),
    updatedAt: String(parsed.updatedAt || "").trim(),
  };
}

export function setVoiceDefaults({ source }) {
  const normalized = {
    source: sanitizeVoiceSource(source),
    updatedAt: new Date().toISOString(),
  };

  writeAppSetting(VOICE_DEFAULTS_KEY, normalized);
  return getVoiceDefaults();
}

export function getKokoroHfToken() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(KOKORO_HF_TOKEN_KEY);
  const parsed = parseJsonObject(row?.value || "");
  const token = String(parsed?.token || "").trim();
  if (!token) {
    return null;
  }

  return {
    token,
    updatedAt: String(parsed?.updatedAt || "").trim(),
  };
}

export function setKokoroHfToken({ token }) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw Object.assign(new Error("token is required."), { statusCode: 400 });
  }

  writeAppSetting(KOKORO_HF_TOKEN_KEY, {
    token: normalizedToken,
    updatedAt: new Date().toISOString(),
  });

  return getKokoroHfToken();
}

export function clearKokoroHfToken() {
  db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(KOKORO_HF_TOKEN_KEY);
}

export function getKokoroLocalPath() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(KOKORO_LOCAL_PATH_KEY);
  if (!row) return null;
  const parsed = parseJsonObject(row.value);
  return parsed?.path || null;
}

export function setKokoroLocalPath({ path }) {
  writeAppSetting(KOKORO_LOCAL_PATH_KEY, {
    path: String(path || "").trim(),
    updatedAt: new Date().toISOString(),
  });
  return getKokoroLocalPath();
}

export function clearKokoroLocalPath() {
  db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(KOKORO_LOCAL_PATH_KEY);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeRecoveryCurves(curves) {
  const input = curves && typeof curves === "object" ? curves : {};
  return {
    default: clampNumber(input.default, 0.01, 0.25, 0.03),
    stoic: clampNumber(input.stoic, 0.01, 0.25, 0.06),
    volatile: clampNumber(input.volatile, 0.01, 0.25, 0.02),
    bratty: clampNumber(input.bratty, 0.01, 0.25, 0.025),
    villainous: clampNumber(input.villainous, 0.01, 0.25, 0.015),
    kind: clampNumber(input.kind, 0.01, 0.25, 0.05),
  };
}

function sanitizeMoodRuntimeConfig(config) {
  const normalized = config && typeof config === "object" ? config : {};
  const inertia = clampNumber(normalized.inertia, 0.5, 0.95, 0.5);
  const responsiveness = clampNumber(
    normalized.responsiveness,
    0.05,
    0.5,
    Number((1 - inertia).toFixed(3)),
  );

  return {
    inertia,
    responsiveness,
    perTurnDeltaCap: clampNumber(normalized.perTurnDeltaCap, 0.2, 0.8, 0.65),
    recoveryCurves: sanitizeRecoveryCurves(normalized.recoveryCurves),
    updatedAt: String(normalized.updatedAt || "").trim(),
  };
}

function sanitizeCognitionLoopConfig(config) {
  const input = config && typeof config === "object" ? config : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    intervalMinutes: Math.round(clampNumber(input.intervalMinutes, 5, 180, 15)),
    maxPersonalitiesPerRun: Math.round(clampNumber(input.maxPersonalitiesPerRun, 1, 25, 8)),
    recentMessagesWindow: Math.round(clampNumber(input.recentMessagesWindow, 4, 20, 8)),
    memoryContextLimit: Math.round(clampNumber(input.memoryContextLimit, 3, 20, 8)),
    inactivityHoursForReachOut: clampNumber(input.inactivityHoursForReachOut, 6, 168, 24),
    curiosityThreshold: clampNumber(input.curiosityThreshold, 0.4, 0.95, 0.75),
    maxNewGoalsPerRun: Math.round(clampNumber(input.maxNewGoalsPerRun, 0, 3, 1)),
    deliveryEnabled: typeof input.deliveryEnabled === "boolean" ? input.deliveryEnabled : true,
    deliveryMinIntervalMinutes: Math.round(clampNumber(input.deliveryMinIntervalMinutes, 2, 240, 10)),
    deliveryMaxPerHour: Math.round(clampNumber(input.deliveryMaxPerHour, 1, 12, 2)),
    deliveryPriorityThreshold: clampNumber(input.deliveryPriorityThreshold, 0.4, 0.95, 0.6),
    activeUserWindowMinutes: Math.round(clampNumber(input.activeUserWindowMinutes, 1, 30, 2)),
    quietHoursEnabled: typeof input.quietHoursEnabled === "boolean" ? input.quietHoursEnabled : true,
    quietHoursStartHour: Math.round(clampNumber(input.quietHoursStartHour, 0, 23, 1)),
    quietHoursEndHour: Math.round(clampNumber(input.quietHoursEndHour, 0, 23, 7)),
    startupGraceMinutes: Math.round(clampNumber(input.startupGraceMinutes, 0, 120, 10)),
    autonomousDecisionEnabled: typeof input.autonomousDecisionEnabled === "boolean" ? input.autonomousDecisionEnabled : false,
    updatedAt: String(input.updatedAt || "").trim(),
  };
}

export function getCognitionLoopConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(COGNITION_LOOP_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  return sanitizeCognitionLoopConfig(parsed);
}

export function setCognitionLoopConfig(config) {
  const sanitized = sanitizeCognitionLoopConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(COGNITION_LOOP_CONFIG_KEY, payload);
  return getCognitionLoopConfig();
}

function isLegacyZoeDamping(config) {
  const curves = config?.recoveryCurves || {};
  return Number(config?.inertia) === 0.75
    && Number(curves.default) === 0.08
    && Number(curves.stoic) === 0.12
    && Number(curves.volatile) === 0.04
    && Number(curves.bratty) === 0.06
    && Number(curves.villainous) === 0.03
    && Number(curves.kind) === 0.1
    && Number(config?.perTurnDeltaCap ?? 0.45) === 0.45;
}

export function getMoodRuntimeConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(MOOD_RUNTIME_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  if (isLegacyZoeDamping(parsed)) {
    return setMoodRuntimeConfig({});
  }
  return sanitizeMoodRuntimeConfig(parsed);
}

export function setMoodRuntimeConfig(config) {
  const sanitized = sanitizeMoodRuntimeConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(MOOD_RUNTIME_CONFIG_KEY, payload);
  return getMoodRuntimeConfig();
}

function sanitizeExpressionModeProfile(profile, defaults) {
  const input = profile && typeof profile === "object" ? profile : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    topK: Math.round(clampNumber(input.topK, 1, 6, defaults.topK)),
    temperature: clampNumber(input.temperature, 0.05, 1.2, defaults.temperature),
    maxReplacements: Math.round(clampNumber(input.maxReplacements, 0, 3, defaults.maxReplacements)),
  };
}

function sanitizeExpressionSamplingConfig(config) {
  const input = config && typeof config === "object" ? config : {};
  const defaults = {
    enabled: true,
    deterministicSeed: true,
    modeProfiles: {
      kids: { enabled: true, topK: 2, temperature: 0.3, maxReplacements: 1 },
      scientist: { enabled: false, topK: 1, temperature: 0.1, maxReplacements: 0 },
      normal: { enabled: true, topK: 3, temperature: 0.6, maxReplacements: 2 },
    },
  };

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    deterministicSeed:
      typeof input.deterministicSeed === "boolean"
        ? input.deterministicSeed
        : defaults.deterministicSeed,
    modeProfiles: {
      kids: sanitizeExpressionModeProfile(input.modeProfiles?.kids, defaults.modeProfiles.kids),
      scientist: sanitizeExpressionModeProfile(input.modeProfiles?.scientist, defaults.modeProfiles.scientist),
      normal: sanitizeExpressionModeProfile(input.modeProfiles?.normal, defaults.modeProfiles.normal),
    },
    updatedAt: String(input.updatedAt || "").trim(),
  };
}

function sanitizeSttRuntimeConfig(config) {
  const input = config && typeof config === "object" ? config : {};
  const provider = String(input.provider || "openai-compatible").trim().toLowerCase();
  const model = String(input.model || "whisper-1").trim();
  const baseUrl = String(input.baseUrl || "http://127.0.0.1:8000/v1").trim().replace(/\/$/, "");

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    provider: provider || "openai-compatible",
    baseUrl,
    model,
    language: String(input.language || "auto").trim() || "auto",
    apiKey: String(input.apiKey || "").trim(),
    maxAudioBytes: Math.round(clampNumber(input.maxAudioBytes, 1024 * 64, 1024 * 1024 * 30, 1024 * 1024 * 10)),
    updatedAt: String(input.updatedAt || "").trim(),
  };
}

function sanitizeSearchRuntimeConfig(config) {
  const input = config && typeof config === "object" ? config : {};
  const provider = String(input.provider || "duckduckgo").trim().toLowerCase();

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    provider: provider || "duckduckgo",
    autoForQueries: typeof input.autoForQueries === "boolean" ? input.autoForQueries : true,
    maxResults: Math.round(clampNumber(input.maxResults, 1, 8, 4)),
    timeoutMs: Math.round(clampNumber(input.timeoutMs, 1000, 20000, 7000)),
    updatedAt: String(input.updatedAt || "").trim(),
  };
}

function sanitizeStateRuntimeConfig(config) {
  const input = config && typeof config === "object" ? config : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : false,
    tickSeconds: Math.round(clampNumber(input.tickSeconds, 10, 3600, 60)),
    maxCatchUpTicks: Math.round(clampNumber(input.maxCatchUpTicks, 1, 720, 120)),
    perTickScale: clampNumber(input.perTickScale, 0.05, 5, 1),
    applyDecayDuringTicks: typeof input.applyDecayDuringTicks === "boolean" ? input.applyDecayDuringTicks : true,
    applyRecoveryDuringTicks: typeof input.applyRecoveryDuringTicks === "boolean" ? input.applyRecoveryDuringTicks : true,
    updatedAt: String(input.updatedAt || "").trim(),
  };
}

function sanitizeProfaneFilterConfig(config) {
  const input = config && typeof config === "object" ? config : {};
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : false,
    disclaimer: String(input.disclaimer || "").trim(),
    updatedAt: String(input.updatedAt || "").trim(),
  };
}

function sanitizeCompanionAliasConfig(config) {
  const input = config && typeof config === "object" ? config : {};
  const aliases = Array.isArray(input.aliases)
    ? input.aliases
        .map((alias) => String(alias || "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 40)
    : ["morty"];

  const uniqueAliases = [];
  const seen = new Set();
  for (const alias of aliases) {
    if (seen.has(alias)) continue;
    seen.add(alias);
    uniqueAliases.push(alias);
  }

  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    aliases: uniqueAliases.length ? uniqueAliases : ["morty"],
    updatedAt: String(input.updatedAt || "").trim(),
  };
}

export function getSttRuntimeConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(STT_RUNTIME_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  return sanitizeSttRuntimeConfig(parsed);
}

export function setSttRuntimeConfig(config) {
  const sanitized = sanitizeSttRuntimeConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(STT_RUNTIME_CONFIG_KEY, payload);
  return getSttRuntimeConfig();
}

export function getSearchRuntimeConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(SEARCH_RUNTIME_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  return sanitizeSearchRuntimeConfig(parsed);
}

export function setSearchRuntimeConfig(config) {
  const sanitized = sanitizeSearchRuntimeConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(SEARCH_RUNTIME_CONFIG_KEY, payload);
  return getSearchRuntimeConfig();
}

export function getStateRuntimeConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(STATE_RUNTIME_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  return sanitizeStateRuntimeConfig(parsed);
}

export function setStateRuntimeConfig(config) {
  const sanitized = sanitizeStateRuntimeConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(STATE_RUNTIME_CONFIG_KEY, payload);
  return getStateRuntimeConfig();
}

export function getExpressionSamplingConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(EXPRESSION_SAMPLING_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  return sanitizeExpressionSamplingConfig(parsed);
}

export function setExpressionSamplingConfig(config) {
  const sanitized = sanitizeExpressionSamplingConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(EXPRESSION_SAMPLING_CONFIG_KEY, payload);
  return getExpressionSamplingConfig();
}

export function getProfaneFilterConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(PROFANE_FILTER_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  // Check environment variable for default override
  const envEnabled = process.env.PROFANE_FILTER_ENABLED !== undefined
    ? String(process.env.PROFANE_FILTER_ENABLED).trim().toLowerCase() === "true"
    : null;
  return {
    enabled: envEnabled !== null ? envEnabled : (typeof parsed.enabled === "boolean" ? parsed.enabled : false),
    disclaimer: String(parsed.disclaimer || "").trim(),
    updatedAt: String(parsed.updatedAt || "").trim(),
  };
}

export function setProfaneFilterConfig(config) {
  const sanitized = sanitizeProfaneFilterConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(PROFANE_FILTER_CONFIG_KEY, payload);
  return getProfaneFilterConfig();
}

export function getCompanionAliasConfig() {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(COMPANION_ALIAS_CONFIG_KEY);
  const parsed = parseJsonObject(row?.value || "") || {};
  return sanitizeCompanionAliasConfig(parsed);
}

export function setCompanionAliasConfig(config) {
  const sanitized = sanitizeCompanionAliasConfig(config);
  const payload = {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  };
  writeAppSetting(COMPANION_ALIAS_CONFIG_KEY, payload);
  return getCompanionAliasConfig();
}
