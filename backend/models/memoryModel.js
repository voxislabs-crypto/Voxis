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

function isMemoryEnabled(memory) {
  return Number(memory?.enabled ?? 1) !== 0;
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) || [],
  );
}

const INDEX_PLACEHOLDER = "*";
const MAX_INDEX_HITS = 40;
const MAX_TOPIC_TOKENS = 32;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NORMAL_HALF_LIFE_DAYS = 30;
const ANCHOR_HALF_LIFE_DAYS = 300;
const ANCHOR_IMPORTANCE = 9;
const RECENCY_WINDOW_DAYS = 7;
const RECENCY_LIFT = 1.15;
const MMR_LAMBDA = 0.7;
const PRUNE_KEEP = 50;

let deleteKeywordsStmt;
let insertKeywordStmt;

function keywordStatements() {
  deleteKeywordsStmt ||= db.prepare(`DELETE FROM memory_keyword_index WHERE memoryId = ?`);
  insertKeywordStmt ||= db.prepare(
    `INSERT OR IGNORE INTO memory_keyword_index (keyword, memoryId, personalityId) VALUES (?, ?, ?)`,
  );
  return { deleteKeywordsStmt, insertKeywordStmt };
}

function memoryKeywords(content, memoryType) {
  const tokens = tokenize(`${content || ""} ${memoryType || ""}`);
  if (tokens.size === 0) tokens.add(INDEX_PLACEHOLDER);
  return tokens;
}

function indexMemoryKeywords(memoryId, personalityId, content, memoryType) {
  const { deleteKeywordsStmt: remove, insertKeywordStmt: insert } = keywordStatements();
  remove.run(memoryId);
  for (const keyword of memoryKeywords(content, memoryType)) {
    insert.run(keyword, memoryId, personalityId);
  }
}

function deleteMemoryKeywords(memoryId) {
  keywordStatements().deleteKeywordsStmt.run(memoryId);
}

function deletePersonalityKeywords(personalityId) {
  db.prepare(`DELETE FROM memory_keyword_index WHERE personalityId = ?`).run(personalityId);
}

function deleteOrphanKeywords(personalityId) {
  db.prepare(
    `DELETE FROM memory_keyword_index
     WHERE personalityId = ?
       AND memoryId NOT IN (
         SELECT id FROM personality_memory WHERE personalityId = ?
       )`,
  ).run(personalityId, personalityId);
}

function hasUnindexedMemories(personalityId) {
  return Boolean(
    db.prepare(
      `SELECT 1 AS ok
       FROM personality_memory m
       WHERE m.personalityId = ?
         AND NOT EXISTS (
           SELECT 1 FROM memory_keyword_index i WHERE i.memoryId = m.id
         )
       LIMIT 1`,
    ).get(personalityId),
  );
}

export function backfillPersonalityKeywordIndex(personalityId) {
  const rows = db
    .prepare(
      `SELECT id, personalityId, memoryType, content
       FROM personality_memory m
       WHERE personalityId = ?
         AND NOT EXISTS (
           SELECT 1 FROM memory_keyword_index i WHERE i.memoryId = m.id
         )`,
    )
    .all(personalityId);

  if (!rows.length) return 0;

  const { deleteKeywordsStmt: remove, insertKeywordStmt: insert } = keywordStatements();
  const write = db.transaction((items) => {
    for (const row of items) {
      remove.run(row.id);
      for (const keyword of memoryKeywords(row.content, row.memoryType)) {
        insert.run(keyword, row.id, row.personalityId);
      }
    }
  });
  write(rows);
  return rows.length;
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

function timestampMs(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
  }
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  const ms = Date.parse(withZone);
  return Number.isFinite(ms) ? ms : null;
}

function ageDays(fromMs, nowMs) {
  if (!Number.isFinite(fromMs)) return 0;
  return Math.max(0, (nowMs - fromMs) / MS_PER_DAY);
}

function temporalDecay(memory, nowMs) {
  const created = timestampMs(memory?.createdAt);
  const halfLife = Number(memory?.importance) >= ANCHOR_IMPORTANCE
    ? ANCHOR_HALF_LIFE_DAYS
    : NORMAL_HALF_LIFE_DAYS;
  const decay = 0.5 ** (ageDays(created, nowMs) / halfLife);
  const accessed = timestampMs(memory?.lastAccessedAt);
  const touchedRecently = accessed != null && ageDays(accessed, nowMs) <= RECENCY_WINDOW_DAYS;
  return decay * (touchedRecently ? RECENCY_LIFT : 1);
}

function contentSimilarity(left, right) {
  const leftEmbedding = left?.embedding;
  const rightEmbedding = right?.embedding;
  if (
    Array.isArray(leftEmbedding) && leftEmbedding.length > 0
    && Array.isArray(rightEmbedding) && rightEmbedding.length === leftEmbedding.length
  ) {
    const cosine = cosineSimilarity(leftEmbedding, rightEmbedding);
    if (cosine !== null) return Math.max(0, cosine);
  }
  return lexicalSimilarity(left?.content, right?.content);
}

