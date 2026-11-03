/**
 * voiceCloneController.js
 *
 * Handles voice cloning pipeline requests.
 *
 * POST /personality/:id/voice-clone
 *   — Accepts multipart/form-data (file upload) or JSON (URL source).
 *   — Streams Server-Sent Events (SSE) progress back to the client.
 *
 * DELETE /personality/:id/voice-clone
 *   — Removes clone metadata and stored reference files.
 *
 * GET /voice-clone/rvc-packs
 *   — Lists available RVC voice packs.
 *
 * POST /voice-clone/rvc-packs
 *   — Registers a new RVC voice pack (uploads .pth + optional .index + sample).
 *
 * DELETE /voice-clone/rvc-packs/:packId
 *   — Removes an RVC voice pack and its files.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import multer from "multer";
import os from "node:os";
import db from "../db/db.js";
import {
  extractAndNormalize,
  getVoiceClonePipelineStatus,
  ensureRvcPacksDir,
  getRvcPackDir,
  getVoiceCloneDir,
} from "../services/voiceCloneService.js";
import {
  registerReference,
  isOpenVoiceInstalled,
} from "../services/openVoiceAdapter.js";
import { isRvcInstalled } from "../services/rvcAdapter.js";
import {
  listRvcVoicePacks,
  getRvcVoicePack,
  createRvcVoicePack,
  deleteRvcVoicePack,
  getPersonalityCloneMeta,
  setPersonalityCloneMeta,
  clearPersonalityCloneMeta,
} from "../models/voiceCloneModel.js";
import { getPersonalityById, updatePersonalityVoiceProfile } from "../models/personalityModel.js";

// ── Multer setup ─────────────────────────────────────────────────────────────
// Store uploads in OS temp dir; we move them after processing.

const ALLOWED_AUDIO_MIME = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
]);

const ALLOWED_MODEL_MIME = new Set([
  "application/octet-stream",
  "application/x-binary",
]);

function audioFilter(_req, file, cb) {
  if (ALLOWED_AUDIO_MIME.has(file.mimetype) || file.originalname.match(/\.(wav|mp3|m4a|ogg|flac|webm)$/i)) {
    cb(null, true);
  } else {
    cb(new Error("Only audio files are accepted (WAV, MP3, M4A, OGG, FLAC, WebM)."));
  }
}

function modelFilter(_req, file, cb) {
  if (file.originalname.match(/\.(pth|index|wav|mp3)$/i)) {
    cb(null, true);
  } else {
    cb(new Error("Only .pth, .index, .wav, and .mp3 files are accepted for voice packs."));
  }
}

const audioUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: audioFilter,
});

const packUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB for .pth models
  fileFilter: modelFilter,
});

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseHeaders(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();
}

function sseEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function setPersonaSpeechEngine(personalityId, engine) {
  const persona = getPersonalityById(personalityId);
  if (!persona?.voiceProfile || typeof persona.voiceProfile !== "object") {
    return;
  }
  if (String(persona.voiceProfile.engine || "").toLowerCase() === engine) {
    return;
  }
  updatePersonalityVoiceProfile(personalityId, {
    ...persona.voiceProfile,
    engine,
  });
}

// ── POST /personality/:id/voice-clone ────────────────────────────────────────

export const startVoiceCloneHandler = [
  // multer handles audio file if present; also accepts JSON-only (URL source)
  (req, res, next) => {
    audioUpload.single("audio")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },

  async (req, res) => {
    const personalityId = Number(req.params.id);
    if (!Number.isFinite(personalityId)) {
      return res.status(400).json({ error: "Invalid persona id." });
    }

    const engine = String(req.body?.engine || "openvoice").trim().toLowerCase();
    if (!["openvoice", "kokoro-rvc"].includes(engine)) {
      return res.status(400).json({ error: "engine must be 'openvoice' or 'kokoro-rvc'." });
    }

    const source = String(req.body?.source || (req.file ? "file" : "url")).trim();
    const youtubeUrl = String(req.body?.youtubeUrl || "").trim();
    const rvcPackId = req.body?.rvcPackId ? Number(req.body.rvcPackId) : null;

    if (source === "url" && !youtubeUrl) {
      return res.status(400).json({ error: "Provide youtubeUrl when source is 'url'." });
    }
    if (source === "file" && !req.file) {
      return res.status(400).json({ error: "No audio file uploaded." });
    }
    if (engine === "kokoro-rvc" && !rvcPackId) {
      return res.status(400).json({ error: "rvcPackId is required for kokoro-rvc engine." });
    }
    if (engine === "kokoro-rvc" && rvcPackId) {
      const pack = getRvcVoicePack(rvcPackId);
      if (!pack) {
        return res.status(400).json({ error: `RVC voice pack ${rvcPackId} not found.` });
      }
    }

    // Switch to SSE streaming
    sseHeaders(res);

    const onProgress = ({ step, pct, message }) => {
      sseEvent(res, "progress", { step, pct, message });
    };

    let tmpDir = null;

    try {
      sseEvent(res, "start", {
        engine,
        message: "⏳ Voice cloning pipeline started. This may take up to 30 seconds.",
      });

      // ── For openvoice: run extraction pipeline ────────────────────────────
      if (engine === "openvoice") {
        const { cleanedWavPath, tmpDir: td } = await extractAndNormalize({
          youtubeUrl: source === "url" ? youtubeUrl : undefined,
          uploadedPath: source === "file" ? req.file.path : undefined,
          onProgress,
        });
        tmpDir = td;

        onProgress({ step: "registering", pct: 70, message: "Registering voice reference with OpenVoice…" });
        await registerReference(personalityId, cleanedWavPath);

        setPersonalityCloneMeta(personalityId, {
          cloneEngine: "openvoice",
          cloneReferenceClipPath: path.join(
            "voice-clones",
            `persona-${personalityId}`,
            "openvoice-reference.wav",
          ),
          cloneRvcPackId: null,
        });
        setPersonaSpeechEngine(personalityId, "openvoice");

        onProgress({ step: "done", pct: 100, message: "Voice registered successfully." });
        sseEvent(res, "done", {
          engine: "openvoice",
          message: "✓ Voice clone complete. This persona now speaks with that clip. The first line can take a few minutes.",
        });
      }

      // ── For kokoro-rvc: just store the pack reference (no clip needed) ───
      if (engine === "kokoro-rvc") {
        onProgress({ step: "registering", pct: 60, message: "Linking RVC voice pack to persona…" });

        // Optionally store a reference clip for future quality analysis
        if (source !== "none") {
          const { tmpDir: td } = await extractAndNormalize({
            youtubeUrl: source === "url" ? youtubeUrl : undefined,
            uploadedPath: source === "file" ? req.file?.path : undefined,
            onProgress,
          }).catch(() => ({ tmpDir: null })); // non-fatal for RVC
          tmpDir = td;
        }

        setPersonalityCloneMeta(personalityId, {
          cloneEngine: "kokoro-rvc",
          cloneReferenceClipPath: "",
          cloneRvcPackId: rvcPackId,
        });

        onProgress({ step: "done", pct: 100, message: "RVC voice pack linked." });
        sseEvent(res, "done", {
          engine: "kokoro-rvc",
          packId: rvcPackId,
          message: "✓ RVC voice pack linked. Kokoro + RVC will now be used for this persona.",
        });
      }
    } catch (err) {
      const message = String(err?.message || err || "Unknown error");
      sseEvent(res, "error", { message });
    } finally {
      // Clean up tmp dir and multer upload
      if (tmpDir) {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      res.end();
    }
  },
];

// ── DELETE /personality/:id/voice-clone ──────────────────────────────────────

export async function removeVoiceCloneHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    if (!Number.isFinite(personalityId)) {
      return res.status(400).json({ error: "Invalid persona id." });
    }

    clearPersonalityCloneMeta(personalityId);
    const persona = getPersonalityById(personalityId);
    if (String(persona?.voiceProfile?.engine || "").toLowerCase() === "openvoice") {
      setPersonaSpeechEngine(personalityId, "auto");
    }

    // Remove reference file if present (best-effort)
    const refPath = path.join(getVoiceCloneDir(personalityId), "openvoice-reference.wav");
    await fs.unlink(refPath).catch(() => {});

    res.json({ ok: true, message: "Voice clone data removed." });
  } catch (err) {
    next(err);
  }
}

// ── GET /personality/:id/voice-clone ─────────────────────────────────────────

export async function getVoiceCloneStatusHandler(req, res, next) {
  try {
    const personalityId = Number(req.params.id);
    if (!Number.isFinite(personalityId)) {
      return res.status(400).json({ error: "Invalid persona id." });
    }

    const meta = getPersonalityCloneMeta(personalityId);
    const pipelineStatus = await getVoiceClonePipelineStatus();
    const [ovInstalled, rvcInstalled] = await Promise.all([
      isOpenVoiceInstalled(),
      isRvcInstalled(),
    ]);

    res.json({
      ...meta,
      pipelineReady: pipelineStatus.ready,
      pipeline: pipelineStatus,
      openVoiceInstalled: ovInstalled,
      rvcInstalled,
    });
  } catch (err) {
    next(err);
  }
}

// ── GET /voice-clone/rvc-packs ───────────────────────────────────────────────

export function listRvcPacksHandler(req, res, next) {
  try {
    const ownerId = req.auth?.userId ?? null;
    const packs = listRvcVoicePacks(ownerId);
    res.json({ packs });
  } catch (err) {
    next(err);
  }
}

// ── POST /voice-clone/rvc-packs ──────────────────────────────────────────────

export const uploadRvcPackHandler = [
  (req, res, next) => {
    packUpload.fields([
      { name: "model", maxCount: 1 },
      { name: "index", maxCount: 1 },
      { name: "sample", maxCount: 1 },
    ])(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },

  async (req, res, next) => {
    try {
      const name = String(req.body?.name || "").trim();
      const description = String(req.body?.description || "").trim();

      if (!name) {
        return res.status(400).json({ error: "Voice pack name is required." });
      }

      const modelFile = req.files?.model?.[0];
      if (!modelFile) {
        return res.status(400).json({ error: "A .pth model file is required." });
      }

      // Sanitize filename — only alphanums, dashes, underscores, dots
      const safeName = path.basename(modelFile.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
      const safeIndexName = req.files?.index?.[0]
        ? path.basename(req.files.index[0].originalname).replace(/[^a-zA-Z0-9._-]/g, "_")
        : null;
      const safeSampleName = req.files?.sample?.[0]
        ? path.basename(req.files.sample[0].originalname).replace(/[^a-zA-Z0-9._-]/g, "_")
        : null;

      // Create the pack record first to get an id, then move files into the pack dir
      const packId = createRvcVoicePack({
        name,
        description,
        modelPath: "pending", // will be updated after move
        ownerId: req.auth?.userId ?? null,
      });

      const packDir = await ensureRvcPacksDir(packId);

      // Move model file
      const destModel = path.join(packDir, safeName);
      await fs.rename(modelFile.path, destModel);

      // Move index file if present
      let destIndex = "";
      if (req.files?.index?.[0]) {
        destIndex = path.join(packDir, safeIndexName);
        await fs.rename(req.files.index[0].path, destIndex);
      }

      // Move sample file if present
      let destSample = "";
      if (req.files?.sample?.[0]) {
        destSample = path.join(packDir, safeSampleName);
        await fs.rename(req.files.sample[0].path, destSample);
      }

      // Update the record with real paths
      db.prepare(
        "UPDATE rvc_voice_packs SET modelPath = ?, samplePath = ? WHERE id = ?",
      ).run(destModel, destSample, packId);

      res.status(201).json({
        ok: true,
        pack: {
          id: packId,
          name,
          description,
          modelPath: destModel,
          samplePath: destSample,
        },
      });
    } catch (err) {
      // Clean up any uploaded temp files
      for (const key of Object.keys(req.files || {})) {
        for (const f of (req.files[key] || [])) {
          await fs.unlink(f.path).catch(() => {});
        }
      }
      next(err);
    }
  },
];

// ── DELETE /voice-clone/rvc-packs/:packId ────────────────────────────────────

export async function deleteRvcPackHandler(req, res, next) {
  try {
    const packId = Number(req.params.packId);
    if (!Number.isFinite(packId)) {
      return res.status(400).json({ error: "Invalid pack id." });
    }

    const pack = getRvcVoicePack(packId);
    if (!pack) {
      return res.status(404).json({ error: "Voice pack not found." });
    }

    // Remove files from disk (best-effort)
    const packDir = getRvcPackDir(packId);
    await fs.rm(packDir, { recursive: true, force: true }).catch(() => {});

    deleteRvcVoicePack(packId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
