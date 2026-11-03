/**
 * voiceCloneModel.js
 *
 * SQLite CRUD for:
 *   - rvc_voice_packs table — metadata for each registered voice pack
 *   - Clone metadata columns on the personalities table
 *     (cloneEngine, cloneReferenceClipPath, cloneRvcPackId, cloneUpdatedAt)
 *
 * Audio files and model files are stored on disk.
 * Only paths and metadata live in SQLite.
 */

import db from "../db/db.js";

// ── RVC Voice Packs ──────────────────────────────────────────────────────────

/**
 * List all registered RVC voice packs.
 * @param {number|null} ownerId   Filter by local Voxis user id if provided.
 */
export function listRvcVoicePacks(ownerId = null) {
  if (ownerId) {
    return db
      .prepare(
        "SELECT id, name, description, modelPath, samplePath, ownerId, createdAt FROM rvc_voice_packs WHERE ownerId = ? OR ownerId IS NULL ORDER BY name ASC",
      )
      .all(ownerId);
  }
  return db
    .prepare(
      "SELECT id, name, description, modelPath, samplePath, ownerId, createdAt FROM rvc_voice_packs ORDER BY name ASC",
    )
    .all();
}

/**
 * Get a single RVC voice pack by id.
 */
export function getRvcVoicePack(packId) {
  return db
    .prepare(
      "SELECT id, name, description, modelPath, samplePath, ownerId, createdAt FROM rvc_voice_packs WHERE id = ?",
    )
    .get(packId);
}

export function getVisibleRvcVoicePack(packId, ownerId) {
  const localOwnerId = Number(ownerId);
  if (!Number.isInteger(localOwnerId) || localOwnerId <= 0) return null;
  return db
    .prepare(
      "SELECT id, name, description, modelPath, samplePath, ownerId, createdAt FROM rvc_voice_packs WHERE id = ? AND (ownerId = ? OR ownerId IS NULL)",
    )
    .get(packId, localOwnerId);
}

/**
 * Register a new RVC voice pack.
 * @param {object} pack
 * @param {string} pack.name
 * @param {string} [pack.description]
 * @param {string} pack.modelPath      Absolute path to the .pth model file on disk.
 * @param {string} [pack.samplePath]   Absolute path to optional sample WAV.
 * @param {number|null} [pack.ownerId]
 * @returns {number} New pack id.
 */
export function createRvcVoicePack({ name, description = "", modelPath, samplePath = "", ownerId = null }) {
  const result = db
    .prepare(
      "INSERT INTO rvc_voice_packs (name, description, modelPath, samplePath, ownerId, createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))",
    )
    .run(
      String(name).trim(),
      String(description).trim(),
      String(modelPath).trim(),
      String(samplePath).trim(),
      ownerId ?? null,
    );
  return result.lastInsertRowid;
}

/**
 * Delete a voice pack record. Does NOT delete files from disk (caller's responsibility).
 */
export function deleteRvcVoicePack(packId) {
  db.prepare("DELETE FROM rvc_voice_packs WHERE id = ?").run(packId);
}

export function deleteOwnedRvcVoicePack(packId, ownerId) {
  const localOwnerId = Number(ownerId);
  if (!Number.isInteger(localOwnerId) || localOwnerId <= 0) return 0;
  return Number(
    db.prepare("DELETE FROM rvc_voice_packs WHERE id = ? AND ownerId = ?").run(packId, localOwnerId).changes || 0,
  );
}

// ── Personality Clone Metadata ───────────────────────────────────────────────

/**
 * Get clone metadata for a persona.
 * @returns {{ cloneEngine, cloneReferenceClipPath, cloneRvcPackId, cloneUpdatedAt } | null}
 */
export function getPersonalityCloneMeta(personalityId) {
  return db
    .prepare(
      "SELECT cloneEngine, cloneReferenceClipPath, cloneRvcPackId, cloneUpdatedAt FROM personalities WHERE id = ?",
    )
    .get(personalityId) ?? null;
}

/**
 * Update clone metadata for a persona.
 * @param {number} personalityId
 * @param {object} meta
 * @param {string} meta.cloneEngine           'openvoice' | 'kokoro-rvc' | ''
 * @param {string} [meta.cloneReferenceClipPath]
 * @param {number|null} [meta.cloneRvcPackId]
 */
export function setPersonalityCloneMeta(personalityId, { cloneEngine, cloneReferenceClipPath = "", cloneRvcPackId = null }) {
  db.prepare(
    "UPDATE personalities SET cloneEngine = ?, cloneReferenceClipPath = ?, cloneRvcPackId = ?, cloneUpdatedAt = datetime('now') WHERE id = ?",
  ).run(
    String(cloneEngine || ""),
    String(cloneReferenceClipPath || ""),
    cloneRvcPackId ?? null,
    personalityId,
  );
}

/**
 * Clear clone metadata for a persona.
 */
export function clearPersonalityCloneMeta(personalityId) {
  db.prepare(
    "UPDATE personalities SET cloneEngine = '', cloneReferenceClipPath = '', cloneRvcPackId = NULL, cloneUpdatedAt = datetime('now') WHERE id = ?",
  ).run(personalityId);
}
