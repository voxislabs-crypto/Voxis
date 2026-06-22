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

const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30000;
const DEFAULT_FETCH_MAX_RETRIES = 2;
const DEFAULT_FETCH_RETRY_BASE_DELAY_MS = 750;

const TRANSIENT_FETCH_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_CONNECT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

// ── SFX catalog ──────────────────────────────────────────────────────────────
// Each entry defines the Freesound search parameters for that effect.
// Burp has several variants (burp, braap, urrrp, long_burp) so different
// onomatopoeia in persona text can map to different audio clips.
const SFX_CATALOG = {
  burp: {
    // Broader queries return more CC-licensed results
    query: "belch burp",
    durationMin: 0.3,
    durationMax: 4.0,
  },
  // burp variants for different onomatopoeia (BRAAAP, URRRP, long BUUUURP etc.)
  // These can be used as alternate sounds for the burp tag.
  braap: {
    // Use broader query that actually returns results; the filename gives the variant flavor
    query: "short burp belch",
    durationMin: 0.3,
    durationMax: 4.0,
  },
  urrrp: {
    query: "long burp belch",
    durationMin: 0.3,
    durationMax: 4.0,
  },
  long_burp: {
    query: "deep burp belch",
    durationMin: 0.5,
    durationMax: 5.0,
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
    fallbackQueries: [
      "snort",
      "nose snort",
      "laugh snort",
    ],
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
    fallbackQueries: [
      "fart",
      "toot",
      "comedic fart",
    ],
  },
  evil_chuckle: {
    query: "evil chuckle villain laugh",
    durationMin: 0.4,
    durationMax: 4.0,
    fallbackQueries: [
      "evil laugh",
      "villain laugh",
      "sinister chuckle",
    ],
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
    fallbackQueries: [
      "cackle",
      "witch laugh",
      "evil cackle",
    ],
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

const SFX_FALLBACKS = Object.freeze({
  snort: ["chuckle", "giggle", "grunt"],
  fart: ["burp", "grunt"],
  evil_chuckle: ["maniacal_laugh", "cackle", "chuckle"],
  cackle: ["maniacal_laugh", "evil_chuckle", "chuckle"],
  braap: ["burp"],
  urrrp: ["long_burp", "burp"],
  long_burp: ["burp"],
});

function normalizeTagToken(tag) {
  return String(tag || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getFallbackCandidates(tag) {
  const normalized = normalizeSfxTag(tag);
  if (!normalized) return [];

  return Array.from(new Set(
    (SFX_FALLBACKS[normalized] || [])
      .map((candidate) => normalizeSfxTag(candidate))
      .filter((candidate) => candidate && candidate !== normalized),
  ));
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

function parsePositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFetchErrorCode(error) {
  return String(error?.cause?.code || error?.code || "").trim();
}

function isRetryableFetchError(error) {
  const code = getFetchErrorCode(error);
  if (TRANSIENT_FETCH_ERROR_CODES.has(code)) return true;

  const message = String(error?.message || "").toLowerCase();
  return message.includes("fetch failed") || message.includes("network") || message.includes("timeout");
}

function makeFetchConfig() {
  return {
    searchTimeoutMs: parsePositiveIntEnv("SFX_FETCH_TIMEOUT_MS", DEFAULT_FETCH_TIMEOUT_MS),
    downloadTimeoutMs: parsePositiveIntEnv("SFX_DOWNLOAD_TIMEOUT_MS", DEFAULT_DOWNLOAD_TIMEOUT_MS),
    maxRetries: Math.max(0, parsePositiveIntEnv("SFX_FETCH_MAX_RETRIES", DEFAULT_FETCH_MAX_RETRIES)),
    retryBaseDelayMs: parsePositiveIntEnv("SFX_FETCH_RETRY_BASE_DELAY_MS", DEFAULT_FETCH_RETRY_BASE_DELAY_MS),
  };
}

async function fetchWithDiagnostics(url, options, contextLabel, retryConfig = {}) {
  const optionsFactory = typeof options === "function" ? options : () => options;
  const maxRetries = Number.isInteger(retryConfig.maxRetries)
    ? Math.max(0, retryConfig.maxRetries)
    : DEFAULT_FETCH_MAX_RETRIES;
  const retryBaseDelayMs = Number.isFinite(retryConfig.retryBaseDelayMs)
    ? Math.max(0, retryConfig.retryBaseDelayMs)
    : DEFAULT_FETCH_RETRY_BASE_DELAY_MS;

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fetch(url, optionsFactory());
    } catch (error) {
      const retryable = isRetryableFetchError(error);
      if (retryable && attempt < maxRetries) {
        attempt += 1;
        const jitterMs = Math.floor(Math.random() * 250);
        const delayMs = retryBaseDelayMs * attempt + jitterMs;
        console.warn(
          `[SFX Cache] transient fetch failure for ${contextLabel}; retry ${attempt}/${maxRetries} in ${delayMs}ms (${summarizeFetchError(error)})`,
        );
        await wait(delayMs);
        continue;
      }

      const details = summarizeFetchError(error);
      const attemptsText = `attempts=${attempt + 1}/${maxRetries + 1}`;
      throw new Error(`[${contextLabel}] ${details} | ${attemptsText}`);
    }
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
  const fetchConfig = makeFetchConfig();
  const previewUrl = sound.previews?.["preview-hq-mp3"] || sound.previews?.["preview-lq-mp3"];
  if (!previewUrl) throw new Error(`No preview URL for Freesound sound ${sound.id}`);

  const url = `${previewUrl}?token=${apiKey}`;
  const resp = await fetchWithDiagnostics(
    url,
    () => ({
      headers: { "User-Agent": "Voxis/1.0 (https://github.com/voxislabs-crypto/Voxis)" },
      signal: AbortSignal.timeout(fetchConfig.downloadTimeoutMs),
    }),
    `download sound=${sound.id}`,
    fetchConfig,
  );

  if (!resp.ok) throw new Error(`Download failed ${resp.status} for sound ${sound.id}`);

  await ensureCacheDir();
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(destPath));
}

async function searchFreesound({ apiKey, query, durationMin, durationMax }) {
  const fetchConfig = makeFetchConfig();
  const params = new URLSearchParams({
    token: apiKey,
    query,
    filter: [
      "type:(wav OR mp3)",
      `duration:[${durationMin} TO ${durationMax}]`,
      "is_explicit:0",
    ].join(" "),
    sort: "rating_desc",
    fields: "id,name,duration,license,previews,avg_rating,num_ratings",
    page_size: "10",
    format: "json",
  });

  const resp = await fetchWithDiagnostics(
    `${FREESOUND_BASE}/search/text/?${params}`,
    () => ({
      headers: { "User-Agent": "Voxis/1.0 (https://github.com/voxislabs-crypto/Voxis)" },
      signal: AbortSignal.timeout(fetchConfig.searchTimeoutMs),
    }),
    `search query=${query}`,
    fetchConfig,
  );

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

  return {
    valid,
    totalResults: Number(data.count || 0),
  };
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

  const attempts = [
    {
      query: config.query,
      durationMin: config.durationMin,
      durationMax: config.durationMax,
    },
    ...((Array.isArray(config.fallbackQueries) ? config.fallbackQueries : []).map((query) => ({
      query,
      durationMin: config.durationMin,
      durationMax: config.durationMax,
    }))),
    {
      query: config.query,
      durationMin: Math.max(0.1, Number(config.durationMin) || 0.1),
      durationMax: Math.max(6.0, Number(config.durationMax) || 6.0),
    },
  ];

  let selectedSound = null;
  const summaries = [];

  for (const attempt of attempts) {
    const { valid, totalResults } = await searchFreesound({
      apiKey,
      query: attempt.query,
      durationMin: attempt.durationMin,
      durationMax: attempt.durationMax,
    });

    summaries.push(`${attempt.query}(${attempt.durationMin}-${attempt.durationMax}s):cc=${valid.length},total=${totalResults}`);

    if (valid.length > 0) {
      selectedSound = valid[0];
      break;
    }
  }

  if (!selectedSound) {
    const fallbackCandidates = getFallbackCandidates(name);
    throw new Error(
      `No CC-licensed results found for SFX: ${name}. ` +
        `Attempts: ${summaries.join(" | ")}. ` +
        (fallbackCandidates.length
          ? `Fallback candidates: ${fallbackCandidates.join(", ")}`
          : "Fallback candidates: none"),
    );
  }

  const sound = selectedSound;
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
    const fallbackCandidates = getFallbackCandidates(name);
    for (const candidate of fallbackCandidates) {
      const fallbackPath = path.join(CACHE_DIR, `${candidate}.mp3`);
      try {
        await fs.access(fallbackPath);
        return fallbackPath;
      } catch {
        // try next fallback candidate
      }
    }
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
        const fallbackPath = await getCachedSfxPath(name);
        if (fallbackPath) {
          console.warn(`[SFX Cache] Falling back for "${name}" to cached file: ${path.basename(fallbackPath)}`);
          continue;
        }

        console.warn(`[SFX Cache] Failed to cache "${name}": ${err.message}`);
        if (err?.stack) {
          const firstLine = String(err.stack).split("\n").slice(0, 2).join(" | ");
          console.warn(`[SFX Cache] Diagnostic stack (${name}): ${firstLine}`);
        }
      }
    }
  }
}
