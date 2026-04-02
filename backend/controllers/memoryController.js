import {
  getAllPersonalityMemory,
  updateMemoryFact,
  deleteMemoryFact,
} from "../models/memoryModel.js";

const VALID_MEMORY_TYPES = new Set([
  "fact", "preference", "relationship", "event",
  "scheme", "grudge", "leverage", "target_weakness", "debt",
]);

export function listMemoryHandler(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Invalid personality id." });
  res.json(getAllPersonalityMemory(id));
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
  res.json(updated);
}

export function deleteMemoryHandler(req, res) {
  const id = parseInt(req.params.memoryId, 10);
  if (!id) return res.status(400).json({ error: "Invalid memory id." });
  deleteMemoryFact(id);
  res.json({ ok: true });
}
