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

function getScoredMemory(memory, query, queryEmbedding) {
  const semanticScore = queryEmbedding ? cosineSimilarity(queryEmbedding, memory.embedding) : null;
  const lexicalScore = lexicalSimilarity(query, memory.content);
  const importanceScore = Math.min(1, Math.max(0, Number(memory.importance || 0) / 10));

  if (semanticScore !== null) {
    return semanticScore * 0.75 + lexicalScore * 0.15 + importanceScore * 0.1;
  }

  return lexicalScore * 0.65 + importanceScore * 0.35;
}

function listPersonalityMemoryRows(personalityId) {
  return db
    .prepare(
      `SELECT id, personalityId, memoryType, content, importance, createdAt, updatedAt, embedding, embeddingModel
       FROM personality_memory
       WHERE personalityId = ?
       ORDER BY importance DESC, id DESC`,
    )
    .all(personalityId)
    .map(normalizeMemoryRow);
}

function persistEmbeddingForMemory(id, embedding, embeddingModel = getEmbeddingModelName()) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return;
  }

  db.prepare(
    `UPDATE personality_memory
     SET embedding = ?, embeddingModel = ?, updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(JSON.stringify(embedding), embeddingModel || "", id);
}

function getMissingMemoryEmbeddingCount(personalityId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM personality_memory
       WHERE personalityId = ? AND (embedding = '' OR embedding IS NULL)`,
    )
    .get(personalityId).count;
}

function getPersonalityIdsWithMemory() {
  return db
    .prepare(
      `SELECT DISTINCT personalityId
       FROM personality_memory
       ORDER BY personalityId ASC`,
    )
    .all()
    .map((row) => row.personalityId);
}

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

export async function getRelevantPersonalityMemory(personalityId, query, limit = 5) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return getPersonalityMemory(personalityId, limit);
  }

  const memories = listPersonalityMemoryRows(personalityId);
  if (memories.length === 0) {
    return [];
  }

  const anchorFacts = memories
    .filter((memory) => memory.importance >= 9)
    .sort((left, right) => right.importance - left.importance || right.id - left.id)
    .map(stripEmbedding);

  let queryEmbedding = null;
  if (isEmbeddingConfigured()) {
    try {
      queryEmbedding = await generateEmbedding(normalizedQuery);
    } catch {
      queryEmbedding = null;
    }
  }

  const rankedFacts = memories
    .filter((memory) => memory.importance < 9)
    .map((memory) => ({
      memory,
      score: getScoredMemory(memory, normalizedQuery, queryEmbedding),
    }))
    .sort((left, right) => right.score - left.score || right.memory.importance - left.memory.importance || right.memory.id - left.memory.id)
    .slice(0, limit)
    .map(({ memory }) => stripEmbedding(memory));

  return [...anchorFacts, ...rankedFacts];
}

export function upsertMemoryFact(personalityId, content, memoryType = "note", importance = 5) {
  const existing = db
    .prepare(
      `SELECT id, importance, embedding, embeddingModel FROM personality_memory
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

    return existing.id;
  }

  const result = db.prepare(
    `INSERT INTO personality_memory (personalityId, memoryType, content, importance)
     VALUES (?, ?, ?, ?)`,
  ).run(personalityId, memoryType, content, importance);

  return result.lastInsertRowid;
}

export async function upsertMemoryFactWithEmbedding(
  personalityId,
  content,
  memoryType = "note",
  importance = 5,
) {
  const memoryId = upsertMemoryFact(personalityId, content, memoryType, importance);
  if (!memoryId || !isEmbeddingConfigured()) {
    return memoryId;
  }

  try {
    const embedding = await generateEmbedding(content);
    persistEmbeddingForMemory(memoryId, embedding);
  } catch {
    // Semantic memory is additive. Retrieval falls back if embeddings fail.
  }

  return memoryId;
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

export function updateMemoryFact(id, { content, memoryType, importance }) {
  db.prepare(
    `UPDATE personality_memory
     SET content = ?, memoryType = ?, importance = ?, embedding = '', embeddingModel = '', updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(content, memoryType, importance, id);
  return stripEmbedding(
    normalizeMemoryRow(db.prepare(`SELECT * FROM personality_memory WHERE id = ?`).get(id)),
  );
}

export async function refreshMemoryEmbedding(id) {
  if (!isEmbeddingConfigured()) {
    return;
  }

  const memory = normalizeMemoryRow(
    db.prepare(`SELECT id, content, embedding, embeddingModel FROM personality_memory WHERE id = ?`).get(id),
  );

  if (!memory || !memory.content) {
    return;
  }

  try {
    const embedding = await generateEmbedding(memory.content);
    persistEmbeddingForMemory(id, embedding);
  } catch {
    // Best-effort refresh only.
  }
}

export async function backfillMissingMemoryEmbeddings(personalityId, limit = 10) {
  if (!isEmbeddingConfigured()) {
    return {
      personalityId,
      attempted: 0,
      completed: 0,
      remaining: getMissingMemoryEmbeddingCount(personalityId),
      configured: false,
    };
  }

  const memories = db
    .prepare(
      `SELECT id, content
       FROM personality_memory
       WHERE personalityId = ? AND (embedding = '' OR embedding IS NULL)
       ORDER BY importance DESC, id DESC
       LIMIT ?`,
    )
    .all(personalityId, limit);

  let completed = 0;

  for (const memory of memories) {
    const before = normalizeMemoryRow(
      db.prepare(`SELECT id, content, embedding, embeddingModel FROM personality_memory WHERE id = ?`).get(
        memory.id,
      ),
    );

    await refreshMemoryEmbedding(memory.id);

    const after = normalizeMemoryRow(
      db.prepare(`SELECT id, content, embedding, embeddingModel FROM personality_memory WHERE id = ?`).get(
        memory.id,
      ),
    );

    if ((!before || !before.hasEmbedding) && after?.hasEmbedding) {
      completed += 1;
    }
  }

  return {
    personalityId,
    attempted: memories.length,
    completed,
    remaining: getMissingMemoryEmbeddingCount(personalityId),
    configured: true,
  };
}

export async function backfillAllMissingMemoryEmbeddings(limitPerPersonality = 100) {
  const personalityIds = getPersonalityIdsWithMemory();
  const results = [];

  for (const personalityId of personalityIds) {
    results.push(await backfillMissingMemoryEmbeddings(personalityId, limitPerPersonality));
  }

  return {
    configured: isEmbeddingConfigured(),
    processedPersonalities: results.length,
    attempted: results.reduce((total, result) => total + result.attempted, 0),
    completed: results.reduce((total, result) => total + result.completed, 0),
    remaining: results.reduce((total, result) => total + result.remaining, 0),
    results,
  };
}

export function deleteMemoryFact(id) {
  db.prepare(`DELETE FROM personality_memory WHERE id = ?`).run(id);
}

// Fetch all facts for a personality (no limit — for journal view)
export function getAllPersonalityMemory(personalityId) {
  return listPersonalityMemoryRows(personalityId).map(stripEmbedding);
}

export function clearPersonalityMemory(personalityId) {
  db.prepare(`DELETE FROM personality_memory WHERE personalityId = ?`).run(personalityId);
}
