/**
 * loopController.js
 *
 * HTTP handlers for the Freesound mood loop cache.
 *
 * Routes (registered in loopRoutes.js):
 *   GET  /api/loops/manifest         → full manifest (cached + fallbacks)
 *   GET  /api/loops/audio/:filename  → stream a cached audio file
 *   GET  /api/loops/status           → per-mood cache status
 *   POST /api/loops/refresh          → fetch/re-fetch all mood loops
 *   POST /api/loops/refresh/:mood    → fetch/re-fetch one mood loop
 */

import { createReadStream } from "node:fs";
import path from "node:path";

import {
  getCachedManifest,
  getCachedFilePath,
  getCacheStatus,
  refreshAllMoods,
  fetchAndCacheMood,
  isFreesoundConfigured,
} from "../services/loopCacheService.js";

// GET /api/loops/manifest
export async function getLoopManifestHandler(_req, res, next) {
  try {
    const manifest = await getCachedManifest();
    res.json(manifest);
  } catch (err) {
    next(err);
  }
}

// GET /api/loops/audio/:filename
export async function streamLoopAudioHandler(req, res, next) {
  try {
    const filePath = await getCachedFilePath(req.params.filename);
    if (!filePath) {
      return res.status(404).json({ error: "Audio file not found in cache." });
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".mp3" ? "audio/mpeg" : ext === ".ogg" ? "audio/ogg" : "audio/wav";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // 24h browser cache

    createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
}

// GET /api/loops/status
export async function getLoopStatusHandler(_req, res, next) {
  try {
    const status = await getCacheStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
}

// POST /api/loops/refresh  — refreshes all moods
export async function refreshAllLoopsHandler(_req, res, next) {
  if (!isFreesoundConfigured()) {
    return res
      .status(503)
      .json({ error: "FREESOUND_API_KEY is not set. Add it to backend/.env." });
  }
  try {
    // Kick off async; it may take 10-20s for 5 moods due to rate-limit delays
    const results = await refreshAllMoods();
    res.json({ ok: true, results });
  } catch (err) {
    next(err);
  }
}

// POST /api/loops/refresh/:mood  — refreshes a single mood
export async function refreshMoodLoopHandler(req, res, next) {
  if (!isFreesoundConfigured()) {
    return res
      .status(503)
      .json({ error: "FREESOUND_API_KEY is not set. Add it to backend/.env." });
  }
  const { mood } = req.params;
  const validMoods = ["ambient", "hype", "chorus", "breakdown", "outro"];
  if (!validMoods.includes(mood)) {
    return res
      .status(400)
      .json({ error: `Invalid mood "${mood}". Valid: ${validMoods.join(", ")}` });
  }
  try {
    const entries = await fetchAndCacheMood(mood);
    res.json({ ok: true, mood, entries });
  } catch (err) {
    next(err);
  }
}
