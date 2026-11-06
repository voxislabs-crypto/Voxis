import db from "../db/db.js";

function pair(personalityId, scopeKey) {
  const pid = Number(personalityId);
  const scope = String(scopeKey || "").trim();
  if (!Number.isInteger(pid) || pid <= 0 || !scope) return null;
  return { pid, scope };
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function rowToModel(row) {
  if (!row) return null;
  return {
    personalityId: Number(row.personalityId),
    scopeKey: String(row.scopeKey || ""),
    preferences: asArray(parseJson(row.preferences, [])),
    topics: asArray(parseJson(row.topics, [])),
    patterns: asObject(parseJson(row.patterns, {})),
    timeSignals: asObject(parseJson(row.timeSignals, {})),
    createdAt: String(row.createdAt || ""),
    updatedAt: String(row.updatedAt || ""),
  };
}

export function userContextScopeKey({ userId, sessionKey } = {}) {
  const uid = Number(userId);
  if (Number.isInteger(uid) && uid > 0) return `user:${uid}`;
  const session = String(sessionKey || "").trim();
  return session ? `session:${session}` : null;
}

export function getUserContextModel(personalityId, scopeKey) {
  const ids = pair(personalityId, scopeKey);
  if (!ids) return null;
  const row = db.prepare(`
    SELECT personalityId, scopeKey, preferences, topics, patterns, timeSignals, createdAt, updatedAt
    FROM user_context_models
    WHERE personalityId = ? AND scopeKey = ?
  `).get(ids.pid, ids.scope);
  return rowToModel(row);
}

export function saveUserContextModel(personalityId, scopeKey, record = {}) {
  const ids = pair(personalityId, scopeKey);
  if (!ids) return null;
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO user_context_models (
      personalityId, scopeKey, preferences, topics, patterns, timeSignals, updatedAt
    ) VALUES (
      @personalityId, @scopeKey, @preferences, @topics, @patterns, @timeSignals, @updatedAt
    )
    ON CONFLICT(personalityId, scopeKey) DO UPDATE SET
      preferences = excluded.preferences,
      topics = excluded.topics,
      patterns = excluded.patterns,
      timeSignals = excluded.timeSignals,
      updatedAt = excluded.updatedAt
  `).run({
    personalityId: ids.pid,
    scopeKey: ids.scope,
    preferences: JSON.stringify(asArray(record.preferences)),
    topics: JSON.stringify(asArray(record.topics)),
    patterns: JSON.stringify(asObject(record.patterns)),
    timeSignals: JSON.stringify(asObject(record.timeSignals)),
    updatedAt,
  });
  return getUserContextModel(ids.pid, ids.scope);
}

export function queryStoredUserContext(record, { topic, preferenceKind, minTopicCount = 1 } = {}) {
  if (!record) {
    return { preferences: [], topics: [], patterns: {}, timeSignals: {} };
  }
  const needle = String(topic || "").trim().toLowerCase();
  const minimum = Number.isFinite(Number(minTopicCount)) ? Number(minTopicCount) : 1;
  return {
    preferences: record.preferences.filter((item) => !preferenceKind || item.kind === preferenceKind),
    topics: record.topics.filter((item) => {
      const count = Number(item?.count) || 0;
      if (count < minimum) return false;
      if (!needle) return true;
      return String(item?.label || "").toLowerCase().includes(needle);
    }),
    patterns: record.patterns,
    timeSignals: record.timeSignals,
  };
}
