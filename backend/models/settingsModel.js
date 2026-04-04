import db from "../db/db.js";

const LLM_CONFIG_KEY = "llm_config";
const LLM_SAVED_CREDENTIALS_KEY = "llm_saved_credentials";

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

  return savedCredentials.find(
    (credential) => credential.provider === target.provider && credential.baseUrl === "",
  ) || null;
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
