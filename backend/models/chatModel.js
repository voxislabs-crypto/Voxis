import db from "../db/db.js";

export function createChatMessage({ personalityId, role, content }) {
  const statement = db.prepare(`
    INSERT INTO chat_messages (personalityId, role, content)
    VALUES (?, ?, ?)
  `);

  const result = statement.run(personalityId, role, content);

  return db
    .prepare(`
      SELECT id, personalityId, role, content, createdAt
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
