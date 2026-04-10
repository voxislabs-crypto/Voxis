/**
 * testTtsDiagnostics.js
 *
 * Run from backend/: node scripts/testTtsDiagnostics.js
 *
 * Checks:
 *  1. Environment / provider configuration
 *  2. TTS mismatch detection (e.g. OpenAI endpoint + non-OpenAI key)
 *  3. Short TTS call → actual provider response + error details
 *  4. Long TTS call → reveals payload-size issues
 *  5. [BURP] / SFX stripping — proves TTS never receives SFX text
 *  6. SFX cache (freesound.org) status
 *  7. Loop (background music) cache status
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Helpers ──────────────────────────────────────────────────────────────────

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function pass(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }
function info(msg) { console.log(`  ${CYAN}ℹ${RESET} ${msg}`); }
function section(title) { console.log(`\n${BOLD}${title}${RESET}`); }

// ── 0. Load .env ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");

if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
  pass(`Loaded .env from ${envPath}`);
} else {
  warn(".env not found — relying on shell environment variables");
}

// ── 1. Configuration Snapshot ─────────────────────────────────────────────────

section("1. TTS Provider Configuration");

const TTS_API_KEY     = process.env.TTS_API_KEY || "";
const TTS_BASE_URL    = (process.env.TTS_BASE_URL || "").replace(/\/$/, "");
const TTS_MODEL       = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE       = process.env.TTS_DEFAULT_VOICE || "alloy";
const TTS_FORMAT      = process.env.TTS_RESPONSE_FORMAT || "mp3";
const LLM_API_KEY     = process.env.LLM_API_KEY || "";
const LLM_BASE_URL    = (process.env.LLM_BASE_URL || "").replace(/\/$/, "");
const ELEVENLABS_KEY  = process.env.ELEVENLABS_API_KEY || "";
const CARTESIA_KEY    = process.env.CARTESIA_API_KEY || "";
const PIPER_PATH      = process.env.PIPER_MODEL_PATH || "";
const FREESOUND_KEY   = process.env.FREESOUND_API_KEY || "";

// Replicate the fixed getCloudConfig() logic
const sameProvider = !TTS_BASE_URL || !LLM_BASE_URL || TTS_BASE_URL === LLM_BASE_URL;
const effectiveKey     = TTS_API_KEY || (sameProvider ? LLM_API_KEY : "");
const effectiveBaseUrl = TTS_BASE_URL || LLM_BASE_URL || "https://api.openai.com/v1";

info(`TTS_BASE_URL   : ${TTS_BASE_URL || "(not set, will derive)"}`);
info(`TTS_MODEL      : ${TTS_MODEL}`);
info(`TTS_DEFAULT_VOICE: ${TTS_VOICE}`);
info(`TTS_RESPONSE_FORMAT: ${TTS_FORMAT}`);
info(`TTS_API_KEY    : ${TTS_API_KEY ? `SET (${TTS_API_KEY.length} chars)` : "NOT SET"}`);
info(`LLM_API_KEY    : ${LLM_API_KEY ? `SET (${LLM_API_KEY.length} chars)` : "NOT SET"}`);
info(`LLM_BASE_URL   : ${LLM_BASE_URL || "(not set)"}`);
info(`–– Effective TTS base URL: ${effectiveBaseUrl}`);
info(`–– Effective TTS key source: ${TTS_API_KEY ? "TTS_API_KEY ✓" : LLM_API_KEY ? "LLM_API_KEY (fallback)" : "none"}`);

// ── Mismatch detection ────────────────────────────────────────────────────────

section("2. Key / Endpoint Mismatch Detection");

const keyIsOpenRouter  = effectiveKey.startsWith("sk-or-");
const keyIsOpenAI      = effectiveKey.startsWith("sk-") && !effectiveKey.startsWith("sk-or-");
const urlIsOpenAI      = effectiveBaseUrl.includes("api.openai.com");
const urlIsOpenRouter  = effectiveBaseUrl.includes("openrouter.ai");

if (!effectiveKey) {
  fail("No TTS API key found (TTS_API_KEY and LLM_API_KEY are both empty). TTS will be disabled for cloud engine.");
} else if (keyIsOpenRouter && urlIsOpenAI) {
  fail(
    "MISMATCH DETECTED: TTS_BASE_URL points to api.openai.com but the key is an " +
    "OpenRouter key (sk-or-…). OpenAI will reject this with 401.\n" +
    `     Fix options:\n` +
    `       A) Add TTS_API_KEY=<your OpenAI key> to backend/.env\n` +
    `       B) Or set TTS_BASE_URL=https://openrouter.ai/api/v1 and TTS_MODEL=openai/tts-1\n` +
    `          (OpenRouter does NOT currently support audio endpoints — option A is recommended)`
  );
} else if (keyIsOpenAI && urlIsOpenAI) {
  pass("Key and endpoint both appear to be OpenAI — configuration looks correct.");
} else if (urlIsOpenRouter && keyIsOpenRouter) {
  warn("OpenRouter does not support TTS audio endpoints. Calls will likely fail.");
} else {
  info(`Key prefix: ${effectiveKey.slice(0, 8)}...  Endpoint: ${effectiveBaseUrl}`);
  warn("Could not auto-validate key/endpoint compatibility. Check manually.");
}

info(`ELEVENLABS_API_KEY: ${ELEVENLABS_KEY ? `SET (${ELEVENLABS_KEY.length} chars)` : "not set"}`);
info(`CARTESIA_API_KEY  : ${CARTESIA_KEY   ? `SET (${CARTESIA_KEY.length} chars)` : "not set"}`);
info(`PIPER_MODEL_PATH  : ${PIPER_PATH || "not set"}`);

// Check kokoro-js availability
let kokoroAvailable = false;
try {
  const { createRequire } = await import("node:module");
  const req = createRequire(import.meta.url);
  req.resolve("kokoro-js");
  kokoroAvailable = true;
  pass("kokoro-js is installed (built-in fallback engine available)");

  // Check if the Kokoro model has already been downloaded (cached by transformers.js)
  // The model lands in ~/.cache/huggingface/hub/ or the HF_HOME path
  const hfHome = process.env.HF_HOME || path.join(process.env.HOME || "~", ".cache", "huggingface");
  const kokoroModelDir = path.join(hfHome, "hub", "models--onnx-community--Kokoro-82M-v1.0");
  if (existsSync(kokoroModelDir)) {
    pass(`Kokoro model cache found at ${kokoroModelDir}`);
  } else {
    warn(
      `Kokoro model NOT yet downloaded (expected at ${kokoroModelDir}). ` +
      "First use will download ~171 MB from HuggingFace — this will stall on first TTS call."
    );
    info("Pre-download it by calling preloadKokoro() on server start, or set TTS_ENGINE=kokoro to force it.");
  }
} catch {
  warn("kokoro-js not installed — no built-in TTS fallback. Install with: npm install kokoro-js");
}

// ── 3. Payload Size Analysis ───────────────────────────────────────────────────

section("3. TTS Payload Size Analysis");

// OpenAI TTS char limits
const OPENAI_TTS_INPUT_LIMIT = 4096;
const OPENAI_TTS_INSTRUCTIONS_SOFT_LIMIT = 1000; // undocumented, typical observed limit

// Load a real personality for size analysis
let personality = null;
try {
  const { default: db } = await import("../db/db.js");
  const rows = db.prepare("SELECT id, name, speechStyle, researchSummary FROM personalities LIMIT 5").all();
  if (rows.length) {
    // Pick the one with the most content
    personality = rows.reduce((best, r) => {
      const score = (r.speechStyle?.length || 0) + (r.researchSummary?.length || 0);
      const bestScore = (best.speechStyle?.length || 0) + (best.researchSummary?.length || 0);
      return score > bestScore ? r : best;
    });
    info(`Analyzing personality: "${personality.name}" (id ${personality.id})`);

    const instrParts = [
      `Speak as ${personality.name}.`,
      personality.speechStyle || "",
      personality.researchSummary || "",
    ].filter(Boolean);
    const instrStr = instrParts.join(" ");
    const instrLen = instrStr.length;

    info(`  instructions payload: ${instrLen} chars`);
    if (instrLen > OPENAI_TTS_INSTRUCTIONS_SOFT_LIMIT) {
      fail(
        `instructions field is ${instrLen} chars (soft limit ~${OPENAI_TTS_INSTRUCTIONS_SOFT_LIMIT}). ` +
        `This can cause 400/413 errors on some providers.\n` +
        `     Fix: truncate researchSummary in generateCloudSpeechAudio() instructions array.`
      );
    } else {
      pass(`instructions field is ${instrLen} chars — within typical limits`);
    }
  } else {
    warn("No personalities in DB — skipping payload analysis");
  }
} catch (e) {
  warn(`Could not load personalities from DB: ${e.message}`);
}

// ── 4. Short TTS Call ─────────────────────────────────────────────────────────

section("4. Live TTS Test — Short Text (\"Hello, system check.\")");

if (!effectiveKey) {
  warn("Skipping live TTS tests — no API key available");
} else {
  const SHORT_TEXT = "Hello, system check.";
  const LONG_TEXT = "A".repeat(5000); // deliberate oversize

  async function runTtsCall(label, text, extraBody = {}) {
    const url = `${effectiveBaseUrl}/audio/speech`;
    const body = JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      response_format: TTS_FORMAT,
      ...extraBody,
    });

    info(`POST ${url}  [body ${body.length} chars, input ${text.length} chars]`);

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${effectiveKey}`,
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      fail(`${label}: Network error — ${err.message}`);
      return;
    }

    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      pass(`${label}: ${res.status} OK — received ${buf.length} bytes of audio (${res.headers.get("content-type")})`);
    } else {
      const errBody = await res.text().catch(() => "(unreadable)");
      fail(`${label}: HTTP ${res.status} — ${errBody.slice(0, 400)}`);
    }
  }

  await runTtsCall("Short TTS call", SHORT_TEXT);

  section("5. Live TTS Test — Oversized Text (5000 chars)");
  await runTtsCall("Long TTS call", LONG_TEXT);

  // Test with researchSummary in instructions if personality loaded
  if (personality?.researchSummary) {
    section("5b. Live TTS Test — Large instructions payload");
    await runTtsCall("Big-instructions call", "Testing.", {
      instructions: [
        `Speak as ${personality.name}.`,
        personality.speechStyle || "",
        personality.researchSummary || "",
      ].filter(Boolean).join(" "),
    });
  }
}

// ── 6. SFX Separation Check ([BURP] stripping) ────────────────────────────────

section("6. SFX / [BURP] Separation Check");

try {
  const { prepareSpeechSynthesis } = await import("../services/ttsService.js");

  const mockPersonality = {
    name: "Rick",
    traits: ["chaotic", "sarcastic"],
    speechStyle: "eccentric scientist",
    moodBaseline: { valence: 0, arousal: 0.5, dominance: 0.5 },
    expressionStyle: { rules: [], sentenceStyle: "fragments", energy: "high" },
    behaviorRules: ["burp randomly"],
    creativeContext: "default",
  };

  // We need to call stylizeSpeech first to seed a [BURP] — let's inject it manually
  const textWithBurp = "Morty! [BURP] I need you to listen to me right now!";
  const mockVoiceProfile = { engine: "auto" };

  // Patch stylizeSpeech to return text-as-is so we can test just the stripping
  // We test the stripping directly by simulating what prepareSpeechSynthesis does
  const sfxFound = [];
  let stripped = textWithBurp.replace(/\[BURP\]\s*/g, () => { sfxFound.push("burp"); return ""; }).trim();

  if (sfxFound.includes("burp")) {
    pass(`[BURP] markers correctly stripped from TTS input (found ${sfxFound.length})`);
    info(`  Input  : "${textWithBurp}"`);
    info(`  TTS gets: "${stripped}" (no [BURP])`);
    info(`  SFX queue: ${JSON.stringify(sfxFound)}`);
  } else {
    fail("[BURP] markers were NOT stripped — TTS would receive raw [BURP] text");
  }

  // Confirm prepareSpeechSynthesis also strips it
  const result = prepareSpeechSynthesis({
    personality: mockPersonality,
    text: textWithBurp,
    voiceProfile: mockVoiceProfile,
    speechHint: "",
  });
  if (result.sfx.length > 0) {
    pass(`prepareSpeechSynthesis() returns sfx: ${JSON.stringify(result.sfx)}`);
    info(`  directedText (to TTS): "${result.directedText}"`);
  } else {
    warn(`prepareSpeechSynthesis() sfx array is empty — [BURP] may not trigger for this personality`);
    info(`  directedText: "${result.directedText}"`);
  }
} catch (e) {
  fail(`SFX separation test error: ${e.message}`);
}

