/**
 * sfxCacheService.js
 *
 * Freesound.org-backed SFX cache for short one-shot sound effects used
 * in persona playback (e.g. the Rick-style burp).
 *
 * On startup, any missing SFX are downloaded from Freesound and stored in
 * backend/sfx-cache/. The frontend fetches them via GET /api/sfx/audio/:name.
 *
 * Requires FREESOUND_API_KEY in backend/.env (same key used for loop cache).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "sfx-cache");
const FREESOUND_BASE = "https://freesound.org/apiv2";

// ── SFX catalog ──────────────────────────────────────────────────────────────
// Each entry defines the Freesound search parameters for that effect.
const SFX_CATALOG = {
  burp: {
    query: "burp single short",
    durationMin: 0.3,
    durationMax: 3.0,
  },
};

const ACCEPTED_LICENSES = [
  "https://creativecommons.org/publicdomain/zero/1.0/",
  "http://creativecommons.org/publicdomain/zero/1.0/",
  "https://creativecommons.org/licenses/by/4.0/",
  "http://creativecommons.org/licenses/by/4.0/",
  "https://creativecommons.org/licenses/by/3.0/",
  "http://creativecommons.org/licenses/by/3.0/",
];

function isAcceptedLicense(licenseUrl) {
  return ACCEPTED_LICENSES.some((l) => String(licenseUrl || "").startsWith(l));
}

function getApiKey() {
  return process.env.FREESOUND_API_KEY || "";
}

export function isFreesoundConfigured() {
  return Boolean(getApiKey());
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function downloadAudio(sound, destPath) {
  const apiKey = getApiKey();
  const previewUrl = sound.previews?.["preview-hq-mp3"] || sound.previews?.["preview-lq-mp3"];
  if (!previewUrl) throw new Error(`No preview URL for Freesound sound ${sound.id}`);

  const url = `${previewUrl}?token=${apiKey}`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Voxis/1.0 (https://github.com/voxislabs-crypto/Voxis)" },
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`Download failed ${resp.status} for sound ${sound.id}`);

  await ensureCacheDir();
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(destPath));
}

/**
 * fetchAndCacheSfx(name)
 * Searches Freesound for the given SFX name, downloads the best CC-licensed
 * result, and saves it to sfx-cache/<name>.mp3.
 */
export async function fetchAndCacheSfx(name) {
  const config = SFX_CATALOG[name];
  if (!config) throw new Error(`Unknown SFX: ${name}`);

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("FREESOUND_API_KEY is not configured.");

  const params = new URLSearchParams({
    token: apiKey,
    query: config.query,
    filter: [
      "type:(wav OR mp3)",
      `duration:[${config.durationMin} TO ${config.durationMax}]`,
      "is_explicit:0",
    ].join(" "),
    sort: "rating_desc",
    fields: "id,name,duration,license,previews,avg_rating,num_ratings",
    page_size: "10",
    format: "json",
  });

  const resp = await fetch(`${FREESOUND_BASE}/search/text/?${params}`, {
    headers: { "User-Agent": "Voxis/1.0 (https://github.com/voxislabs-crypto/Voxis)" },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Freesound search failed ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  const valid = (data.results || [])
    .filter((r) => isAcceptedLicense(r.license))
    .sort((a, b) => {
      const scoreA = (Number(a.avg_rating) || 0) * Math.log1p(Number(a.num_ratings) || 0);
      const scoreB = (Number(b.avg_rating) || 0) * Math.log1p(Number(b.num_ratings) || 0);
      return scoreB - scoreA;
    });

  if (!valid.length) throw new Error(`No CC-licensed results found for SFX: ${name}`);

  const sound = valid[0];
  const destPath = path.join(CACHE_DIR, `${name}.mp3`);
  await downloadAudio(sound, destPath);

  console.log(`[SFX Cache] cached "${name}": "${sound.name}" (${Number(sound.duration).toFixed(1)}s) — ${sound.license}`);
  return destPath;
}

/**
 * getCachedSfxPath(name)
 * Returns the absolute path to the cached SFX file, or null if not cached.
 */
export async function getCachedSfxPath(name) {
  // Validate name to prevent path traversal
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) return null;
  const p = path.join(CACHE_DIR, `${name}.mp3`);
  try {
    await fs.access(p);
    return p;
  } catch {
    return null;
  }
}

/**
 * initSfxCache()
 * Called on backend startup. Downloads any missing SFX. Non-fatal on failure.
 */
export async function initSfxCache() {
  if (!isFreesoundConfigured()) {
    console.log("[SFX Cache] FREESOUND_API_KEY not set — skipping SFX download.");
    return;
  }

  for (const name of Object.keys(SFX_CATALOG)) {
    const cached = await getCachedSfxPath(name);
    if (!cached) {
      try {
        await fetchAndCacheSfx(name);
      } catch (err) {
        console.warn(`[SFX Cache] Failed to cache "${name}": ${err.message}`);
      }
    }
  }
}
