import db from "../db/db.js";
import {
  generateEmbedding,
  getEmbeddingModelName,
  isEmbeddingConfigured,
} from "../services/llmService.js";

// ---------------------------------------------------------------------------
// Embedding helpers (mirrors the pattern in memoryModel.js)
// ---------------------------------------------------------------------------

function parseEmbedding(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : [];
  } catch {
    return [];
  }
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
    return null;
  }
  let dot = 0;
  let lMag = 0;
  let rMag = 0;
  for (let i = 0; i < left.length; i++) {
    dot += left[i] * right[i];
    lMag += left[i] * left[i];
    rMag += right[i] * right[i];
  }
  if (lMag === 0 || rMag === 0) return null;
  return dot / (Math.sqrt(lMag) * Math.sqrt(rMag));
}

function lexicalSimilarity(query, content) {
  const tokenize = (t) => new Set(String(t || "").toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const qTokens = tokenize(query);
  const cTokens = tokenize(content);
  if (qTokens.size === 0 || cTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of qTokens) { if (cTokens.has(t)) overlap++; }
  return overlap / Math.max(qTokens.size, cTokens.size);
}

function scoreChatMessage(msg, query, queryEmbedding) {
  const semScore = queryEmbedding ? cosineSimilarity(queryEmbedding, msg.embedding) : null;
  const lexScore = lexicalSimilarity(query, msg.content);
  if (semScore !== null) return semScore * 0.8 + lexScore * 0.2;
  return lexScore;
}

function updateChatMessageEmbedding(id, embedding, embeddingModel = "") {
  if (!Array.isArray(embedding) || embedding.length === 0) return;
  db.prepare(
    `UPDATE chat_messages SET embedding = ?, embeddingModel = ? WHERE id = ?`,
  ).run(JSON.stringify(embedding), embeddingModel || "", id);
}

/**
 * Best-effort: generate and persist an embedding for a stored chat message.
 * Safe to fire-and-forget; never throws.
 */
export async function embedChatMessageAsync(id, content) {
  if (!isEmbeddingConfigured()) return;
  try {
    const embedding = await generateEmbedding(String(content || "").trim());
    if (Array.isArray(embedding) && embedding.length > 0) {
      updateChatMessageEmbedding(id, embedding, getEmbeddingModelName());
    }
  } catch {
    // Best-effort — missing embeddings fall back to lexical search.
  }
}

/**
 * Semantic (or lexical-fallback) search over raw user-turn chat history.
 * Returns the top `limit` turns most relevant to `query`, each paired with
 * the immediately following assistant reply for context.
 *
 * Only triggered for temporal / recall / personal queries (see isPersonalQuery
 * in chatController.js) — not on every turn.
 */
export async function searchRawChatHistory(personalityId, query, limit = 3) {
  const rows = db
    .prepare(
      `SELECT id, content, createdAt, embedding
       FROM chat_messages
       WHERE personalityId = ? AND role = 'user'
         AND embedding != '' AND embedding IS NOT NULL
       ORDER BY id DESC
       LIMIT 200`,
    )
    .all(personalityId);

  if (rows.length === 0) return [];

  const parsed = rows.map((row) => ({ ...row, embedding: parseEmbedding(row.embedding) }));

  let queryEmbedding = null;
  if (isEmbeddingConfigured()) {
    try { queryEmbedding = await generateEmbedding(String(query || "").trim()); } catch { /* fallback */ }
  }

  const topN = parsed
    .map((msg) => ({ msg, score: scoreChatMessage(msg, query, queryEmbedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ msg }) => msg);

  return topN.map((msg) => {
    const assistantRow = db
      .prepare(
        `SELECT content FROM chat_messages
         WHERE personalityId = ? AND role = 'assistant' AND id > ?
         ORDER BY id ASC LIMIT 1`,
      )
      .get(personalityId, msg.id);

    return {
      id: msg.id,
      content: msg.content,
      createdAt: msg.createdAt,
      assistantReply: assistantRow?.content || null,
    };
  });
}

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
