import db from "../db/db.js";
import {
  generateEmbedding,
  getEmbeddingModelName,
  isEmbeddingConfigured,
} from "../services/llmService.js";

function parseEmbedding(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item))
      : [];
  } catch {
    return [];
  }
}

function normalizeMemoryRow(row) {
  if (!row) {
    return null;
  }

  const embedding = parseEmbedding(row.embedding);
  return {
    ...row,
    embedding,
    hasEmbedding: embedding.length > 0,
  };
}

function stripEmbedding(row) {
  if (!row) {
    return null;
  }

  const { embedding, hasEmbedding, embeddingModel, ...memory } = row;
  return memory;
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) || [],
  );
}

function lexicalSimilarity(query, content) {
  const queryTokens = tokenize(query);
  const contentTokens = tokenize(content);
  if (queryTokens.size === 0 || contentTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(queryTokens.size, contentTokens.size);
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
    return null;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return null;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function listUserMemoryRows(userId) {
  return db
    .prepare(
      `SELECT id, userId, memoryType, content, importance, embedding, embeddingModel, createdAt, updatedAt
       FROM user_memory
       WHERE userId = ?
       ORDER BY importance DESC, id DESC`,
    )
    .all(userId)
    .map(normalizeMemoryRow);
}

function getScoredMemory(memory, query, queryEmbedding) {
  const semanticScore = queryEmbedding ? cosineSimilarity(queryEmbedding, memory.embedding) : null;
  const lexicalScore = lexicalSimilarity(query, memory.content);
  const importanceScore = Math.min(1, Math.max(0, Number(memory.importance || 0) / 10));

  if (semanticScore !== null) {
    return semanticScore * 0.75 + lexicalScore * 0.15 + importanceScore * 0.1;
  }

  return lexicalScore * 0.65 + importanceScore * 0.35;
}

function persistEmbeddingForMemory(id, embedding, embeddingModel = getEmbeddingModelName()) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return;
  }

  db.prepare(
    `UPDATE user_memory
     SET embedding = ?, embeddingModel = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(JSON.stringify(embedding), embeddingModel || "", id);
}

export function getAllUserMemory(userId) {
  return listUserMemoryRows(userId).map(stripEmbedding);
}

export async function getRelevantUserMemory(userId, query, limit = 4) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return getAllUserMemory(userId).slice(0, limit);
  }

  const memories = listUserMemoryRows(userId);
  if (!memories.length) {
    return [];
  }

  const anchors = memories
    .filter((memory) => memory.importance >= 9)
    .slice(0, 2)
    .map(stripEmbedding);

  let queryEmbedding = null;
  if (isEmbeddingConfigured()) {
    try {
      queryEmbedding = await generateEmbedding(normalizedQuery);
    } catch {
      queryEmbedding = null;
    }
  }

  const ranked = memories
    .filter((memory) => memory.importance < 9)
    .map((memory) => ({
      memory,
      score: getScoredMemory(memory, normalizedQuery, queryEmbedding),
    }))
    .sort((left, right) => right.score - left.score || right.memory.importance - left.memory.importance)
    .slice(0, limit)
    .map(({ memory }) => stripEmbedding(memory));

  return [...anchors, ...ranked];
}

export function upsertUserMemory(userId, content, memoryType = "preference", importance = 5) {
  const normalizedContent = String(content || "").trim();
  if (!normalizedContent) {
    return null;
  }

  const existing = db
    .prepare(
      `SELECT id, importance
       FROM user_memory
       WHERE userId = ? AND content = ?`,
    )
    .get(userId, normalizedContent);

  if (existing) {
    if (importance > existing.importance) {
      db.prepare(
        `UPDATE user_memory
         SET importance = ?, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(importance, existing.id);
    }

    return existing.id;
  }

  const result = db.prepare(
    `INSERT INTO user_memory (userId, memoryType, content, importance)
     VALUES (?, ?, ?, ?)`,
  ).run(userId, memoryType, normalizedContent, importance);

  return Number(result.lastInsertRowid);
}

export async function upsertUserMemoryWithEmbedding(userId, content, memoryType = "preference", importance = 5) {
  const memoryId = upsertUserMemory(userId, content, memoryType, importance);
  if (!memoryId || !isEmbeddingConfigured()) {
    return memoryId;
  }

  try {
    const embedding = await generateEmbedding(content);
    persistEmbeddingForMemory(memoryId, embedding);
  } catch {
    // Additive enhancement only.
  }

  return memoryId;
}

export function updateUserMemory(memoryId, { content, memoryType, importance }) {
  db.prepare(
    `UPDATE user_memory
     SET content = ?, memoryType = ?, importance = ?, embedding = '', embeddingModel = '', updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(content, memoryType, importance, memoryId);

  return stripEmbedding(normalizeMemoryRow(db.prepare(`SELECT * FROM user_memory WHERE id = ?`).get(memoryId)));
}

export function deleteUserMemory(memoryId, userId) {
  db.prepare(`DELETE FROM user_memory WHERE id = ? AND userId = ?`).run(memoryId, userId);
}