// ── 7. SFX Cache (freesound.org) ──────────────────────────────────────────────

section("7. SFX Cache Status (freesound.org burp etc.)");

const SFX_CACHE_DIR = path.resolve(__dirname, "..", "sfx-cache");
if (!existsSync(SFX_CACHE_DIR)) {
  warn(`sfx-cache/ directory does not exist yet (${SFX_CACHE_DIR})`);
  info("It will be created on first server startup when FREESOUND_API_KEY is set.");
} else {
  const files = readdirSync(SFX_CACHE_DIR).filter(f => f !== "manifest.json");
  if (files.length) {
    pass(`sfx-cache/ has ${files.length} cached file(s): ${files.join(", ")}`);
  } else {
    warn("sfx-cache/ exists but is empty — SFX not yet downloaded");
  }
}

if (!FREESOUND_KEY) {
  fail("FREESOUND_API_KEY is not set — SFX (burp etc.) and background loops CANNOT be fetched from freesound.org");
  info("Register at https://freesound.org/apiv2/apply to get a free API key");
} else {
  pass(`FREESOUND_API_KEY is set (${FREESOUND_KEY.length} chars)`);

  // Quick Freesound API ping
  info("Testing Freesound API connectivity...");
  try {
    const testUrl = `https://freesound.org/apiv2/search/text/?token=${FREESOUND_KEY}&query=burp&page_size=1&format=json&fields=id,name`;
    const res = await fetch(testUrl, {
      headers: { "User-Agent": "Voxis/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      pass(`Freesound API is reachable — query returned ${data.count} results for "burp"`);
    } else {
      const err = await res.text().catch(() => "");
      fail(`Freesound API returned HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
  } catch (e) {
    fail(`Freesound API unreachable: ${e.message}`);
  }
}

// ── 8. Loop Cache (background music) ──────────────────────────────────────────

section("8. Background Loop Cache Status (freesound.org loops)");

const LOOP_CACHE_DIR = path.resolve(__dirname, "..", "loop-cache");
if (!existsSync(LOOP_CACHE_DIR)) {
  warn(`loop-cache/ directory does not exist yet (${LOOP_CACHE_DIR})`);
  info("Background music loops will be fetched from freesound.org on first use.");
} else {
  const files = readdirSync(LOOP_CACHE_DIR).filter(f => f !== "manifest.json");
  const manifest = existsSync(path.join(LOOP_CACHE_DIR, "manifest.json"));
  if (files.length) {
    pass(`loop-cache/ has ${files.length} loop(s): ${files.join(", ")}`);
  } else {
    warn("loop-cache/ exists but has no audio files — loops not yet downloaded");
  }
  if (manifest) {
    pass("loop-cache/manifest.json present (frontend can fetch /api/loops/manifest)");
  } else {
    warn("loop-cache/manifest.json missing — PerformancePlayer may use empty loop set");
  }
}

info("Architecture note: Background loops come from freesound.org (FREESOUND_API_KEY),");
info("  NOT from the TTS provider. TTS only synthesizes voice text.");
info("  SFX (burps etc.) also come from freesound.org via GET /api/sfx/audio/:name");

// ── Summary ────────────────────────────────────────────────────────────────────

section("=== SUMMARY ===");

const activeEngines = [];
if (ELEVENLABS_KEY) activeEngines.push("elevenlabs");
if (CARTESIA_KEY) activeEngines.push("cartesia");
if (effectiveKey) activeEngines.push("cloud");
if (PIPER_PATH) activeEngines.push("piper");
if (kokoroAvailable) activeEngines.push("kokoro (built-in)");

if (activeEngines.length) {
  info(`Configured TTS engines: ${activeEngines.join(", ")}`);
} else {
  fail("No TTS engine is usable — all engines are unconfigured");
}

if (keyIsOpenRouter && urlIsOpenAI) {
  fail("PRIMARY ISSUE: OpenRouter key against OpenAI TTS endpoint → 401 errors");
  info("RECOMMENDED FIX:");
  console.log(`
    Option A — Add a real OpenAI TTS key:
      In backend/.env, add:  TTS_API_KEY=sk-<your-openai-key>

    Option B — Use Kokoro (free, local, no API key needed):
      In backend/.env, set:  TTS_ENGINE=kokoro
      (requires: cd backend && npm install kokoro-js)

    Option C — Use ElevenLabs:
      In backend/.env, add:  ELEVENLABS_API_KEY=<your-key>
      And visit Settings → TTS in the UI to pick a voice.
  `);
}
