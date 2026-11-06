import {
  getUserContextModel,
  queryStoredUserContext,
  saveUserContextModel,
  userContextScopeKey,
} from "../models/userContextModel.js";

const TOPIC_LIMIT = 12;
const PREFERENCE_LIMIT = 16;
const INTENT_LIMIT = 8;
const RAPID_TURN_MS = 20_000;

const PREFERENCE_PATTERNS = [
  { kind: "likes", pattern: /\bi (?:really |just )?(?:like|love|prefer|enjoy)\s+([^,.!?]{2,80})/gi },
  { kind: "dislikes", pattern: /\bi (?:really |just )?(?:hate|dislike|can't stand|dont like|don't like)\s+([^,.!?]{2,80})/gi },
];

export function emptyUserContext() {
  return {
    preferences: [],
    topics: [],
    patterns: {
      turnCount: 0,
      intentCounts: {},
      recentIntents: [],
      valenceSum: 0,
      arousalSum: 0,
      messageLengthSum: 0,
      rapidTurns: 0,
      lastIntent: null,
    },
    timeSignals: {
      lastSeenAt: null,
      previousSeenAt: null,
      gapMs: null,
      hourCounts: {},
    },
  };
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cloneContext(current) {
  const base = current && typeof current === "object" ? current : emptyUserContext();
  const empty = emptyUserContext();
  return {
    preferences: Array.isArray(base.preferences) ? base.preferences.map((item) => ({ ...item })) : [],
    topics: Array.isArray(base.topics) ? base.topics.map((item) => ({ ...item })) : [],
    patterns: {
      ...empty.patterns,
      ...(base.patterns && typeof base.patterns === "object" ? base.patterns : {}),
      intentCounts: { ...(base.patterns?.intentCounts || {}) },
      recentIntents: Array.isArray(base.patterns?.recentIntents) ? [...base.patterns.recentIntents] : [],
    },
    timeSignals: {
      ...empty.timeSignals,
      ...(base.timeSignals && typeof base.timeSignals === "object" ? base.timeSignals : {}),
      hourCounts: { ...(base.timeSignals?.hourCounts || {}) },
    },
  };
}

function cleanPreference(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (text.length < 3 || text.length > 80) return null;
  return text;
}

export function extractStatedPreferences(message, updatedAt) {
  const text = String(message || "");
  const found = [];
  const seen = new Set();
  for (const rule of PREFERENCE_PATTERNS) {
    rule.pattern.lastIndex = 0;
    let match = rule.pattern.exec(text);
    while (match) {
      const preference = cleanPreference(match[1]);
      const key = `${rule.kind}:${preference}`;
      if (preference && !seen.has(key)) {
        seen.add(key);
        found.push({ kind: rule.kind, text: preference, confidence: 0.6, updatedAt });
      }
      match = rule.pattern.exec(text);
    }
  }
  return found;
}

export function normalizeTopicLabel(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (text.length < 2) return null;
  return text.slice(0, 80);
}

export function applyUserTurn(current, { message = "", affect = null, now = new Date() } = {}) {
  const next = cloneContext(current);
  const at = now instanceof Date ? now : new Date(now);
  const iso = Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString();
  const hour = Number.isNaN(at.getTime()) ? null : String(at.getUTCHours());
  const intent = affect?.intent || "unclear";
  const valence = finite(affect?.valence, 0);
  const arousal = finite(affect?.arousal, 0);

  next.patterns.turnCount = finite(next.patterns.turnCount) + 1;
  next.patterns.intentCounts[intent] = finite(next.patterns.intentCounts[intent]) + 1;
  next.patterns.recentIntents = [...next.patterns.recentIntents, intent].slice(-INTENT_LIMIT);
  next.patterns.lastIntent = intent;
  next.patterns.valenceSum = round(finite(next.patterns.valenceSum) + valence);
  next.patterns.arousalSum = round(finite(next.patterns.arousalSum) + arousal);
  next.patterns.messageLengthSum = finite(next.patterns.messageLengthSum) + String(message || "").trim().length;

  const previous = next.timeSignals.lastSeenAt || null;
  let gapMs = null;
  if (previous) {
    const delta = new Date(iso).getTime() - new Date(previous).getTime();
    if (Number.isFinite(delta) && delta >= 0) {
      gapMs = delta;
      if (delta < RAPID_TURN_MS) next.patterns.rapidTurns = finite(next.patterns.rapidTurns) + 1;
    }
  }
  if (hour != null) {
    next.timeSignals.hourCounts[hour] = finite(next.timeSignals.hourCounts[hour]) + 1;
  }
  next.timeSignals.previousSeenAt = previous;
  next.timeSignals.lastSeenAt = iso;
  next.timeSignals.gapMs = gapMs;

  const label = normalizeTopicLabel(affect?.focus);
  if (label) {
    const existing = next.topics.find((topic) => topic.label === label);
    if (existing) {
      existing.count = finite(existing.count) + 1;
      existing.lastSeenAt = iso;
      existing.lastValence = round(valence);
    } else {
      next.topics.push({ label, count: 1, lastSeenAt: iso, lastValence: round(valence) });
    }
    next.topics.sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0)
      || String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
    next.topics = next.topics.slice(0, TOPIC_LIMIT);
  }

  for (const preference of extractStatedPreferences(message, iso)) {
    const index = next.preferences.findIndex((item) => item.kind === preference.kind && item.text === preference.text);
    if (index >= 0) {
      next.preferences[index].confidence = Math.min(0.95, round(finite(next.preferences[index].confidence, 0.6) + 0.1));
      next.preferences[index].updatedAt = iso;
    } else {
      next.preferences.push(preference);
    }
  }
  next.preferences = next.preferences.slice(-PREFERENCE_LIMIT);
  return next;
}

export function recordUserTurn({ personalityId, userId, sessionKey, message, affect, now } = {}) {
  const scopeKey = userContextScopeKey({ userId, sessionKey });
  if (!scopeKey) return null;
  const existing = getUserContextModel(personalityId, scopeKey);
  const next = applyUserTurn(existing, { message, affect, now });
  return saveUserContextModel(personalityId, scopeKey, next);
}

export function queryUserContext({ personalityId, userId, sessionKey, topic, preferenceKind, minTopicCount } = {}) {
  const scopeKey = userContextScopeKey({ userId, sessionKey });
  const record = scopeKey ? getUserContextModel(personalityId, scopeKey) : null;
  return queryStoredUserContext(record, { topic, preferenceKind, minTopicCount });
}
