/**
 * loopCacheService.js
 *
 * Freesound.org-backed mood loop cache.
 *
 * On first request for a mood, queries Freesound for CC-licensed loops
 * matching that mood's tag profile, downloads the best match, and stores
 * it in backend/loop-cache/. Subsequent requests serve instantly from disk.
 *
 * Requires FREESOUND_API_KEY in backend/.env
 * Register at: https://freesound.org/apiv2/apply
 *
 * The manifest (loop-cache/manifest.json) is written on every successful
 * download and read by the loop endpoint at startup. The PerformancePlayer
 * fetches /api/loops/manifest at runtime so it always gets live URLs.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "..", "loop-cache");
const MANIFEST_PATH = path.join(CACHE_DIR, "manifest.json");

const FREESOUND_BASE = "https://freesound.org/apiv2";

// ── Mood → Freesound search config ──────────────────────────────────────────
// Each mood maps to a tag query + desired BPM range + preferred duration.
// We request multiple candidates and pick the highest-rated CC-licensed one.
const MOOD_SEARCH_CONFIG = {
  ambient: {
    tags: ["ambient", "atmospheric", "loop", "drone"],
    bpmMin: 60,
    bpmMax: 100,
    durationMin: 8,
    durationMax: 60,
    label: "Ambient / Intro",
    defaultVolume: 0.35,
  },
  hype: {
    tags: ["hip-hop", "loop", "beat", "trap", "rap"],
    bpmMin: 90,
    bpmMax: 160,
    durationMin: 4,
    durationMax: 30,
    label: "High-Energy Verse",
    defaultVolume: 0.40,
  },
  chorus: {
    tags: ["electronic", "loop", "synth", "beat", "energetic"],
    bpmMin: 100,
    bpmMax: 150,
    durationMin: 4,
    durationMax: 30,
    label: "Anthemic Chorus",
    defaultVolume: 0.45,
  },
  breakdown: {
    tags: ["piano", "loop", "melancholic", "sad", "emotional"],
    bpmMin: 50,
    bpmMax: 100,
    durationMin: 8,
    durationMax: 60,
    label: "Emotional Breakdown",
    defaultVolume: 0.28,
  },
  outro: {
    tags: ["ambient", "loop", "fade", "downtempo", "chill"],
    bpmMin: 50,
    bpmMax: 100,
    durationMin: 8,
    durationMax: 60,
    label: "Outro / Decay",
    defaultVolume: 0.20,
  },
};

// CC licenses we accept — ordered by preference (most permissive first)
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

// ── Manifest helpers ─────────────────────────────────────────────────────────

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      version: "0.2",
      crossfadeDurationMs: 800,
      ttsVolumeMultiplier: 1.0,
      musicVolumeMultiplier: 0.55,
      loops: {},
    };
  }
}

async function writeManifest(manifest) {
  await ensureCacheDir();
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

// ── Freesound API helpers ────────────────────────────────────────────────────

async function freesoundSearch(config) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("FREESOUND_API_KEY is not configured.");

  const { tags, bpmMin, bpmMax, durationMin, durationMax } = config;

  // Build tag query — Freesound uses space-separated tags for AND, comma for OR
  const tagQuery = tags.join(" ");

  const params = new URLSearchParams({
    token: apiKey,
    query: tagQuery,
    filter: [
      "type:(wav OR mp3 OR ogg)",
      `duration:[${durationMin} TO ${durationMax}]`,
      "is_explicit:0",
    ].join(" "),
    sort: "rating_desc",
    fields: "id,name,duration,license,previews,avg_rating,num_ratings,url,username",
    page_size: "15",
    format: "json",
  });

  const url = `${FREESOUND_BASE}/search/text/?${params}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Voxis/1.0 (https://github.com/voxislabs-crypto/Voxis)" },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Freesound search failed ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp.json();
}

function pickBestResult(results) {
  if (!results?.results?.length) return null;

  // Filter to accepted licenses, prefer higher ratings
  const valid = results.results
    .filter((r) => isAcceptedLicense(r.license))
    .sort((a, b) => {
      // Prefer more ratings + higher avg
      const scoreA = (Number(a.avg_rating) || 0) * Math.log1p(Number(a.num_ratings) || 0);
      const scoreB = (Number(b.avg_rating) || 0) * Math.log1p(Number(b.num_ratings) || 0);
      return scoreB - scoreA;
    });

  return valid[0] || null;
}

async function downloadAudio(sound, destPath) {
  const apiKey = getApiKey();

  // Prefer HQ preview (mp3 ~128kbps) — avoids needing special OAuth for full download
  // Preview URLs are always publicly accessible with a token appended
  const previewUrl = sound.previews?.["preview-hq-mp3"] || sound.previews?.["preview-lq-mp3"];
  if (!previewUrl) throw new Error(`No preview URL for sound ${sound.id}`);

  const url = `${previewUrl}?token=${apiKey}`;

  const resp = await fetch(url, {
    headers: { "User-Agent": "Voxis/1.0" },
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) throw new Error(`Download failed ${resp.status} for sound ${sound.id}`);

  await ensureCacheDir();
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(destPath));
}

// ── Core public API ──────────────────────────────────────────────────────────

/**
 * fetchAndCacheMood(mood)
 *
 * Queries Freesound for the given mood, downloads the best match, updates
 * the manifest, and returns the relative URL path for the loop.
 *
 * Throws if Freesound isn't configured or the search returns no valid results.
 */
