import db from "../db/db.js";

export function getPersonalityMemory(personalityId, limit = 20) {
  return db
    .prepare(
      `SELECT id, personalityId, memoryType, content, importance, createdAt
       FROM personality_memory
       WHERE personalityId = ?
       ORDER BY importance DESC, id DESC
       LIMIT ?`,
    )
    .all(personalityId, limit);
}

export function upsertMemoryFact(personalityId, content, memoryType = "note", importance = 5) {
  const existing = db
    .prepare(
      `SELECT id, importance FROM personality_memory
       WHERE personalityId = ? AND content = ?`,
    )
    .get(personalityId, content);

  if (existing) {
    if (importance > existing.importance) {
      db.prepare(
        `UPDATE personality_memory
         SET importance = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(importance, existing.id);
    }
    return;
  }

  db.prepare(
    `INSERT INTO personality_memory (personalityId, memoryType, content, importance)
     VALUES (?, ?, ?, ?)`,
  ).run(personalityId, memoryType, content, importance);
}

export function pruneMemory(personalityId, maxEntries = 50) {
  const { count } = db
    .prepare(`SELECT COUNT(*) AS count FROM personality_memory WHERE personalityId = ?`)
    .get(personalityId);

  if (count > maxEntries) {
    // Anchor facts (importance >= 9) are never pruned — only regular facts compete for slots.
    db.prepare(
      `DELETE FROM personality_memory
       WHERE personalityId = ? AND importance < 9 AND id NOT IN (
         SELECT id FROM personality_memory
         WHERE personalityId = ? AND importance < 9
         ORDER BY importance DESC, id DESC
         LIMIT ?
       )`,
    ).run(personalityId, personalityId, maxEntries);
  }
}

export function clearPersonalityMemory(personalityId) {
  db.prepare(`DELETE FROM personality_memory WHERE personalityId = ?`).run(personalityId);
}
