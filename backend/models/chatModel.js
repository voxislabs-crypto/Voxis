import db from "../db/db.js";

export function createChatMessage({ personalityId, role, content, userId = null, mode = "" }) {
  const statement = db.prepare(`
    INSERT INTO chat_messages (personalityId, role, content, userId, mode)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = statement.run(personalityId, role, content, userId, mode);

  return db
    .prepare(`
      SELECT id, personalityId, role, content, userId, mode, createdAt
      FROM chat_messages
      WHERE id = ?
    `)
    .get(result.lastInsertRowid);
}

export function getRecentChatMessages(personalityId, limit = 10) {
  const statement = db.prepare(`
    SELECT id, personalityId, role, content, createdAt
    FROM chat_messages
    WHERE personalityId = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  return statement.all(personalityId, limit).reverse();
}

export function getChatMessages(personalityId, limit = 50) {
  const statement = db.prepare(`
    SELECT id, personalityId, role, content, createdAt
    FROM chat_messages
    WHERE personalityId = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  return statement.all(personalityId, limit).reverse();
}

export function getChatMessageCount(personalityId) {
  return db
    .prepare(`SELECT COUNT(*) AS count FROM chat_messages WHERE personalityId = ?`)
    .get(personalityId).count;
}

export function getLatestModeForUserPersonality(userId, personalityId) {
  if (!Number.isInteger(Number(userId))) {
    return null;
  }

  const row = db
    .prepare(
      `SELECT mode
       FROM chat_messages
       WHERE userId = ? AND personalityId = ? AND mode != ''
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get(userId, personalityId);

  return row?.mode || null;
}
