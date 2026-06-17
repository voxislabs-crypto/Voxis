/**
 * testPersonaActual.js
 *
 * Run from backend/:
 *   node scripts/testPersonaActual.js --persona "Rick Sanchez"
 *   node scripts/testPersonaActual.js --id 24 --message "Morty, listen up." --iterations 20 --tts
 *
 * What it checks:
 *  1) Persona exists and has vocal mannerism/SFX config
 *  2) Speech packet generation for your sample text
 *  3) Marker stripping + SFX timeline extraction before TTS
 *  4) SFX cache readiness (and optional prefetch)
 *  5) Optional live TTS generation with SFX metadata output
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { getAllPersonalities, getPersonalityById } from "../models/personalityModel.js";
import { buildSpeechPacket } from "../services/speechDirector.js";
import { prepareSpeechSynthesis, generateSpeechAudio } from "../services/ttsService.js";
import {
  fetchAndCacheSfx,
  getCachedSfxPath,
  isFreesoundConfigured,
  isValidSfxTag,
  normalizeSfxTag,
} from "../services/sfxCacheService.js";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function pass(msg) { console.log(`  ${GREEN}OK${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${RED}FAIL${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}WARN${RESET} ${msg}`); }
function info(msg) { console.log(`  ${CYAN}INFO${RESET} ${msg}`); }
function section(title) { console.log(`\n${BOLD}${title}${RESET}`); }

function loadDotEnvIfPresent() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!existsSync(envPath)) {
    warn("No backend/.env found. Using current process environment.");
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }

  pass(`Loaded env from ${envPath}`);
}

function parseArgs(argv) {
  const args = {
    id: null,
    personaName: "",
    message: "Morty, listen up. We are doing a systems check.",
    iterations: 16,
    runTts: false,
    prefetchMissingSfx: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--id") {
      args.id = Number(argv[i + 1]);
      i += 1;
    } else if (a === "--persona") {
      args.personaName = String(argv[i + 1] || "").trim();
      i += 1;
    } else if (a === "--message") {
      args.message = String(argv[i + 1] || "").trim() || args.message;
      i += 1;
    } else if (a === "--iterations") {
      const n = Number(argv[i + 1]);
      args.iterations = Number.isFinite(n) && n > 0 ? Math.min(200, Math.floor(n)) : args.iterations;
      i += 1;
    } else if (a === "--tts") {
      args.runTts = true;
    } else if (a === "--prefetch") {
      args.prefetchMissingSfx = true;
    }
  }

  return args;
}

function findPersona({ id, personaName }) {
  if (Number.isInteger(id)) {
    return getPersonalityById(id, null);
  }

  const list = getAllPersonalities(null);
  if (!Array.isArray(list) || list.length === 0) return null;

  if (!personaName) return list[0];

  const q = personaName.toLowerCase();
  return list.find((p) => String(p?.name || "").toLowerCase() === q)
    || list.find((p) => String(p?.name || "").toLowerCase().includes(q))
    || null;
}

async function inspectSfxCache(tags, { prefetchMissingSfx }) {
  section("SFX Cache Readiness");

  if (!tags.length) {
    warn("Persona has no SFX tags configured.");
    return;
  }

  info(`Configured tags: ${tags.join(", ")}`);
  info(`FREESOUND_API_KEY configured: ${isFreesoundConfigured() ? "yes" : "no"}`);

  for (const tag of tags) {
    const cachedPath = await getCachedSfxPath(tag);
    if (cachedPath) {
      pass(`${tag} cached at ${cachedPath}`);
      continue;
    }

    warn(`${tag} is not cached.`);
    if (prefetchMissingSfx) {
      if (!isFreesoundConfigured()) {
        fail(`Cannot prefetch ${tag}; FREESOUND_API_KEY missing.`);
        continue;
      }
      try {
        const downloaded = await fetchAndCacheSfx(tag);
        pass(`${tag} downloaded to ${downloaded}`);
      } catch (error) {
        fail(`${tag} prefetch failed: ${String(error?.message || error)}`);
      }
    }
  }
}

async function main() {
  loadDotEnvIfPresent();
  const options = parseArgs(process.argv.slice(2));

  section("Persona Lookup");
  const persona = findPersona(options);
  if (!persona) {
    fail("No matching persona found. Pass --id <number> or --persona \"Name\".");
    process.exitCode = 1;
    return;
  }

  pass(`Using persona: ${persona.name} (id=${persona.id})`);

  const vocalMannerisms = persona?.vocalMannerisms && typeof persona.vocalMannerisms === "object"
    ? persona.vocalMannerisms
    : {};
  const rawTags = Array.isArray(vocalMannerisms.sfxTags) ? vocalMannerisms.sfxTags : [];
  const normalizedTags = Array.from(new Set(
    rawTags
      .map((tag) => normalizeSfxTag(tag))
      .filter((tag) => tag && isValidSfxTag(tag)),
  ));

  info(`SFX frequency: ${Number(vocalMannerisms.sfxFrequency ?? 0.25)}`);
  info(`SFX placement: ${String(vocalMannerisms.sfxPlacement || "random")}`);

  await inspectSfxCache(normalizedTags, options);

  section("Speech Packet Test");
  const packet = buildSpeechPacket(options.message, persona, null, {
    styleMode: "performance",
    channel: "tts",
    appendInjectedPhrase: false,
  });

  info(`Input text: ${options.message}`);
  info(`Speech output: ${packet.speech}`);
  info(`SFX events: ${JSON.stringify(packet.sfx || [])}`);

  const synthesized = prepareSpeechSynthesis({
    personality: persona,
    text: options.message,
    voiceProfile: persona.voiceProfile || {},
    speechHint: "",
  });

  info(`Directed text (TTS input): ${synthesized.directedText}`);
  info(`Timeline before TTS: ${JSON.stringify(synthesized.sfx || [])}`);

  section("Injection Probability Check");
  let injectedCount = 0;
  for (let i = 0; i < options.iterations; i += 1) {
    const probe = buildSpeechPacket(`${options.message} [probe ${i}]`, persona, null, {
      styleMode: "performance",
      channel: "tts",
      appendInjectedPhrase: false,
    });
    if (Array.isArray(probe.sfx) && probe.sfx.length > 0) {
      injectedCount += 1;
    }
  }
  const ratio = (injectedCount / options.iterations) * 100;
  info(`SFX injected in ${injectedCount}/${options.iterations} probes (${ratio.toFixed(1)}%)`);

  if (options.runTts) {
    section("Live TTS Generation Check");
    try {
      const audio = await generateSpeechAudio({
        personality: persona,
        text: options.message,
        voiceProfile: persona.voiceProfile || {},
      });
      pass(`Generated audio (${audio.contentType}, ${audio.buffer?.length || 0} bytes) via ${audio.engine}`);
      info(`Returned SFX timeline: ${JSON.stringify(audio.sfx || [])}`);
    } catch (error) {
      fail(`Live TTS generation failed: ${String(error?.message || error)}`);
      process.exitCode = 1;
    }
  } else {
    info("Skipped live TTS call. Pass --tts to run real synthesis.");
  }

  section("Result");
  pass("Persona behavior diagnostic completed.");
  info("If timeline exists but no audible SFX in UI, run frontend chat playback and check browser console/network for /api/sfx/audio/:name.");
}

main().catch((error) => {
  fail(`Unhandled error: ${String(error?.message || error)}`);
  process.exitCode = 1;
});
