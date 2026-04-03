import {
  backfillMissingMemoryEmbeddings,
  getAllPersonalityMemory,
  updateMemoryFact,
  deleteMemoryFact,
  refreshMemoryEmbedding,
} from "../models/memoryModel.js";
import { isEmbeddingConfigured, getEmbeddingModelName } from "../services/llmService.js";

const VALID_MEMORY_TYPES = new Set([
  "fact", "preference", "relationship", "event",
  "scheme", "grudge", "leverage", "target_weakness", "debt",
]);

export function listMemoryHandler(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Invalid personality id." });
  res.json(getAllPersonalityMemory(id));
}

export async function backfillMemoryEmbeddingsHandler(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: "Invalid personality id." });

    if (!isEmbeddingConfigured()) {
      return res.status(409).json({
        error: "Embeddings are not configured. Set EMBEDDING_MODEL and related provider settings first.",
      });
    }

    const rawLimit = Number(req.body?.limit ?? req.query.limit ?? 100);
    const limit = Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, Math.floor(rawLimit))) : 100;

    const result = await backfillMissingMemoryEmbeddings(id, limit);
    return res.json({
      ...result,
      embeddingModel: getEmbeddingModelName(),
    });
  } catch (error) {
    return next(error);
  }
}

export function updateMemoryHandler(req, res) {
  const id = parseInt(req.params.memoryId, 10);
  if (!id) return res.status(400).json({ error: "Invalid memory id." });

  const { content, memoryType, importance } = req.body;

  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required." });
  }

  const sanitizedType = VALID_MEMORY_TYPES.has(memoryType) ? memoryType : "fact";
  const sanitizedImportance = Math.min(10, Math.max(1, parseInt(importance, 10) || 5));

  const updated = updateMemoryFact(id, {
    content: content.trim(),
    memoryType: sanitizedType,
    importance: sanitizedImportance,
  });

  if (!updated) return res.status(404).json({ error: "Memory fact not found." });
  setImmediate(() => {
    refreshMemoryEmbedding(id).catch(() => {
      // Embedding refresh is additive and should not fail the request.
    });
  });
  res.json(updated);
}

export function deleteMemoryHandler(req, res) {
  const id = parseInt(req.params.memoryId, 10);
  if (!id) return res.status(400).json({ error: "Invalid memory id." });
  deleteMemoryFact(id);
  res.json({ ok: true });
}
