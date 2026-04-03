import {
  deleteUserMemory,
  getAllUserMemory,
  updateUserMemory,
  upsertUserMemoryWithEmbedding,
} from "../models/userMemoryModel.js";
import { getUserById } from "../models/userModel.js";

const VALID_MEMORY_TYPES = new Set([
  "fact",
  "preference",
  "relationship",
  "routine",
  "long_term_goal",
  "note",
]);

export function listUserMemoryHandler(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "A valid user id is required." });
  }

  const user = getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  return res.json({ user, memory: getAllUserMemory(userId) });
}

export async function createUserMemoryHandler(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: "A valid user id is required." });
    }

    const user = getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const content = String(req.body?.content || "").trim();
    if (!content) {
      return res.status(400).json({ error: "content is required." });
    }

    const memoryType = VALID_MEMORY_TYPES.has(req.body?.memoryType)
      ? req.body.memoryType
      : "note";
    const importance = Math.min(10, Math.max(1, Number(req.body?.importance) || 5));

    await upsertUserMemoryWithEmbedding(userId, content, memoryType, importance);
    return res.status(201).json({ user, memory: getAllUserMemory(userId) });
  } catch (error) {
    return next(error);
  }
}

export function updateUserMemoryHandler(req, res) {
  const userId = Number(req.params.id);
  const memoryId = Number(req.params.memoryId);
  if (!Number.isInteger(userId) || !Number.isInteger(memoryId)) {
    return res.status(400).json({ error: "Valid user and memory ids are required." });
  }

  const user = getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const content = String(req.body?.content || "").trim();
  if (!content) {
    return res.status(400).json({ error: "content is required." });
  }

  const memoryType = VALID_MEMORY_TYPES.has(req.body?.memoryType)
    ? req.body.memoryType
    : "note";
  const importance = Math.min(10, Math.max(1, Number(req.body?.importance) || 5));

  const updated = updateUserMemory(memoryId, { content, memoryType, importance });
  if (!updated || updated.userId !== userId) {
    return res.status(404).json({ error: "User memory not found." });
  }

  return res.json({ user, memory: updated });
}

export function deleteUserMemoryHandler(req, res) {
  const userId = Number(req.params.id);
  const memoryId = Number(req.params.memoryId);
  if (!Number.isInteger(userId) || !Number.isInteger(memoryId)) {
    return res.status(400).json({ error: "Valid user and memory ids are required." });
  }

  const user = getUserById(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  deleteUserMemory(memoryId, userId);
  return res.json({ ok: true });
}
