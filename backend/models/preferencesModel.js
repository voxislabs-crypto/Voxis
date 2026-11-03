// ---------------------------------------------------------------------------
// Persona Preference Memory Model
//
// Each persona maintains a persistent table of emotional preferences:
//   - What they love / like / find exciting
//   - What they hate / dislike / find annoying / offending / boring
//
// These preferences are matched against user messages each turn and feed a
// dedicated VAD delta into the mood engine, ensuring that villains stay angry
// when their triggers are hit and warm characters genuinely light up over their
// favorite topics.
// ---------------------------------------------------------------------------

import db from "../db/db.js";

// Valid preference type values.
export const PREF_TYPES = new Set([
  "loves",
  "likes",
  "excites",
  "hates",
  "dislikes",
  "annoys",
  "offends",
  "bores",
]);

// Positive vs negative classification maps.
export const POSITIVE_PREF_TYPES = new Set(["loves", "likes", "excites"]);
export const NEGATIVE_PREF_TYPES = new Set(["hates", "dislikes", "annoys", "offends", "bores"]);

// Maximum number of preference entries to retain per persona.
const PREFS_MAX = 80;

function normalizeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    personalityId: row.personalityId,
    prefType: row.prefType,
    content: row.content,
    importance: row.importance,
    source: row.source,
    triggerCount: Number(row.triggerCount || 0),
    lastTriggeredAt: row.lastTriggeredAt || "",
    updatedAt: row.updatedAt || row.createdAt,
    createdAt: row.createdAt,
  };
}

function tokenize(text) {
  return (String(text || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []);
}

function lexicalOverlapScore(a, b) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (!aTokens.size || !bTokens.size) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return (2 * overlap) / (aTokens.size + bTokens.size);
}

function isPositiveType(type) {
  return POSITIVE_PREF_TYPES.has(type);
}

function isNegativeType(type) {
  return NEGATIVE_PREF_TYPES.has(type);
}

