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
    // Broader queries return more CC-licensed results
    query: "belch burp",
    durationMin: 0.3,
    durationMax: 4.0,
  },
  giggle: {
    query: "giggle laugh female",
    durationMin: 0.4,
    durationMax: 3.0,
  },
  chuckle: {
    query: "chuckle male laugh",
    durationMin: 0.5,
    durationMax: 3.0,
  },
  cough: {
    query: "cough clear throat",
    durationMin: 0.3,
    durationMax: 2.0,
  },
  sigh: {
    query: "sigh exhale breath",
    durationMin: 0.5,
    durationMax: 3.0,
  },
  snort: {
    query: "snort laugh funny",
    durationMin: 0.3,
    durationMax: 2.0,
  },
  hiccup: {
    query: "hiccup",
    durationMin: 0.2,
    durationMax: 1.5,
  },
  fart: {
    query: "fart toot comedic",
    durationMin: 0.2,
    durationMax: 3.0,
  },
  evil_chuckle: {
    query: "evil chuckle villain laugh",
    durationMin: 0.4,
    durationMax: 4.0,
  },
  maniacal_laugh: {
    query: "maniacal laugh villain",
    durationMin: 0.6,
    durationMax: 4.5,
  },
  cackle: {
    query: "witch cackle laugh",
    durationMin: 0.4,
    durationMax: 3.5,
  },
  gasp: {
    query: "gasp surprise",
    durationMin: 0.2,
    durationMax: 2.5,
  },
  sniff: {
    query: "sniff nose",
    durationMin: 0.2,
    durationMax: 1.8,
  },
  yawn: {
    query: "yawn tired",
    durationMin: 0.7,
    durationMax: 4.0,
  },
  growl: {
    query: "growl creature voice",
    durationMin: 0.3,
    durationMax: 3.0,
  },
  scream: {
    query: "short scream horror",
    durationMin: 0.3,
    durationMax: 2.5,
  },
  grunt: {
    query: "grunt effort",
    durationMin: 0.2,
    durationMax: 2.0,
  },
  clap: {
    query: "single clap",
    durationMin: 0.1,
    durationMax: 1.5,
  },
};

const SFX_ALIASES = Object.freeze({
  belch: "burp",
  burps: "burp",
  burping: "burp",
  giggles: "giggle",
  laugh: "chuckle",
  laughter: "chuckle",
  evilchuckle: "evil_chuckle",
  evil_laugh: "evil_chuckle",
  wicked_chuckle: "evil_chuckle",
  sinister_chuckle: "evil_chuckle",
  evilcackle: "cackle",
  maniacal: "maniacal_laugh",
  farting: "fart",
  toot: "fart",
  flatulence: "fart",
  gasp_sfx: "gasp",
  sniffle: "sniff",
  yawning: "yawn",
  roar: "growl",
  shriek: "scream",
});

function normalizeTagToken(tag) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeSfxTag(tag) {
  const token = normalizeTagToken(tag);
  if (!token) return "";
  if (SFX_CATALOG[token]) return token;
  if (SFX_ALIASES[token]) return SFX_ALIASES[token];
  return "";
}

/**
 * Get list of available SFX tags
 * @returns {string[]} Array of available SFX tag names
 */
export function getAvailableSfxTags() {
  return Object.keys(SFX_CATALOG);
}

/**
 * Check if a tag is a valid SFX tag
 * @param {string} tag - Tag to check
 * @returns {boolean}
 */
export function isValidSfxTag(tag) {
  return Boolean(normalizeSfxTag(tag));
}

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

function summarizeFetchError(error) {
  const cause = error?.cause;
  const parts = [String(error?.message || error || "unknown error")];

  if (cause?.code) {
    parts.push(`code=${cause.code}`);
  }
  if (cause?.errno) {
    parts.push(`errno=${cause.errno}`);
  }
  if (cause?.syscall) {
    parts.push(`syscall=${cause.syscall}`);
  }
  if (cause?.hostname) {
    parts.push(`host=${cause.hostname}`);
  }

  return parts.join(" | ");
}

async function fetchWithDiagnostics(url, options, contextLabel) {
  try {
    return await fetch(url, options);
  } catch (error) {
    const details = summarizeFetchError(error);
    throw new Error(`[${contextLabel}] ${details}`);
  }
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
  const resp = await fetchWithDiagnostics(url, {
    headers: { "User-Agent": "Voxis/1.0 (https://github.com/voxislabs-crypto/Voxis)" },
    signal: AbortSignal.timeout(30000),
  }, `download sound=${sound.id}`);

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

  const resp = await fetchWithDiagnostics(`${FREESOUND_BASE}/search/text/?${params}`, {
    headers: { "User-Agent": "Voxis/1.0 (https://github.com/voxislabs-crypto/Voxis)" },
    signal: AbortSignal.timeout(15000),
  }, `search sfx=${name}`);

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
        if (err?.stack) {
          const firstLine = String(err.stack).split("\n").slice(0, 2).join(" | ");
          console.warn(`[SFX Cache] Diagnostic stack (${name}): ${firstLine}`);
        }
      }
    }
  }
}