function selectWithMmr(scored, limit) {
  const pool = [...scored].sort(
    (left, right) => right.score - left.score || right.memory.id - left.memory.id,
  );
  const selected = [];
  const slots = Math.max(0, Number(limit) || 0);

  while (selected.length < slots && pool.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index += 1) {
      let redundancy = 0;
      for (const chosen of selected) {
        redundancy = Math.max(redundancy, contentSimilarity(pool[index].memory, chosen.memory));
      }
      const mmr = selected.length === 0
        ? pool[index].score
        : (MMR_LAMBDA * pool[index].score) - ((1 - MMR_LAMBDA) * redundancy);
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIndex = index;
      }
    }
    selected.push(pool.splice(bestIndex, 1)[0]);
  }

  return selected;
}

function stampMemoryAccess(ids) {
  if (!ids.length) return;
  const update = db.prepare(
    `UPDATE personality_memory
     SET lastAccessedAt = CURRENT_TIMESTAMP,
         accessCount = COALESCE(accessCount, 0) + 1
     WHERE id = ?`,
  );
  db.transaction((memoryIds) => {
    for (const id of memoryIds) update.run(id);
  })(ids);
}

function listPersonalityMemoryRows(personalityId) {
  return db
    .prepare(
      `SELECT id, personalityId, memoryType, content, importance, createdAt, updatedAt,
              lastAccessedAt, accessCount, embedding, embeddingModel, enabled
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
      `SELECT id, personalityId, memoryType, content, importance, createdAt, enabled
       FROM personality_memory
       WHERE personalityId = ? AND enabled = 1
       ORDER BY importance DESC, id DESC
       LIMIT ?`,
    )
    .all(personalityId, limit);
}

function unionMemories(left, right) {
  const byId = new Map();
  for (const row of left) byId.set(row.id, row);
  for (const row of right) byId.set(row.id, row);
  return [...byId.values()];
}

export function loadContextCandidateMemories(personalityId, topic) {
  if (hasUnindexedMemories(personalityId)) {
    backfillPersonalityKeywordIndex(personalityId);
    return {
      memories: getPersonalityMemory(personalityId, 40),
      retrieval: "scan",
    };
  }

  const keywords = [...tokenize(topic)]
    .filter((keyword) => keyword !== INDEX_PLACEHOLDER)
    .slice(0, MAX_TOPIC_TOKENS);

  if (!keywords.length) {
    return {
      memories: getPersonalityMemory(personalityId, 40),
      retrieval: "scan",
    };
  }

  const placeholders = keywords.map(() => "?").join(", ");
  const hits = db
    .prepare(
      `SELECT DISTINCT m.id, m.personalityId, m.memoryType, m.content, m.importance, m.createdAt, m.enabled
       FROM memory_keyword_index i
       JOIN personality_memory m ON m.id = i.memoryId
       WHERE i.personalityId = ?
         AND i.keyword IN (${placeholders})
         AND m.enabled = 1
       ORDER BY m.importance DESC, m.id DESC
       LIMIT ?`,
    )
    .all(personalityId, ...keywords, MAX_INDEX_HITS);

  if (!hits.length) {
    return {
      memories: getPersonalityMemory(personalityId, 40),
      retrieval: "scan",
    };
  }

  const anchors = db
    .prepare(
      `SELECT id, personalityId, memoryType, content, importance, createdAt, enabled
       FROM personality_memory
       WHERE personalityId = ? AND enabled = 1 AND importance >= 8
       ORDER BY importance DESC, id DESC
       LIMIT 40`,
    )
    .all(personalityId);

  return {
    memories: unionMemories(anchors, hits),
    retrieval: "index",
  };
}

export function getPersonalityMemoryByType(
  personalityId,
  memoryType,
  limit = 20,
  { enabledOnly = true } = {},
) {
  const type = String(memoryType || "").trim();
  if (!type) {
    return [];
  }

  const query = enabledOnly
    ? `SELECT id, personalityId, memoryType, content, importance, createdAt, updatedAt, enabled
       FROM personality_memory
       WHERE personalityId = ? AND memoryType = ? AND enabled = 1
       ORDER BY id DESC
       LIMIT ?`
    : `SELECT id, personalityId, memoryType, content, importance, createdAt, updatedAt, enabled
       FROM personality_memory
       WHERE personalityId = ? AND memoryType = ?
       ORDER BY id DESC
       LIMIT ?`;

  return db.prepare(query).all(personalityId, type, limit);
}

export async function getRelevantPersonalityMemory(personalityId, query, limit = 5) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    return getPersonalityMemory(personalityId, limit);
  }

  const memories = listPersonalityMemoryRows(personalityId).filter(isMemoryEnabled);
  if (memories.length === 0) {
    return [];
  }

  const anchorFacts = memories
    .filter((memory) => memory.importance >= 9)
    .sort((left, right) => right.importance - left.importance || right.id - left.id)
    .map((memory) => ({ ...stripEmbedding(memory), _relevanceScore: null }));

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
    .map(({ memory, score }) => ({ ...stripEmbedding(memory), _relevanceScore: score }));

  return [...anchorFacts, ...rankedFacts];
}

export async function retrieveMemories(personalityId, query, limit = 5, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const normalizedQuery = String(query || "").trim();
  const memories = listPersonalityMemoryRows(personalityId).filter(isMemoryEnabled);
  if (!memories.length || limit <= 0) return [];

  const embeddingProvided = Object.prototype.hasOwnProperty.call(options, "queryEmbedding");
  let queryEmbedding = embeddingProvided && Array.isArray(options.queryEmbedding)
    ? options.queryEmbedding
    : null;
  if (!embeddingProvided && normalizedQuery && isEmbeddingConfigured()) {
    try {
      queryEmbedding = await generateEmbedding(normalizedQuery);
    } catch {
      queryEmbedding = null;
    }
  }

  const scored = memories.map((memory) => {
    const blend = normalizedQuery
      ? getScoredMemory(memory, normalizedQuery, queryEmbedding)
      : Math.min(1, Math.max(0, Number(memory.importance || 0) / 10));
    return {
      memory,
      score: blend * temporalDecay(memory, nowMs),
    };
  });

  const picked = selectWithMmr(scored, limit);
  stampMemoryAccess(picked.map((item) => item.memory.id));
  const readAccess = db.prepare(
    `SELECT lastAccessedAt, accessCount FROM personality_memory WHERE id = ?`,
  );
  const accessById = new Map(
    picked.map((item) => [item.memory.id, readAccess.get(item.memory.id)]),
  );

  return picked.map(({ memory, score }) => {
    const access = accessById.get(memory.id);
    return {
      ...stripEmbedding(memory),
      lastAccessedAt: access?.lastAccessedAt || memory.lastAccessedAt || null,
      accessCount: Number(access?.accessCount ?? memory.accessCount ?? 0),
      _relevanceScore: score,
    };
  });
}

export function pruneMemories(personalityId, maxEntries = PRUNE_KEEP, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const keep = Math.max(0, Number(maxEntries) || 0);
  const rows = db
    .prepare(
      `SELECT id, importance, createdAt, lastAccessedAt
       FROM personality_memory
       WHERE personalityId = ?`,
    )
    .all(personalityId);

  if (rows.length <= keep) return 0;

  const removeIds = rows
    .map((row) => ({
      id: row.id,
      rank: Number(row.importance || 0) * temporalDecay(row, nowMs),
    }))
    .sort((left, right) => right.rank - left.rank || right.id - left.id)
    .slice(keep)
    .map((row) => row.id);

  const dropMemory = db.prepare(`DELETE FROM personality_memory WHERE id = ?`);
  const dropKeywords = db.prepare(`DELETE FROM memory_keyword_index WHERE memoryId = ?`);
  db.transaction((ids) => {
    for (const id of ids) {
      dropKeywords.run(id);
      dropMemory.run(id);
    }
  })(removeIds);

  return removeIds.length;
}

export function upsertMemoryFact(personalityId, content, memoryType = "note", importance = 5) {
  const existing = db
    .prepare(
      `SELECT id, importance, memoryType, embedding, embeddingModel FROM personality_memory
       WHERE personalityId = ? AND content = ?`,
    )
    .get(personalityId, content);

  if (existing) {
    if (importance > existing.importance) {
      db.prepare(
        `UPDATE personality_memory
         SET importance = ?, enabled = 1, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(importance, existing.id);
    } else {
      db.prepare(
        `UPDATE personality_memory
         SET enabled = 1, updatedAt = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(existing.id);
    }

    indexMemoryKeywords(existing.id, personalityId, content, existing.memoryType || memoryType);
    return existing.id;
  }

  const result = db.prepare(
    `INSERT INTO personality_memory (personalityId, memoryType, content, importance)
     VALUES (?, ?, ?, ?)`,
  ).run(personalityId, memoryType, content, importance);

  indexMemoryKeywords(result.lastInsertRowid, personalityId, content, memoryType);
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
    deleteOrphanKeywords(personalityId);
  }
}

export function updateMemoryFact(id, { content, memoryType, importance, enabled }) {
  const normalizedEnabled = Number(enabled ?? 1) === 0 ? 0 : 1;
  db.prepare(
    `UPDATE personality_memory
     SET content = ?, memoryType = ?, importance = ?, enabled = ?, embedding = '', embeddingModel = '', updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(content, memoryType, importance, normalizedEnabled, id);
  const row = db.prepare(`SELECT * FROM personality_memory WHERE id = ?`).get(id);
  if (row) indexMemoryKeywords(row.id, row.personalityId, row.content, row.memoryType);
  return stripEmbedding(normalizeMemoryRow(row));
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
  deleteMemoryKeywords(id);
  db.prepare(`DELETE FROM personality_memory WHERE id = ?`).run(id);
}

// Fetch all facts for a personality (no limit — for journal view)
export function getAllPersonalityMemory(personalityId) {
  return listPersonalityMemoryRows(personalityId).map(stripEmbedding);
}

export function clearPersonalityMemory(personalityId) {
  deletePersonalityKeywords(personalityId);
  db.prepare(`DELETE FROM personality_memory WHERE personalityId = ?`).run(personalityId);
}
