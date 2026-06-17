#!/usr/bin/env node
/**
 * testPersonaSfxPlayback.js
 *
 * Verifies that persona SFX are emitted as timeline events (for playback)
 * and not leaked into directed speech text as spoken action markers.
 *
 * Usage:
 *   cd backend && node scripts/testPersonaSfxPlayback.js
 *   cd backend && node scripts/testPersonaSfxPlayback.js --persona-id=12
 *   cd backend && node scripts/testPersonaSfxPlayback.js --name="Rick Sanchez" --tag=burp
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

import { getAllPersonalities, getPersonalityById } from "../models/personalityModel.js";
import { prepareSpeechSynthesis } from "../services/ttsService.js";
import {
  fetchAndCacheSfx,
  getCachedSfxPath,
  isFreesoundConfigured,
  isValidSfxTag,
  normalizeSfxTag,
} from "../services/sfxCacheService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env");

function loadEnvFileIfPresent() {
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const parsed = {
    personaId: null,
    name: "",
    tag: "",
    text: "System check. Keep this short and natural.",
  };

  for (const arg of argv) {
    const [k, ...rest] = String(arg || "").split("=");
    const value = rest.join("=");

    if (k === "--persona-id") parsed.personaId = Number(value);
    else if (k === "--name") parsed.name = String(value || "").trim();
    else if (k === "--tag") parsed.tag = String(value || "").trim();
    else if (k === "--text") parsed.text = String(value || "").trim() || parsed.text;
  }

  return parsed;
}

function selectPersona({ personaId, name }) {
  if (Number.isInteger(personaId)) {
    return getPersonalityById(personaId);
  }

  const all = getAllPersonalities();
  if (!all.length) return null;

  if (name) {
    const normalized = name.toLowerCase();
    const byName = all.find((p) => String(p.name || "").toLowerCase().includes(normalized));
    if (byName) return byName;
  }

  const withSfx = all.find((p) => Array.isArray(p?.vocalMannerisms?.sfxTags) && p.vocalMannerisms.sfxTags.length > 0);
  if (withSfx) return withSfx;

  const rick = all.find((p) => String(p.name || "").toLowerCase().includes("rick"));
  if (rick) return rick;

  return all[0];
}

function uniqueValidTags(inputTags = []) {
  return Array.from(
    new Set(
      (Array.isArray(inputTags) ? inputTags : [])
        .map((tag) => normalizeSfxTag(tag))
        .filter((tag) => isValidSfxTag(tag)),
    ),
  );
}

function hasActionLeakInText(text, tags = []) {
  const source = String(text || "").toLowerCase();
  if (source.includes("[sfx:") || source.includes("[burp]")) return true;

  for (const tag of tags) {
    const token = String(tag || "").replace(/_/g, " ");
    if (!token) continue;
    const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(source)) return true;
  }

  return false;
}

async function verifySfxAudioAvailable(tags = []) {
  const results = [];

  for (const tag of tags) {
    const normalized = normalizeSfxTag(tag);
    if (!normalized) {
      results.push({ tag, ok: false, reason: "invalid_tag" });
      continue;
    }

    let cached = await getCachedSfxPath(normalized);
    if (!cached && isFreesoundConfigured()) {
      try {
        await fetchAndCacheSfx(normalized);
        cached = await getCachedSfxPath(normalized);
      } catch (error) {
        results.push({ tag: normalized, ok: false, reason: String(error?.message || error) });
        continue;
      }
    }

    if (cached) {
      results.push({ tag: normalized, ok: true, path: cached });
    } else {
      results.push({
        tag: normalized,
        ok: false,
        reason: isFreesoundConfigured() ? "not_cached" : "freesound_not_configured",
      });
    }
  }

  return results;
}

async function run() {
  loadEnvFileIfPresent();
  const args = parseArgs(process.argv.slice(2));
  const persona = selectPersona(args);

  if (!persona) {
    console.error("[FAIL] No persona found in database.");
    process.exit(1);
  }

  const requestedTag = normalizeSfxTag(args.tag);
  const personaTags = uniqueValidTags(persona?.vocalMannerisms?.sfxTags || []);
  const selectedTags = uniqueValidTags(requestedTag ? [requestedTag] : personaTags);

  const fallbackTag = String(persona.name || "").toLowerCase().includes("rick") ? "burp" : "chuckle";
  const tags = selectedTags.length ? selectedTags : [fallbackTag];

  const testPersonality = {
    ...persona,
    vocalMannerisms: {
      ...(persona.vocalMannerisms || {}),
      sfxTags: tags,
      sfxFrequency: 1,
      sfxPlacement: "start",
    },
  };

  const synthesis = prepareSpeechSynthesis({
    personality: testPersonality,
    text: args.text,
    voiceProfile: testPersonality.voiceProfile || { engine: "auto" },
    speechHint: "sfx playback verification",
  });

  const directedText = String(synthesis?.directedText || "");
  const timeline = Array.isArray(synthesis?.sfx) ? synthesis.sfx : [];

  const emittedTags = uniqueValidTags(timeline.map((event) => event?.tag));
  const hasTimeline = emittedTags.length > 0;
  const hasMarkerLeak = /\[SFX:[^\]]+\]|\[BURP\]/i.test(directedText);
  const hasActionLeak = hasActionLeakInText(directedText, tags);

  const audioChecks = await verifySfxAudioAvailable(tags);
  const audioOk = audioChecks.every((item) => item.ok);

  console.log("\n=== Persona SFX Playback Diagnostic ===");
  console.log(`Persona: ${persona.name} (id=${persona.id})`);
  console.log(`Test tags: ${tags.join(", ")}`);
  console.log(`Directed text: ${directedText}`);
  console.log(`Timeline tags: ${emittedTags.join(", ") || "(none)"}`);
  console.log("Audio cache checks:");
  for (const check of audioChecks) {
    if (check.ok) console.log(`  ✓ ${check.tag} cached (${check.path})`);
    else console.log(`  ✗ ${check.tag} unavailable (${check.reason})`);
  }

  const passTimeline = hasTimeline;
  const passNoSpokenAction = !hasMarkerLeak && !hasActionLeak;

  console.log("\nChecks:");
  console.log(`  ${passTimeline ? "✓" : "✗"} SFX timeline emitted`);
  console.log(`  ${passNoSpokenAction ? "✓" : "✗"} No spoken action leakage in directed text`);
  console.log(`  ${audioOk ? "✓" : "⚠"} SFX audio file available/cached`);

  if (passTimeline && passNoSpokenAction) {
    console.log("\nPASS: Persona should play SFX actions instead of speaking action markers.");
    process.exit(0);
  }

  console.log("\nFAIL: Persona SFX pipeline check failed.");
  process.exit(1);
}

run().catch((error) => {
  console.error("[FAIL] Diagnostic crashed:", error);
  process.exit(1);
});
