import { createReadStream } from "node:fs";
import { getCachedSfxPath } from "../services/sfxCacheService.js";

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

  const filePath = await getCachedSfxPath(name);
  if (!filePath) {
    return res.status(404).json({ error: `SFX "${name}" not cached yet.` });
  }

  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  createReadStream(filePath).pipe(res);
}
