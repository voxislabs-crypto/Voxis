import { createReadStream } from "node:fs";
import { getPersonalityById } from "../models/personalityModel.js";
import {
  fetchAndCacheSfx,
  getCachedSfxPath,
  getAvailableSfxTags,
  isFreesoundConfigured,
  isValidSfxTag,
  normalizeSfxTag,
} from "../services/sfxCacheService.js";

/**
 * GET /api/sfx/audio/:name
 * Streams a cached SFX MP3 to the client.
 */
export async function serveSfx(req, res) {
  const { name } = req.params;

  // Strict allowlist — no path traversal risk
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
    return res.status(400).json({ error: "Invalid SFX name." });
  }

  let filePath = await getCachedSfxPath(name);
  if (!filePath && isFreesoundConfigured()) {
    try {
      filePath = await fetchAndCacheSfx(name);
    } catch (error) {
      console.warn(`[SFX] On-demand cache failed for "${name}": ${String(error?.message || error)}`);
    }
  }

  if (!filePath) {
    return res.status(404).json({ error: `SFX "${name}" not cached yet.` });
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  createReadStream(filePath).pipe(res);
}

/**
 * POST /api/sfx/prefetch
 * Body: { personalityId?: number, tags?: string[] }
 */
export async function prefetchSfx(req, res) {
  if (!isFreesoundConfigured()) {
    return res.status(503).json({ error: "FREESOUND_API_KEY not configured." });
  }

  const ownerId = req.voxisUser?.id ?? null;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const personalityId = Number(body.personalityId);
  const requestedTags = Array.isArray(body.tags) ? body.tags : [];

  let tags = requestedTags;
  if (Number.isInteger(personalityId)) {
    const personality = getPersonalityById(personalityId, ownerId);
    if (!personality) {
      return res.status(404).json({ error: "Personality not found." });
    }
    tags = Array.isArray(personality?.vocalMannerisms?.sfxTags)
      ? personality.vocalMannerisms.sfxTags
      : [];
  }

  const normalizedTags = Array.from(new Set(
    tags
      .map((tag) => normalizeSfxTag(tag))
      .filter((tag) => isValidSfxTag(tag)),
  ));

  if (!normalizedTags.length) {
    return res.status(400).json({
      error: "No valid SFX tags were provided.",
      availableTags: getAvailableSfxTags(),
    });
  }

  const cached = [];
  const fetched = [];
  const failed = [];

  for (const tag of normalizedTags) {
    try {
      const existing = await getCachedSfxPath(tag);
      if (existing) {
        cached.push(tag);
        continue;
      }

      await fetchAndCacheSfx(tag);
      fetched.push(tag);
    } catch (error) {
      failed.push({ tag, error: String(error?.message || error) });
    }
  }

  return res.json({
    ok: failed.length === 0,
    cached,
    fetched,
    failed,
  });
}
