import db from "../db/db.js";

const LLM_CONFIG_KEY = "llm_config";

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

  db.prepare(
    `INSERT INTO app_settings (key, value, updatedAt)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = CURRENT_TIMESTAMP`,
  ).run(LLM_CONFIG_KEY, JSON.stringify(normalized));

  return getLlmRuntimeConfig();
}

export function clearLlmRuntimeConfig() {
  db.prepare(`DELETE FROM app_settings WHERE key = ?`).run(LLM_CONFIG_KEY);
}