function isConflictingTypePair(a, b) {
  return (isPositiveType(a) && isNegativeType(b)) || (isNegativeType(a) && isPositiveType(b));
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getPersonaPreferences(personalityId) {
  return db
    .prepare(
      `SELECT id, personalityId, prefType, content, importance, source, createdAt, updatedAt, lastTriggeredAt, triggerCount
       FROM persona_preferences
       WHERE personalityId = ?
       ORDER BY importance DESC, id DESC`,
    )
    .all(personalityId)
    .map(normalizeRow);
}

export function getPersonaPreferencesByType(personalityId, prefType) {
  return db
    .prepare(
      `SELECT id, personalityId, prefType, content, importance, source, createdAt, updatedAt, lastTriggeredAt, triggerCount
       FROM persona_preferences
       WHERE personalityId = ? AND prefType = ?
       ORDER BY importance DESC, id DESC`,
    )
    .all(personalityId, prefType)
    .map(normalizeRow);
}

// ---------------------------------------------------------------------------
// Write — upsert by (personalityId + content) to avoid duplicates.
// If the same content already exists, raise importance if the new value is higher.
// ---------------------------------------------------------------------------

export function upsertPersonaPreference(
  personalityId,
  prefType,
  content,
  importance = 7,
  source = "learned",
) {
  const normalizedContent = String(content || "").trim().slice(0, 300);
  if (!normalizedContent) return null;

  const safePrefType = PREF_TYPES.has(prefType) ? prefType : "likes";
  const safeImportance = Math.min(10, Math.max(1, Number(importance) || 7));

  const existing = db
    .prepare(
      `SELECT id, importance, prefType
       FROM persona_preferences
       WHERE personalityId = ? AND content = ?`,
    )
    .get(personalityId, normalizedContent);

  if (existing) {
    // Update prefType + importance if either changed to something higher-priority.
    const shouldUpdate =
      safeImportance > existing.importance || existing.prefType !== safePrefType;
    if (shouldUpdate) {
      db.prepare(
        `UPDATE persona_preferences
         SET prefType = ?, importance = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(safePrefType, Math.max(safeImportance, existing.importance), existing.id);
    } else {
      db.prepare(
        `UPDATE persona_preferences
         SET updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(existing.id);
    }
    return existing.id;
  }

  // Conflict/merge pass: if content is lexically very similar, prefer a single
  // canonical row and resolve type conflicts using weighted importance.
  const similar = db
    .prepare(
      `SELECT id, prefType, importance, content
       FROM persona_preferences
       WHERE personalityId = ?
       ORDER BY importance DESC, id DESC`,
    )
    .all(personalityId)
    .map((row) => ({ ...row, score: lexicalOverlapScore(row.content, normalizedContent) }))
    .filter((row) => row.score >= 0.62)
    .sort((left, right) => right.score - left.score || right.importance - left.importance);

  const bestSimilar = similar[0];
  if (bestSimilar) {
    const mergedImportance = Math.min(10, Math.max(safeImportance, Number(bestSimilar.importance) || 7));
    if (isConflictingTypePair(bestSimilar.prefType, safePrefType)) {
      if (safeImportance >= Number(bestSimilar.importance || 0)) {
        db.prepare(
          `UPDATE persona_preferences
           SET prefType = ?, importance = ?, content = ?, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(safePrefType, mergedImportance, normalizedContent, bestSimilar.id);
      } else {
        db.prepare(
          `UPDATE persona_preferences
           SET importance = ?, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(mergedImportance, bestSimilar.id);
      }
      return bestSimilar.id;
    }

    db.prepare(
      `UPDATE persona_preferences
       SET importance = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(mergedImportance, bestSimilar.id);
    return bestSimilar.id;
  }

  const result = db
    .prepare(
      `INSERT INTO persona_preferences (personalityId, prefType, content, importance, source, triggerCount, lastTriggeredAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 0, '', CURRENT_TIMESTAMP)`,
    )
    .run(personalityId, safePrefType, normalizedContent, safeImportance, source || "learned");

  return result.lastInsertRowid;
}

// ---------------------------------------------------------------------------
// Prune — keep only the top-N most important preferences per persona.
// ---------------------------------------------------------------------------

export function prunePersonaPreferences(personalityId, max = PREFS_MAX) {
  const ids = db
    .prepare(
      `SELECT id FROM persona_preferences
       WHERE personalityId = ?
       ORDER BY importance DESC, id DESC
       LIMIT -1 OFFSET ?`,
    )
    .all(personalityId, max)
    .map((row) => row.id);

  if (ids.length === 0) return;

  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM persona_preferences WHERE id IN (${placeholders})`,
  ).run(...ids);
}

export function reinforcePersonaPreferences(preferenceIds = [], step = 1) {
  const ids = Array.isArray(preferenceIds)
    ? [...new Set(preferenceIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (!ids.length) return 0;

  const placeholders = ids.map(() => "?").join(",");
  const safeStep = Math.max(1, Math.min(2, Number(step) || 1));
  const result = db.prepare(
    `UPDATE persona_preferences
     SET importance = MIN(10, importance + ?),
         triggerCount = COALESCE(triggerCount, 0) + 1,
         lastTriggeredAt = CURRENT_TIMESTAMP,
         updatedAt = CURRENT_TIMESTAMP
     WHERE id IN (${placeholders})`,
  ).run(safeStep, ...ids);
  return Number(result.changes || 0);
}

export function decayPersonaPreferences(personalityId, {
  idleDays = 14,
  minImportance = 4,
  decayStep = 1,
} = {}) {
  const safeDays = Math.max(3, Math.min(90, Number(idleDays) || 14));
  const safeMin = Math.max(1, Math.min(9, Number(minImportance) || 4));
  const safeStep = Math.max(1, Math.min(2, Number(decayStep) || 1));
  const cutoff = `-${safeDays} days`;

  const result = db.prepare(
    `UPDATE persona_preferences
     SET importance = MAX(?, importance - ?),
         updatedAt = CURRENT_TIMESTAMP
     WHERE personalityId = ?
       AND importance > ?
       AND (
         (lastTriggeredAt IS NOT NULL AND lastTriggeredAt != '' AND datetime(lastTriggeredAt) <= datetime('now', ?))
         OR
         ((lastTriggeredAt IS NULL OR lastTriggeredAt = '') AND datetime(createdAt) <= datetime('now', ?))
       )`,
  ).run(safeMin, safeStep, personalityId, safeMin, cutoff, cutoff);

  return Number(result.changes || 0);
}

// ---------------------------------------------------------------------------
// Delete / Update — for manual management via API
// ---------------------------------------------------------------------------

export function updatePersonaPreference(id, { prefType, content, importance }) {
  const safePrefType = PREF_TYPES.has(prefType) ? prefType : undefined;
  const row = db
    .prepare(`SELECT id FROM persona_preferences WHERE id = ?`)
    .get(id);
  if (!row) return null;

  const updates = [];
  const params = [];

  if (safePrefType) {
    updates.push("prefType = ?");
    params.push(safePrefType);
  }
  if (content && typeof content === "string" && content.trim()) {
    updates.push("content = ?");
    params.push(content.trim().slice(0, 300));
  }
  if (importance !== undefined) {
    updates.push("importance = ?");
    params.push(Math.min(10, Math.max(1, Number(importance) || 7)));
  }

  if (updates.length === 0) return null;

  params.push(id);
  db.prepare(
    `UPDATE persona_preferences SET ${updates.join(", ")} WHERE id = ?`,
  ).run(...params);

  return db
    .prepare(`SELECT id, personalityId, prefType, content, importance, source, createdAt, updatedAt, lastTriggeredAt, triggerCount FROM persona_preferences WHERE id = ?`)
    .get(id);
}

export function getPersonaPreferenceById(id) {
  const preferenceId = Number(id);
  if (!Number.isInteger(preferenceId) || preferenceId <= 0) return null;
  return normalizeRow(
    db.prepare(
      `SELECT id, personalityId, prefType, content, importance, source, createdAt, updatedAt, lastTriggeredAt, triggerCount
       FROM persona_preferences WHERE id = ?`,
    ).get(preferenceId),
  );
}

export function deletePersonaPreference(id) {
  db.prepare(`DELETE FROM persona_preferences WHERE id = ?`).run(id);
}