export async function fetchAndCacheMood(mood) {
  const config = MOOD_SEARCH_CONFIG[mood];
  if (!config) throw new Error(`Unknown mood: ${mood}`);

  if (!isFreesoundConfigured()) {
    throw new Error("FREESOUND_API_KEY is not set. Add it to backend/.env.");
  }

  console.log(`[LoopCache] Searching Freesound for mood="${mood}" tags=${config.tags.join(",")}`);

  const results = await freesoundSearch(config);
  const best = pickBestResult(results);

  if (!best) {
    throw new Error(`No CC-licensed results found on Freesound for mood "${mood}".`);
  }

  console.log(`[LoopCache] Selected: "${best.name}" by ${best.username} (rating ${best.avg_rating}, license ${best.license})`);

  const ext = ".mp3"; // previews are always mp3
  const filename = `${mood}-${best.id}${ext}`;
  const destPath = path.join(CACHE_DIR, filename);

  await downloadAudio(best, destPath);

  const manifest = await readManifest();
  manifest.loops[mood] = {
    file: `/api/loops/audio/${filename}`,
    label: config.label,
    defaultVolume: config.defaultVolume,
    freesoundId: best.id,
    freesoundName: best.name,
    freesoundUser: best.username,
    license: best.license,
    duration: best.duration,
    cachedAt: new Date().toISOString(),
  };
  await writeManifest(manifest);

  console.log(`[LoopCache] Cached mood="${mood}" → ${filename}`);
  return manifest.loops[mood];
}

/**
 * refreshAllMoods()
 *
 * Fetches/re-fetches all mood loops. Runs each sequentially to be polite
 * to Freesound's rate limits. Returns a summary object.
 */
export async function refreshAllMoods(moods = Object.keys(MOOD_SEARCH_CONFIG)) {
  const results = {};
  for (const mood of moods) {
    try {
      results[mood] = { ok: true, ...(await fetchAndCacheMood(mood)) };
    } catch (err) {
      console.error(`[LoopCache] Failed mood="${mood}":`, err.message);
      results[mood] = { ok: false, error: err.message };
    }
    // Small delay between Freesound requests to be a good API citizen
    await new Promise((r) => setTimeout(r, 800));
  }
  return results;
}

/**
 * getCachedManifest()
 *
 * Returns the current manifest, falling back to the static frontend placeholder
 * manifest shape when the cache is empty or not yet populated.
 */
export async function getCachedManifest() {
  const manifest = await readManifest();

  // For any mood not yet cached, fall back to the static placeholder WAV
  for (const mood of Object.keys(MOOD_SEARCH_CONFIG)) {
    if (!manifest.loops[mood]) {
      manifest.loops[mood] = {
        file: `/loops/${mood}.wav`,
        label: MOOD_SEARCH_CONFIG[mood].label,
        defaultVolume: MOOD_SEARCH_CONFIG[mood].defaultVolume,
        cached: false,
      };
    }
  }

  return manifest;
}

/**
 * getCachedFilePath(filename)
 *
 * Returns the absolute path to a cached audio file, or null if it doesn't exist.
 */
export async function getCachedFilePath(filename) {
  // Sanitize: only allow safe filenames
  const safe = path.basename(filename);
  if (!/^[a-zA-Z0-9_-]+\.(mp3|wav|ogg)$/.test(safe)) return null;
  const fullPath = path.join(CACHE_DIR, safe);
  try {
    await fs.access(fullPath);
    return fullPath;
  } catch {
    return null;
  }
}

/**
 * getCacheStatus()
 *
 * Returns a summary of what's cached, what's missing, and whether Freesound is configured.
 */
export async function getCacheStatus() {
  const manifest = await readManifest();
  const configured = isFreesoundConfigured();

  const moods = await Promise.all(
    Object.keys(MOOD_SEARCH_CONFIG).map(async (mood) => {
      const entry = manifest.loops[mood];
      let fileExists = false;
      if (entry?.file?.startsWith("/api/loops/audio/")) {
        const filename = path.basename(entry.file);
        fileExists = Boolean(await getCachedFilePath(filename));
      }
      return {
        mood,
        cached: Boolean(entry?.freesoundId) && fileExists,
        freesoundId: entry?.freesoundId || null,
        name: entry?.freesoundName || null,
        license: entry?.license || null,
        cachedAt: entry?.cachedAt || null,
      };
    }),
  );

  return { configured, moods };
}
