import db from "../db/db.js";

export const MOOD_HISTORY_LIMIT = 12;

function pair(personalityId, userId) {
  const pid = Number(personalityId);
  const uid = Number(userId);
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(uid) || uid <= 0) {
    return null;
  }
  return { pid, uid };
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

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMoodState(mood) {
  if (!mood || typeof mood !== "object" || Array.isArray(mood)) return {};
  return mood;
}

function rowToMood(row) {
  if (!row) return null;
  const history = parseJson(row.moodHistory, []);
  return {
    personalityId: Number(row.personalityId),
    userId: Number(row.userId),
    moodState: normalizeMoodState(parseJson(row.moodState, {})),
    moodHistory: Array.isArray(history) ? history : [],
    emotionDrift: normalizeMoodState(parseJson(row.emotionDrift, {})),
    updatedAt: String(row.updatedAt || ""),
  };
}

export function getUserMood(personalityId, userId) {
  const ids = pair(personalityId, userId);
  if (!ids) return null;
  const row = db.prepare(`
    SELECT personalityId, userId, moodState, moodHistory, emotionDrift, updatedAt
    FROM personality_user_mood
    WHERE personalityId = ? AND userId = ?
  `).get(ids.pid, ids.uid);
  return rowToMood(row);
}

export function upsertUserMood(personalityId, userId, { moodState, moodHistory, emotionDrift } = {}) {
  const ids = pair(personalityId, userId);
  if (!ids) return null;
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO personality_user_mood (
      personalityId, userId, moodState, moodHistory, emotionDrift, updatedAt
    ) VALUES (
      @personalityId, @userId, @moodState, @moodHistory, @emotionDrift, @updatedAt
    )
    ON CONFLICT(personalityId, userId) DO UPDATE SET
      moodState = excluded.moodState,
      moodHistory = excluded.moodHistory,
      emotionDrift = excluded.emotionDrift,
      updatedAt = excluded.updatedAt
  `).run({
    personalityId: ids.pid,
    userId: ids.uid,
    moodState: JSON.stringify(normalizeMoodState(moodState)),
    moodHistory: JSON.stringify(Array.isArray(moodHistory) ? moodHistory : []),
    emotionDrift: JSON.stringify(normalizeMoodState(emotionDrift)),
    updatedAt,
  });
  return getUserMood(ids.pid, ids.uid);
}

export function getOrCreateUserMood(personalityId, userId, fallbackMood) {
  const existing = getUserMood(personalityId, userId);
  if (existing) return existing;
  return upsertUserMood(personalityId, userId, {
    moodState: normalizeMoodState(fallbackMood),
    moodHistory: [],
    emotionDrift: {},
  });
}

export function appendMoodHistory(history, mood, limit = MOOD_HISTORY_LIMIT) {
  const prior = Array.isArray(history) ? history : [];
  const cap = Number.isInteger(limit) && limit > 0 ? limit : MOOD_HISTORY_LIMIT;
  const point = {
    valence: finite(mood?.valence),
    arousal: finite(mood?.arousal),
    dominance: finite(mood?.dominance),
    at: new Date().toISOString(),
  };
  return [...prior, point].slice(-cap);
}
