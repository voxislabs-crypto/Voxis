import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { buildSpeechPacket } from "./speechDirector.js";
import { applyMoodToVoice, buildEmotionalVoiceInstruction } from "./moodVoice.js";
import {
  compileProsodyEnvelope,
  applyGenericProsodyText,
  applyProsodyToElevenLabsText,
} from "./prosodyCompiler.js";
import { shapeForKokoro } from "./kokoroShaper.js";
import { interpretEmotionSpectrum } from "./emotionSpectrum.js";
import { splitIntoChunks } from "./chunkSpeech.js";
import { getKokoroHfToken, getKokoroLocalPath, getTtsCredential, getVoiceDefaults } from "../models/settingsModel.js";
import { cleanLyricsForTts } from "./singingEngine.js";
import { synthesizeOpenVoice } from "./openVoiceAdapter.js";
import { convertWithRvc } from "./rvcAdapter.js";
import { getPersonalityCloneMeta } from "../models/voiceCloneModel.js";

const require = createRequire(import.meta.url);

// Kokoro — lazy-loaded singleton. Model (~171 MB for q8) downloads from HuggingFace on first use.
let _kokoroTts = null;
let _kokoroInitPromise = null;
let _kokoroModule = null;
let _kokoroImportError = null;
let _kokoroLoadError = null;
const MAX_TTS_RESPONSE_CACHE_ENTRIES = 64;
const ttsResponseCache = new Map();

const DEFAULT_TTS_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "alloy";
const DEFAULT_TTS_FORMAT = "mp3";
const DEFAULT_FETCH_TIMEOUT_MS = 9000;
const DEFAULT_ELEVENLABS_TIMEOUT_MS = 18000;
const MAX_ELEVENLABS_TIMEOUT_MS = 60000;
const DEFAULT_CARTESIA_TIMEOUT_MS = 16000;
const MAX_CARTESIA_TIMEOUT_MS = 45000;
const DEFAULT_CARTESIA_VOICE_ID = "694f9389-aac1-45b6-b726-9d9369183238";
const DEFAULT_CARTESIA_MODEL = "sonic-3";
const DEFAULT_PIPER_TIMEOUT_MS = 90_000;
const MIN_PIPER_TIMEOUT_MS = 30_000;
const MAX_PIPER_TIMEOUT_MS = 180_000;
const DEFAULT_KOKORO_LOAD_TIMEOUT_MS = 25_000;
const DEFAULT_KOKORO_GENERATE_TIMEOUT_MS = 30_000;
const DEFAULT_REALISM_FFMPEG_TIMEOUT_MS = 15_000;
const LOCKED_TTS_ENGINES = Object.freeze(["kokoro", "cartesia"]);
const CARTESIA_MODEL_FALLBACKS = Object.freeze([
  { id: "sonic-3", label: "sonic-3" },
  { id: "sonic-3-latest", label: "sonic-3-latest" },
  { id: "sonic-2", label: "sonic-2" },
  { id: "sonic-turbo", label: "sonic-turbo" },
]);
const REALISM_PRESETS = Object.freeze(["cinematic", "conversational", "intimate", "energetic"]);

let _ffmpegAvailable = null;

export const TTS_ENGINE_CAPABILITIES = Object.freeze({
  elevenlabs: Object.freeze({
    label: "ElevenLabs",
    nativeControls: ["rate", "style", "stability", "similarityBoost"],
    textShaping: true,
    emphasis: true,
    identityFallback: true,
  }),
  cartesia: Object.freeze({
    label: "Cartesia",
    nativeControls: [],
    textShaping: true,
    emphasis: true,
    identityFallback: false,
  }),
  cloud: Object.freeze({
    label: "Cloud",
    nativeControls: ["speed", "instructions"],
    textShaping: true,
    emphasis: true,
    identityFallback: true,
  }),
  piper: Object.freeze({
    label: "Piper",
    nativeControls: ["lengthScale", "noiseScale", "noiseW"],
    textShaping: true,
    emphasis: true,
    identityFallback: true,
  }),
  kokoro: Object.freeze({
    label: "Kokoro",
    nativeControls: ["rate", "pauseProfile"],
    textShaping: true,
    emphasis: true,
    identityFallback: true,
  }),
});

function getAllowedTtsEngines() {
  if (isTtsDebugProviderLockEnabled()) {
    if (isTtsDisableKokoroEnabled()) {
      return ["cartesia"];
    }
    return LOCKED_TTS_ENGINES;
  }

  return isTtsDisableKokoroEnabled()
    ? ["cartesia", "elevenlabs", "cloud", "piper", "openvoice", "kokoro-rvc"]
    : ["kokoro", "cartesia", "elevenlabs", "cloud", "piper", "openvoice", "kokoro-rvc"];
}

function isTtsDebugProviderLockEnabled() {
  return String(process.env.TTS_DEBUG_PROVIDER_LOCK ?? "true").trim().toLowerCase() !== "false";
}

function isTtsDisableKokoroEnabled() {
  return String(process.env.TTS_DISABLE_KOKORO ?? "false").trim().toLowerCase() === "true";
}

function isAllowedTtsEngine(engine) {
  return getAllowedTtsEngines().includes(String(engine || "").trim().toLowerCase());
}

function buildTtsResponseCacheKey({ personality, text, voiceProfile, speechHint, directedText, adjustedVoiceProfile }) {
  return JSON.stringify({
    personalityId: Number(personality?.id || 0),
    moodState: personality?.moodState ?? null,
    expressionStyle: personality?.expressionStyle ?? null,
    vocalMannerisms: personality?.vocalMannerisms ?? null,
    text: String(text || "").trim(),
    speechHint: String(speechHint || "").trim(),
    directedText: String(directedText || "").trim(),
    voiceProfile: adjustedVoiceProfile || voiceProfile || {},
  });
}

function getCachedTtsResponse(cacheKey) {
  return ttsResponseCache.get(cacheKey) || null;
}

function setCachedTtsResponse(cacheKey, value) {
  if (!cacheKey || !value) {
    return;
  }

  if (ttsResponseCache.has(cacheKey)) {
    ttsResponseCache.delete(cacheKey);
  } else if (ttsResponseCache.size >= MAX_TTS_RESPONSE_CACHE_ENTRIES) {
    const oldestKey = ttsResponseCache.keys().next().value;
    ttsResponseCache.delete(oldestKey);
  }

  ttsResponseCache.set(cacheKey, value);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithTimeoutRetry(url, options = {}, { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, retries = 0 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
    }
  }

  throw lastError || new Error("Request failed.");
}

async function readResponseBodyWithTimeout(response, reader, timeoutMs, label = "response body") {
  let timer = null;

  try {
    return await Promise.race([
      reader(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Request timed out while reading ${label} after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function getCloudConfig() {
  const ttsBaseUrl = (process.env.TTS_BASE_URL || "").replace(/\/$/, "");
  const llmBaseUrl = (process.env.LLM_BASE_URL || "").replace(/\/$/, "");
  const defaultBaseUrl = DEFAULT_TTS_BASE_URL;

  // Use TTS_BASE_URL if set, otherwise fall back to LLM_BASE_URL, then the default.
  const baseUrl = (ttsBaseUrl || llmBaseUrl || defaultBaseUrl);

  // Only use LLM_API_KEY as a TTS key fallback when the TTS and LLM base URLs are
  // from the same provider (or when TTS_BASE_URL isn't explicitly set to a different
  // provider). This prevents an OpenRouter LLM key being sent to api.openai.com, which
  // always results in a 401 because OpenRouter keys are not valid OpenAI credentials.
  const sameProvider = !ttsBaseUrl || !llmBaseUrl || ttsBaseUrl === llmBaseUrl;
  const apiKey = process.env.TTS_API_KEY || (sameProvider ? process.env.LLM_API_KEY : "") || "";

  return {
    baseUrl,
    apiKey,
    model: process.env.TTS_MODEL || DEFAULT_TTS_MODEL,
    voice: process.env.TTS_DEFAULT_VOICE || DEFAULT_TTS_VOICE,
    format: process.env.TTS_RESPONSE_FORMAT || DEFAULT_TTS_FORMAT,
  };
}

export function getEngineCapabilities(engine) {
  return TTS_ENGINE_CAPABILITIES[String(engine || "").trim().toLowerCase()] || null;
}

function getPiperConfig() {
  return {
    command: process.env.PIPER_COMMAND || "piper",
    modelPath: String(process.env.PIPER_MODEL_PATH || "").trim(),
    speaker: String(process.env.PIPER_SPEAKER || "").trim(),
    timeoutMs: getPiperTimeoutMs(),
  };
}

function getPiperTimeoutMs(text = "") {
  const configuredTimeout = Number(process.env.PIPER_TIMEOUT_MS || DEFAULT_PIPER_TIMEOUT_MS);
  const safeConfiguredTimeout = Number.isFinite(configuredTimeout)
    ? Math.max(MIN_PIPER_TIMEOUT_MS, Math.round(configuredTimeout))
    : DEFAULT_PIPER_TIMEOUT_MS;
  const textLength = String(text || "").trim().length;

  if (!textLength) {
    return safeConfiguredTimeout;
  }

  const scaledTimeout = 20_000 + (textLength * 120);
  return Math.min(MAX_PIPER_TIMEOUT_MS, Math.max(safeConfiguredTimeout, scaledTimeout));
}

function getCartesiaTimeoutMs(text = "") {
  const normalizedText = String(text || "").trim();
  const textLength = normalizedText.length;

  const scaledTimeout = textLength <= 120
    ? DEFAULT_CARTESIA_TIMEOUT_MS
    : Math.min(MAX_CARTESIA_TIMEOUT_MS, DEFAULT_CARTESIA_TIMEOUT_MS + ((textLength - 120) * 55));

  // Reserve explicit fallback headroom so Cartesia stalls cannot consume the
  // whole request budget and force an outer backend timeout.
  const outerBudget = Number(process.env.TTS_REQUEST_TIMEOUT_MS) || 60000;
  const reservedFallbackMs = 12000;
  const budgetCap = Math.max(8000, outerBudget - reservedFallbackMs);
  const cap = Math.max(10000, Math.min(22000, budgetCap));
  return Math.min(scaledTimeout, cap);
}

function getElevenLabsTimeoutMs(text = "") {
  const configuredTimeout = Number(process.env.ELEVENLABS_TIMEOUT_MS || DEFAULT_ELEVENLABS_TIMEOUT_MS);
  const safeConfiguredTimeout = Number.isFinite(configuredTimeout)
    ? Math.max(DEFAULT_ELEVENLABS_TIMEOUT_MS, Math.round(configuredTimeout))
    : DEFAULT_ELEVENLABS_TIMEOUT_MS;

  const textLength = String(text || "").trim().length;
  if (!textLength) {
    return safeConfiguredTimeout;
  }

  // ElevenLabs latency rises noticeably with longer prompts and higher-quality models.
  const scaledTimeout = textLength <= 140
    ? safeConfiguredTimeout
    : Math.min(MAX_ELEVENLABS_TIMEOUT_MS, safeConfiguredTimeout + ((textLength - 140) * 45));

  // Reserve headroom so long EL requests don't get killed by the outer backend timeout.
  const outerBudget = Number(process.env.TTS_REQUEST_TIMEOUT_MS) || 60000;
  const reservedFallbackMs = 8000;
  const budgetCap = Math.max(10000, outerBudget - reservedFallbackMs);
  const cap = Math.min(MAX_ELEVENLABS_TIMEOUT_MS, budgetCap);

  return Math.max(safeConfiguredTimeout, Math.min(scaledTimeout, cap));
}

function clampPiperPauseMs(pauseMs, voiceProfile = {}) {
  const arousal = Number(voiceProfile?.moodArousal);
  const boundedArousal = Number.isFinite(arousal) ? Math.max(0, Math.min(1, arousal)) : 0.5;
  const pauseScale = 1.18 - (boundedArousal * 0.42);
  const minPauseMs = 90;
  const maxPauseMs = 900;
  return Math.round(Math.max(minPauseMs, Math.min(maxPauseMs, Number(pauseMs || 0) * pauseScale)));
}

export function planPiperChunkSynthesis(text, voiceProfile = {}) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return [];
  }

  const chunks = splitIntoChunks(normalized, {
    minPauseMs: 100,
    maxPauseMs: 700,
  });

  if (chunks.length <= 1) {
    return [{ text: normalized, pauseMs: 0 }];
  }

  return chunks.map((chunk, index) => ({
    text: chunk.text,
    pauseMs: index === chunks.length - 1 ? 0 : clampPiperPauseMs(chunk.pauseMs, voiceProfile),
  }));
}

function parseWavBuffer(buffer) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (input.length < 44 || input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Unsupported WAV buffer.");
  }

  let offset = 12;
  let fmt = null;
  let data = null;

  while (offset + 8 <= input.length) {
    const chunkId = input.toString("ascii", offset, offset + 4);
    const chunkSize = input.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > input.length) {
      break;
    }

    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: input.readUInt16LE(chunkStart),
        numChannels: input.readUInt16LE(chunkStart + 2),
        sampleRate: input.readUInt32LE(chunkStart + 4),
        byteRate: input.readUInt32LE(chunkStart + 8),
        blockAlign: input.readUInt16LE(chunkStart + 12),
        bitsPerSample: input.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === "data") {
      data = input.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!fmt || !data) {
    throw new Error("WAV buffer is missing fmt or data chunks.");
  }

  return { ...fmt, data };
}

function createWavBuffer({ audioFormat, numChannels, sampleRate, byteRate, blockAlign, bitsPerSample, data }) {
  const pcmData = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(audioFormat, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

function createSilenceBuffer(durationMs, format) {
  const boundedMs = Math.max(0, Math.round(Number(durationMs) || 0));
  if (!boundedMs) {
    return Buffer.alloc(0);
  }

  const frameCount = Math.round((format.sampleRate * boundedMs) / 1000);
  const byteLength = frameCount * format.blockAlign;
  const fill = format.audioFormat === 1 && format.bitsPerSample === 8 ? 128 : 0;
  return Buffer.alloc(byteLength, fill);
}

export function concatenateWavBuffers(buffers, pauseDurationsMs = []) {
  const parsed = buffers.map(parseWavBuffer);
  if (!parsed.length) {
    throw new Error("At least one WAV buffer is required.");
  }

  const base = parsed[0];
  for (const candidate of parsed.slice(1)) {
    if (
      candidate.audioFormat !== base.audioFormat ||
      candidate.numChannels !== base.numChannels ||
      candidate.sampleRate !== base.sampleRate ||
      candidate.blockAlign !== base.blockAlign ||
      candidate.bitsPerSample !== base.bitsPerSample
    ) {
      throw new Error("Cannot concatenate WAV buffers with different audio formats.");
    }
  }

  const segments = [];
  for (let index = 0; index < parsed.length; index += 1) {
    segments.push(parsed[index].data);
    const pauseMs = Number(pauseDurationsMs[index] || 0);
    if (pauseMs > 0) {
      segments.push(createSilenceBuffer(pauseMs, base));
    }
  }

  return createWavBuffer({
    audioFormat: base.audioFormat,
    numChannels: base.numChannels,
    sampleRate: base.sampleRate,
    byteRate: base.byteRate,
    blockAlign: base.blockAlign,
    bitsPerSample: base.bitsPerSample,
    data: Buffer.concat(segments),
  });
}

function toTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function uniqueOptions(options = []) {
  const seen = new Set();
  const result = [];

  for (const option of Array.isArray(options) ? options : []) {
    const id = String(option?.id || "").trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push({
      id,
      label: String(option?.label || id).trim() || id,
    });
  }

  return result.sort(sortByLabel);
}

function normalizeCartesiaModelList(payload) {
  const candidateLists = [
    payload,
    payload?.models,
    payload?.data,
    payload?.results,
    payload?.items,
    payload?.snapshots,
    payload?.model_snapshots,
  ];

  const candidates = candidateLists.flatMap((entry) => (Array.isArray(entry) ? entry : []));

  return uniqueOptions(
    candidates.map((model) => {
      const rawId =
        model?.id ||
        model?.model_id ||
        model?.modelId ||
        model?.base_model_id ||
        model?.baseModelId ||
        model?.name ||
        "";
      const rawLabel =
        model?.name ||
        model?.label ||
        model?.display_name ||
        model?.displayName ||
        model?.model_id ||
        model?.id ||
        rawId;

      return {
        id: String(rawId || "").trim(),
        label: normalizeOptionName(rawLabel, rawId),
      };
    }),
  );
}

function formatPiperVoiceLabel(voiceId) {
  const parts = String(voiceId || "").split("-");
  const locale = String(parts.shift() || "voice").replace(/_/g, "-");
  const quality = toTitleCase(parts.pop() || "");
  const name = toTitleCase(parts.join(" "));

  return [locale, name, quality].filter(Boolean).join(" • ");
}

function getPiperSearchDirectories(extraDirs = []) {
  const config = getPiperConfig();
  const directories = new Set();

  function addDir(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return;
    }

    directories.add(path.resolve(normalized));
  }

  addDir(process.env.PIPER_MODELS_DIR);
  addDir("/opt/piper/models");
  addDir("/usr/share/piper/models");
  addDir("/usr/local/share/piper/models");
  addDir(path.join(os.homedir(), ".local/share/piper/models"));

  if (config.modelPath) {
    addDir(path.dirname(config.modelPath));
  }

  for (const candidate of Array.isArray(extraDirs) ? extraDirs : []) {
    addDir(candidate);
  }

  return [...directories];
}

async function listOnnxFiles(dirPath, depth = 2) {
  let entries = [];

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const modelFiles = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && depth > 0) {
      modelFiles.push(...(await listOnnxFiles(entryPath, depth - 1)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".onnx")) {
      modelFiles.push(entryPath);
    }
  }

  return modelFiles;
}

async function readPiperMetadata(modelPath) {
  const candidates = [`${modelPath}.json`, modelPath.replace(/\.onnx$/i, ".json")];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      return JSON.parse(raw);
    } catch {
      // Ignore missing or invalid metadata files and continue scanning.
    }
  }

  return null;
}

function buildSpeakerOptions(metadata) {
  const speakerMap = metadata?.speaker_id_map;

  if (speakerMap && typeof speakerMap === "object" && !Array.isArray(speakerMap)) {
    return Object.entries(speakerMap)
      .map(([label, id]) => {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
          return null;
        }

        return {
          id: numericId,
          label: String(label || `Speaker ${numericId}`).trim() || `Speaker ${numericId}`,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.id - right.id);
  }

  const count = Number(metadata?.num_speakers ?? metadata?.speaker_count ?? 0);
  if (Number.isInteger(count) && count > 1) {
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      label: `Speaker ${index}`,
    }));
  }

  return [];
}

export async function listPiperVoiceOptions({ searchDirs = [] } = {}) {
  const config = getPiperConfig();
  const directories = getPiperSearchDirectories(searchDirs);
  const discovered = new Map();

  for (const dirPath of directories) {
    const modelFiles = await listOnnxFiles(dirPath, 2);

    for (const modelPath of modelFiles) {
      if (discovered.has(modelPath)) {
        continue;
      }

      const metadata = await readPiperMetadata(modelPath);
      const voiceId = path.basename(modelPath, ".onnx");
      const speakers = buildSpeakerOptions(metadata);
      const speakerCount = Math.max(speakers.length, Number(metadata?.num_speakers ?? metadata?.speaker_count) || 1);

      discovered.set(modelPath, {
        id: voiceId,
        label: formatPiperVoiceLabel(voiceId),
        path: modelPath,
        quality: voiceId.split("-").at(-1) || "",
        locale: voiceId.split("-")[0] || "",
        isDefault: Boolean(config.modelPath) && modelPath === config.modelPath,
        speakerCount,
        speakers,
      });
    }
  }

  const voices = [...discovered.values()].sort(
    (left, right) => Number(right.isDefault) - Number(left.isDefault) || left.label.localeCompare(right.label),
  );

  return {
    configured: isPiperConfigured(),
    command: config.command,
    defaultModelPath: config.modelPath,
    directories,
    voices,
  };
}

function isCloudConfigured() {
  const { apiKey, baseUrl } = getCloudConfig();
  const allowNoKey = String(process.env.TTS_ALLOW_NO_KEY || "").trim().toLowerCase() === "true";

  if (allowNoKey) {
    return Boolean(baseUrl);
  }

  // Default: require a key so we avoid false positives that trigger 401/403 loops.
  return Boolean(apiKey);
}

function isPiperConfigured(voiceProfile = null) {
  const { modelPath } = getPiperConfig();
  const overrideModelPath = String(voiceProfile?.piperModelPath || "").trim();
  return Boolean(overrideModelPath || modelPath);
}

function normalizeIdentifier(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, " ");
}

// Maps a raw gender string from the personality object to the canonical
// presentation values expected by resolveKokoroVoiceForIdentity.
function normalizeGender(gender) {
  const g = String(gender || "").trim().toLowerCase();
  if (["female", "f", "woman", "feminine"].includes(g)) return "feminine";
  if (["male", "m", "man", "masculine"].includes(g)) return "masculine";
  return null;
}

// Trait → register hint table.  Only "low" and "high" are listed;
// anything unlisted leaves the default token-inferred register unchanged.
const TRAIT_REGISTER_HINTS = new Map([
  ["sinister",  "low"],
  ["menacing",  "low"],
  ["villain",   "low"],
  ["dark",      "low"],
  ["brooding",  "low"],
  ["deep",      "low"],
  ["serious",   "low"],
  ["bubbly",    "high"],
  ["energetic", "high"],
  ["bright",    "high"],
  ["playful",   "high"],
  ["cheerful",  "high"],
  ["lively",    "high"],
]);

function inferAccent(identityText) {
  if (/\bbrit|british|uk|england|bf_|bm_/.test(identityText)) {
    return "british";
  }
  return "american";
}

function inferPresentation(identityText) {
  if (/\bfemale|woman|girl|af_|bf_|alto|soprano|nova|shimmer|bella|alice|emma/.test(identityText)) {
    return "feminine";
  }
  if (/\bmale|man|boy|am_|bm_|baritone|tenor|onyx|echo|fable|george/.test(identityText)) {
    return "masculine";
  }
  return "neutral";
}

function inferRegister(identityText) {
  if (/\bbass|deep|dark|low|baritone|onyx|fenrir/.test(identityText)) {
    return "low";
  }
  if (/\bbright|light|high|alto|soprano|nova|heart|sky/.test(identityText)) {
    return "high";
  }
  return "mid";
}

function buildVoiceIdentityProfile(personality = {}, voiceProfile = {}) {
  const sample = voiceProfile?.selectedVoiceSample && typeof voiceProfile.selectedVoiceSample === "object"
    ? voiceProfile.selectedVoiceSample
    : {};
  const sourceTokens = [
    voiceProfile.preferredVoice,
    voiceProfile.providerVoice,
    voiceProfile.kokoroVoice,
    voiceProfile.elevenLabsVoiceId,
    voiceProfile.cartesiaVoiceId,
    voiceProfile.selectedVoiceLabel,
    sample.voiceLabel,
    sample.voiceBand,
    sample.voiceQuality,
    personality?.speechStyle,
  ]
    .filter(Boolean)
    .map(normalizeIdentifier)
    .join(" ");

  // Explicit gender field on the personality takes priority over token inference.
  const genderPresentation = normalizeGender(personality?.gender);
  const presentation = genderPresentation || inferPresentation(sourceTokens);

  // Token-inferred register; override with trait hints only when the tokens
  // couldn't produce a strong signal (i.e. fell back to the default "mid").
  let register = inferRegister(sourceTokens);
  if (register === "mid") {
    const traits = Array.isArray(personality?.traits) ? personality.traits : [];
    for (const trait of traits) {
      const hint = TRAIT_REGISTER_HINTS.get(String(trait).toLowerCase());
      if (hint) {
        register = hint;
        break;
      }
    }
  }

  return {
    accent: inferAccent(sourceTokens),
    presentation,
    register,
    sampleLabel: String(voiceProfile?.selectedVoiceLabel || sample.voiceLabel || "").trim(),
    preferredVoice: String(voiceProfile?.preferredVoice || voiceProfile?.providerVoice || "").trim(),
  };
}

function resolveKokoroVoiceForIdentity(identity = {}) {
  const accentPrefix = identity.accent === "british" ? "b" : "a";
  const presentationPrefix = identity.presentation === "masculine" ? "m" : "f";
  const candidates = {
    af: { low: "af_nicole", mid: "af_heart", high: "af_sky" },
    am: { low: "am_onyx", mid: "am_michael", high: "am_eric" },
    bf: { low: "bf_isabella", mid: "bf_alice", high: "bf_lily" },
    bm: { low: "bm_fable", mid: "bm_george", high: "bm_lewis" },
  };
  const family = `${accentPrefix}${presentationPrefix}`;
  return candidates[family]?.[identity.register || "mid"] || "af_heart";
}

function resolveCloudVoiceForIdentity(identity = {}) {
  if (identity.presentation === "masculine") {
    return identity.register === "low" ? "onyx" : identity.register === "high" ? "echo" : "ash";
  }
  if (identity.presentation === "feminine") {
    return identity.register === "high" ? "shimmer" : identity.register === "low" ? "sage" : "nova";
  }
  return identity.register === "low" ? "onyx" : "alloy";
}

export function buildFallbackVoiceProfile(engine, voiceProfile, personality) {
  const profile = { ...voiceProfile };
  const identity = buildVoiceIdentityProfile(personality, voiceProfile);

  if (engine === "kokoro") {
    profile.kokoroVoice = profile.kokoroVoice || resolveKokoroVoiceForIdentity(identity);
    profile.providerVoice = profile.providerVoice || identity.preferredVoice || profile.kokoroVoice;
  }

  if (engine === "cloud") {
    profile.providerVoice = resolveCloudVoiceForIdentity(identity);
  }

  return profile;
}

export function classifySpeechContext({ text = "", speechHint = "", personality = {} } = {}) {
  const rawText = String(text || "");
  const hint = String(speechHint || "");
  const joined = `${rawText}\n${hint}`.toLowerCase();
  const creativeContext = String(personality?.creativeContext || "default").toLowerCase();

  const previewSignals = [
    /\b(voice\s*preview|tts\s*preview|preview\s*only)\b/,
  ].some((pattern) => pattern.test(joined));

  if (previewSignals) {
    return {
      category: "precision",
      styleMode: "precision",
      preserveLiteralContent: true,
    };
  }

  const precisionSignals = [
    /```|`[^`]+`/,
    /https?:\/\//,
    /\b(api|json|sql|http|https|server|deploy|deployment|port|env|config|nginx|pm2|npm|function|class|return|undefined|null|true|false|endpoint|header|payload|schema)\b/,
    /\b(step\s+\d+|line\s+\d+|error\s*:\s|warning\s*:\s)\b/,
  ].some((pattern) => pattern.test(joined));

  const denseDigits = (rawText.match(/\d/g) || []).length >= 4;
  const performanceSignals = [
    /\b(perform|performance|verse|chorus|bridge|outro|intro|monologue|dramatic|cinematic|roleplay|narration)\b/,
    /\b(stage|crowd|scene|spotlight)\b/,
  ].some((pattern) => pattern.test(joined));

  if ((precisionSignals || denseDigits) && !performanceSignals) {
    return {
      category: "precision",
      styleMode: "precision",
      preserveLiteralContent: true,
    };
  }

  if (performanceSignals || creativeContext !== "default") {
    return {
      category: "performance",
      styleMode: "performance",
      preserveLiteralContent: false,
    };
  }

  return {
    category: "general",
    styleMode: "performance",
    preserveLiteralContent: false,
  };
}

function resolveEngine(voiceProfile) {
  const requested = getRequestedEngine(voiceProfile);

  if (requested === "kokoro" && isAllowedTtsEngine("kokoro")) return "kokoro";
  if (requested === "openvoice" && isAllowedTtsEngine("openvoice")) return "openvoice";
  if (requested === "kokoro-rvc" && isAllowedTtsEngine("kokoro-rvc")) return "kokoro-rvc";
  if (requested === "elevenlabs" && isAllowedTtsEngine("elevenlabs")) return "elevenlabs";
  if (requested === "cartesia" && isAllowedTtsEngine("cartesia")) return "cartesia";
  if (requested === "piper" && isAllowedTtsEngine("piper")) return "piper";
  if ((requested === "cloud" || requested === "openai") && isAllowedTtsEngine("cloud")) return "cloud";

  const autoOrder = getAutoEngineOrder(voiceProfile);
  if (autoOrder[0]) {
    return autoOrder[0];
  }
  if (isAllowedTtsEngine("kokoro")) {
    return "kokoro";
  }
  return "cartesia";
}

function getRequestedEngine(voiceProfile) {
  // Explicit TTS_ENGINE env var acts as a global server-level override and
  // takes precedence over per-persona voiceProfile.engine settings.
  const envEngine = String(process.env.TTS_ENGINE || "").trim().toLowerCase();
  if (envEngine && envEngine !== "auto") {
    return envEngine;
  }

  return String(voiceProfile?.engine || envEngine || "auto").trim().toLowerCase();
}

export function getAutoEngineOrder(voiceProfile) {
  const allowed = new Set(getAllowedTtsEngines());
  if (isTtsDebugProviderLockEnabled()) {
    const lockedOrder = ["cartesia", "kokoro"];
    return lockedOrder.filter((engine) => {
      if (!allowed.has(engine)) {
        return false;
      }
      if (engine === "cartesia") return isCartesiaConfigured();
      return isKokoroAvailable();
    });
  }

  const defaultSource = getVoiceDefaults().source;
  const preferredOrder = defaultSource === "llm"
    ? ["cloud", "elevenlabs", "cartesia", "piper", "kokoro"]
    : ["elevenlabs", "cartesia", "cloud", "piper", "kokoro"];

  return preferredOrder.filter((engine) => {
    if (!allowed.has(engine)) {
      return false;
    }
    if (engine === "elevenlabs") return isElevenLabsConfigured();
    if (engine === "cartesia") return isCartesiaConfigured();
    if (engine === "cloud") return isCloudConfigured();
    if (engine === "piper") return isPiperConfigured(voiceProfile);
    return isKokoroAvailable();
  });
}

export function isTtsConfigured(voiceProfile = null) {
  return getAutoEngineOrder(voiceProfile).length > 0;
}

function stripInlineMetadataTokens(text) {
  const source = String(text || "");
  const metadataPattern = /\b(?:mosic|music|bpm|duration_secs|good_crop)\s*:\s*-?\d+(?:\.\d+)?/gi;
  const first = metadataPattern.exec(source);
  if (!first) {
    return source.trim();
  }
  return source.slice(0, first.index).trim();
}

// Normalize em-dashes, en-dashes, and spaced hyphens-as-dashes into comma pauses
// so all TTS engines (Kokoro, Piper, cloud) treat them as natural speech breaks
// rather than reading "dash" aloud or silently dropping them.
function normalizeDashesForSpeech(text) {
  return String(text || "")
    // Em-dash (—) with any surrounding spaces → comma pause
    .replace(/\s*—\s*/g, ", ")
    // En-dash (–) with any surrounding spaces → comma pause
    .replace(/\s*–\s*/g, ", ")
    // Spaced hyphen used as a dash between letter-words (e.g. "pet - you") → comma pause
    // Uses word-char guard so "3-5" ranges and hyphenated compound words are untouched
    .replace(/([a-zA-Z])\s+-\s+([a-zA-Z])/g, "$1, $2")
    // Clean up any double commas that may result
    .replace(/,\s*,/g, ",")
    .replace(/,\s{2,}/g, ", ");
}

function resolveMood(personality = {}) {
  if (personality?.moodState && typeof personality.moodState === "object") {
    return personality.moodState;
  }

  if (personality?.moodBaseline && typeof personality.moodBaseline === "object") {
    return personality.moodBaseline;
  }

  return {};
}

/**
 * Derive voice identity post-processor parameters from VAD mood state +
 * prosody envelope. Used by the OpenVoice and RVC adapters to apply
 * personality-driven expression without modifying the synthesis engine.
 *
 * - arousal  → speech rate (high arousal = faster, low = slower)
 * - valence  → RVC pitch shift (positive valence = slight up, negative = slight down)
 * - dominance → RVC pitch shift magnitude (high dominance = larger shifts allowed)
 *
 * All outputs are clamped to safe ranges so artifacts are bounded.
 */
export function deriveMoodVoiceParams(mood = {}, prosodyEnvelope = {}) {
  const arousal   = Number.isFinite(Number(mood?.arousal))   ? Number(mood.arousal)   : 0;
  const valence   = Number.isFinite(Number(mood?.valence))   ? Number(mood.valence)   : 0;
  const dominance = Number.isFinite(Number(mood?.dominance)) ? Number(mood.dominance) : 0;

  // Rate: prosody envelope takes priority; mood arousal adjusts ±0.15 around it
  const baseRate = Number(prosodyEnvelope?.targetRate || 1);
  const arousalRateNudge = arousal * 0.15; // –0.15 (very calm) … +0.15 (very excited)
  const rate = Math.max(0.7, Math.min(1.3, baseRate + arousalRateNudge));

  // Pitch shift (semitones for RVC): valence drives direction, dominance scales magnitude
  // Range: –3 to +3 semitones — subtle enough to avoid artifacts on CPU
  const dominanceMagnitude = 0.5 + (Math.abs(dominance) * 1.5); // 0.5–2.0
  const pitchShift = Math.round(
    Math.max(-3, Math.min(3, valence * dominanceMagnitude)),
  );

  return { rate, pitchShift };
}

export function prepareSpeechSynthesis({ personality, text, voiceProfile, speechHint }) {
  const mood = resolveMood(personality);
  const speechContext = classifySpeechContext({ text, speechHint, personality });
  const resolvedEngine = resolveEngine(voiceProfile);

  console.log("[VOXIS DEBUG] TTS prepareSpeechSynthesis - mood:", mood, "voiceProfile:", voiceProfile);

  // stylizeSpeech may prepend [SFX:tag] markers for personas with SFX tags.
  // We strip them here — before TTS sees the text — and return them as sfxTimeline
  // metadata so the performance controller can emit sfx events to the frontend.
  const speechPacket = buildSpeechPacket(text, personality, mood, {
    styleMode: speechContext.styleMode,
    channel: "tts",
    appendInjectedPhrase: false,
    ttsEngine: resolvedEngine,
  });
  let directedText = String(speechPacket?.speech || text || "").trim();
  
  // Strip [SFX:tag] markers and build sfxTimeline
  const sfxTimeline = [];
  const sfxEvents = speechPacket?.sfx || [];
  
  // For explicit [SFX:...] from the LLM text (e.g. from *BUUUURP*), compute approximate
  // progress based on character position in the original text. This makes burps land
  // mid-sentence at the correct time during playback.
  const originalForMarkers = String(speechPacket?.speech || text || "").trim();
  const origLen = originalForMarkers.length || 1;
  
  // Collect explicit markers with progress first (from original positions)
  const explicitMarkers = [];
  let searchPos = 0;
  const markerRegex = /\[SFX:([a-zA-Z0-9_-]+)\]\s*/gi;
  let m;
  while ((m = markerRegex.exec(originalForMarkers)) !== null) {
    const tag = m[1];
    const pos = m.index;
    const progress = Math.min(0.98, Math.max(0.02, pos / origLen));
    explicitMarkers.push({ tag, position: "inline", progress });
    searchPos = m.index + m[0].length;
  }
  sfxTimeline.push(...explicitMarkers);
  
  // Remove all [SFX:tag] markers (tolerate minor nesting)
  directedText = String(directedText || "");
  let safety = 0;
  while (safety++ < 5) {
    const before = directedText;
    directedText = directedText.replace(/\[SFX:([a-zA-Z0-9_-]+)\]\s*/gi, () => "");
    directedText = directedText.replace(/\[SFX:\[SFX:([a-zA-Z0-9_-]+)\]\s*\]\s*/gi, () => "");
    if (directedText === before) break;
  }
  directedText = directedText.trim();
  
  // Backward compatibility: handle old [BURP] marker
  directedText = directedText.replace(/\[BURP\]\s*/g, () => {
    sfxTimeline.push({ tag: "burp", position: "inline" });
    return "";
  }).trim();
  
  // If speechPacket has sfxEvents with timing info, use those
  if (sfxEvents.length > 0) {
    sfxTimeline.push(...sfxEvents);
  }
  
  directedText = stripInlineMetadataTokens(directedText);
  directedText = normalizeDashesForSpeech(directedText);

  const adjustedVoiceProfile = {
    ...applyMoodToVoice(voiceProfile, mood),
    moodArousal: Number.isFinite(Number(mood?.arousal)) ? Number(mood.arousal) : undefined,
  };

  const prosodyEnvelope = compileProsodyEnvelope({
    personality,
    mood,
    voiceProfile: adjustedVoiceProfile,
    directedText,
    speechHint,
    speechContext,
  });

  adjustedVoiceProfile.rate = Number(prosodyEnvelope.targetRate || adjustedVoiceProfile.rate || 1);

  return {
    mood,
    directedText,
    adjustedVoiceProfile,
    prosodyEnvelope,
    speechContext,
    speechPacket,
    sfx: sfxTimeline,
  };
}

function prepareEngineInput({ engine, text, voiceProfile, prosodyEnvelope }) {
  const capabilities = getEngineCapabilities(engine) || {};
  const profile = { ...voiceProfile };
  let synthesisText = text;

  if (capabilities.textShaping && ["cloud", "cartesia", "piper"].includes(engine)) {
    const providerEnvelope = prosodyEnvelope?.provider?.[engine] || {};
    synthesisText = applyGenericProsodyText(text, prosodyEnvelope, {
      phrasing: String(providerEnvelope.phrasing || prosodyEnvelope?.phrasing || "balanced"),
      pauseSeconds: Number(providerEnvelope.pauseSeconds ?? prosodyEnvelope?.avgPauseSeconds ?? 0.28),
      emphasisMode: String(providerEnvelope.emphasisMode || "commas"),
    });
  }

  if (engine === "elevenlabs") {
    const provider = prosodyEnvelope?.provider?.elevenlabs || {};
    synthesisText = applyProsodyToElevenLabsText(text, prosodyEnvelope);
    profile.stability = Number(provider.stability ?? profile.stability ?? 0.5);
    profile.style = Number(provider.style ?? profile.style ?? 0.5);
    profile.similarityBoost = Number(provider.similarityBoost ?? profile.similarityBoost ?? 0.75);
    profile.rate = Number(prosodyEnvelope?.targetRate ?? profile.rate ?? 1);
  }

  if (engine === "kokoro") {
    synthesisText = shapeForKokoro(text, prosodyEnvelope);
    profile.rate = Number(prosodyEnvelope?.targetRate ?? profile.rate ?? 1);
  }

  if (engine === "cloud") {
    const provider = prosodyEnvelope?.provider?.cloud || {};
    profile.rate = Number(provider.speed ?? prosodyEnvelope?.targetRate ?? profile.rate ?? 1);
    profile.cloudInstructions = String(provider.instructions || "").trim();
  }

  if (engine === "cartesia") {
    const provider = prosodyEnvelope?.provider?.cartesia || {};
    profile.rate = Number(provider.targetRate ?? prosodyEnvelope?.targetRate ?? profile.rate ?? 1);
  }

  if (engine === "piper") {
    const provider = prosodyEnvelope?.provider?.piper || {};
    profile.rate = Number(prosodyEnvelope?.targetRate ?? profile.rate ?? 1);
    profile.lengthScale = Number(provider.lengthScale ?? profile.lengthScale ?? 1);
    profile.noiseScale = Number(provider.noiseScale ?? profile.noiseScale ?? 0.5);
    profile.noiseW = Number(provider.noiseW ?? profile.noiseW ?? 0.6);
  }

  return {
    synthesisText,
    effectiveVoiceProfile: profile,
  };
}

function getContentType(format) {
  switch (format) {
    case "wav":
      return "audio/wav";
    case "opus":
      return "audio/ogg";
    case "aac":
      return "audio/aac";
    case "flac":
      return "audio/flac";
    case "pcm":
      return "audio/L16";
    case "mp3":
    default:
      return "audio/mpeg";
  }
}

function getAudioExtensionForContentType(contentType) {
  const normalized = String(contentType || "").toLowerCase();
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("aac")) return "aac";
  if (normalized.includes("flac")) return "flac";
  if (normalized.includes("mp3") || normalized.includes("mpeg")) return "mp3";
  return "wav";
}

function createRealismProfile(voiceProfile = {}) {
  const presetCandidate = String(voiceProfile?.realismPreset || "conversational").trim().toLowerCase();
  const preset = REALISM_PRESETS.includes(presetCandidate) ? presetCandidate : "conversational";
  const enabled = voiceProfile?.realismEnabled === true
    || String(voiceProfile?.realismEnabled || "").trim().toLowerCase() === "true";
  return {
    enabled,
    preset,
  };
}

function buildRealismChain(preset) {
  switch (preset) {
    case "cinematic": {
      return {
        chain: "realism-v1-cinematic",
        stages: ["highpass", "hf-taming", "gentle-compression", "tiny-room", "loudnorm"],
        filterGraph: [
          "highpass=f=50",
          "equalizer=f=6800:t=h:width=1.1:g=-2.8",
          "acompressor=threshold=-19dB:ratio=2.3:attack=10:release=140:makeup=2",
          "aecho=0.72:0.26:42:0.045",
          "loudnorm=I=-17:TP=-1.7:LRA=10",
        ].join(","),
      };
    }
    case "intimate": {
      return {
        chain: "realism-v1-intimate",
        stages: ["highpass", "de-ess", "gentle-compression", "loudnorm"],
        filterGraph: [
          "highpass=f=55",
          "equalizer=f=6200:t=h:width=1.4:g=-3.6",
          "acompressor=threshold=-21dB:ratio=2.0:attack=7:release=110:makeup=1.8",
          "loudnorm=I=-18:TP=-1.9:LRA=9",
        ].join(","),
      };
    }
    case "energetic": {
      return {
        chain: "realism-v1-energetic",
        stages: ["highpass", "hf-taming", "compression", "loudnorm"],
        filterGraph: [
          "highpass=f=45",
          "equalizer=f=7600:t=h:width=1.0:g=-1.2",
          "acompressor=threshold=-17dB:ratio=2.5:attack=6:release=95:makeup=2.5",
          "loudnorm=I=-15.5:TP=-1.3:LRA=11",
        ].join(","),
      };
    }
    case "conversational":
    default: {
      return {
        chain: "realism-v1-conversational",
        stages: ["highpass", "de-ess", "gentle-compression", "loudnorm"],
        filterGraph: [
          "highpass=f=50",
          "equalizer=f=7000:t=h:width=1.2:g=-2.2",
          "acompressor=threshold=-19dB:ratio=2.1:attack=8:release=120:makeup=2",
          "loudnorm=I=-16:TP=-1.5:LRA=10",
        ].join(","),
      };
    }
  }
}

function runFfmpeg(args, { timeoutMs = DEFAULT_REALISM_FFMPEG_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let settled = false;
    let stderr = "";

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg post-processing timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}. ${stderr.trim()}`.trim()));
    });
  });
}

async function ensureFfmpegAvailable() {
  if (_ffmpegAvailable != null) {
    return _ffmpegAvailable;
  }

  try {
    await runFfmpeg(["-version"], { timeoutMs: 5000 });
    _ffmpegAvailable = true;
  } catch {
    _ffmpegAvailable = false;
  }

  return _ffmpegAvailable;
}

async function applyRealismPostProcessing(audio, profile) {
  if (!profile?.enabled) {
    return {
      ...audio,
      realism: {
        enabled: false,
        preset: profile?.preset || "conversational",
        applied: false,
        chain: "disabled",
        stages: [],
      },
    };
  }

  const ffmpegAvailable = await ensureFfmpegAvailable();
  const chain = buildRealismChain(profile.preset);

  if (!ffmpegAvailable) {
    return {
      ...audio,
      realism: {
        enabled: true,
        preset: profile.preset,
        applied: false,
        chain: "ffmpeg-unavailable",
        stages: chain.stages,
        filterGraph: chain.filterGraph,
        error: "ffmpeg not available on server",
      },
    };
  }

  const inputExt = getAudioExtensionForContentType(audio?.contentType);
  const inputFile = path.join(os.tmpdir(), `voxis-realism-in-${randomUUID()}.${inputExt}`);
  const outputFile = path.join(os.tmpdir(), `voxis-realism-out-${randomUUID()}.mp3`);

  try {
    await fs.writeFile(inputFile, audio.buffer);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputFile,
      "-af",
      chain.filterGraph,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "160k",
      outputFile,
    ]);

    const processed = await fs.readFile(outputFile);
    return {
      ...audio,
      buffer: processed,
      contentType: "audio/mpeg",
      realism: {
        enabled: true,
        preset: profile.preset,
        applied: true,
        chain: chain.chain,
        stages: chain.stages,
        filterGraph: chain.filterGraph,
      },
    };
  } catch (error) {
    return {
      ...audio,
      realism: {
        enabled: true,
        preset: profile.preset,
        applied: false,
        chain: `${chain.chain}:failed`,
        stages: chain.stages,
        filterGraph: chain.filterGraph,
        error: String(error?.message || error || "Realism post-processing failed."),
      },
    };
  } finally {
    await fs.unlink(inputFile).catch(() => {});
    await fs.unlink(outputFile).catch(() => {});
  }
}

async function generateCloudSpeechAudio({ personality, text, voiceProfile, speechHint }) {
  const config = getCloudConfig();
  const mood = resolveMood(personality);

  if (!isCloudConfigured()) {
    const error = new Error(
      "Cloud TTS is not configured. Set TTS_API_KEY or TTS_BASE_URL, or switch engine to Piper.",
    );
    error.statusCode = 500;
    throw error;
  }

  const response = await fetchWithTimeoutRetry(`${config.baseUrl}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: voiceProfile.providerModel || config.model,
      voice: voiceProfile.providerVoice || config.voice,
      input: text,
      response_format: config.format,
      speed: Math.min(1.25, Math.max(0.7, Number(voiceProfile.rate) || 1)),
      instructions: [
        `Speak as ${personality.name}.`,
        personality.speechStyle || "Maintain the saved character tone.",
        buildEmotionalVoiceInstruction(mood),
        voiceProfile.cloudInstructions || "",
        speechHint || "",
        personality.researchSummary || "",
      ]
        .filter(Boolean)
        .join(" "),
    }),
  }, { retries: 1 });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText || "");
    let errorPayload = null;
    try {
      errorPayload = JSON.parse(errorText);
    } catch {
      errorPayload = null;
    }

    const providerCode = String(
      errorPayload?.error?.code || errorPayload?.code || "",
    ).trim().toLowerCase();
    const error = new Error(`Cloud TTS request failed with ${response.status}: ${errorText}`);
    error.providerStatus = response.status;
    error.ttsProvider = "cloud";
    error.ttsProviderCode = providerCode;
    error.ttsProviderPayload = errorPayload;

    // Surface actionable upstream statuses (auth/quota/rate limit) directly.
    if (response.status === 401 || response.status === 403 || response.status === 429) {
      error.statusCode = response.status;
    } else {
      error.statusCode = 502;
    }
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || getContentType(config.format),
    engine: "cloud",
  };
}

function runPiper({ command, args, text, timeoutMs = DEFAULT_PIPER_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "pipe"],
    });

    let settled = false;
    let stderr = "";

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `Piper TTS timed out after ${timeoutMs / 1000}s for ${String(text || "").trim().length} chars. Check PIPER_COMMAND, PIPER_MODEL_PATH, and PIPER_TIMEOUT_MS.`,
        ),
      );
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Piper exited with code ${code}. ${stderr.trim()}`.trim()));
    });

    child.stdin.write(`${text}\n`);
    child.stdin.end();
  });
}

async function generateSinglePiperSpeechAudio({ text, voiceProfile, config }) {
  const modelPath = String(voiceProfile?.piperModelPath || config.modelPath || "").trim();
  const timeoutMs = getPiperTimeoutMs(text);

  if (!modelPath) {
    const error = new Error(
      "Piper TTS requires PIPER_MODEL_PATH or voiceProfile.piperModelPath.",
    );
    error.statusCode = 500;
    throw error;
  }

  const command = String(config.command || "piper").trim();
  if (!command) {
    const error = new Error("Piper TTS requires PIPER_COMMAND to be set.");
    error.statusCode = 500;
    throw error;
  }

  const tmpFile = path.join(os.tmpdir(), `voxis-piper-${randomUUID()}.wav`);
  const args = ["--model", modelPath, "--output_file", tmpFile];

  const speakerValue = String(voiceProfile?.piperSpeaker ?? config.speaker ?? "").trim();
  if (/^\d+$/.test(speakerValue)) {
    args.push("--speaker", speakerValue);
  }

  const rate = Math.min(1.6, Math.max(0.6, Number(voiceProfile?.rate) || 1));
  const lengthScale = Math.min(
    1.6,
    Math.max(0.55, Number(voiceProfile?.lengthScale ?? (1 / rate).toFixed(3))),
  );
  args.push("--length_scale", String(lengthScale));

  const arousal = Number(voiceProfile?.moodArousal);
  if (Number.isFinite(arousal) || Number.isFinite(Number(voiceProfile?.noiseScale)) || Number.isFinite(Number(voiceProfile?.noiseW))) {
    const noiseScale = Math.min(
      1.0,
      Math.max(0.2, Number(voiceProfile?.noiseScale ?? (0.5 + (Number.isFinite(arousal) ? arousal * 0.4 : 0)))),
    );
    const noiseW = Math.min(
      1.0,
      Math.max(0.3, Number(voiceProfile?.noiseW ?? (0.6 + (Number.isFinite(arousal) ? arousal * 0.3 : 0)))),
    );
    args.push("--noise_scale", noiseScale.toFixed(3));
    args.push("--noise_w", noiseW.toFixed(3));
  }

  try {
    await runPiper({ command, args, text, timeoutMs });
    const buffer = await fs.readFile(tmpFile);

    return {
      buffer,
      contentType: "audio/wav",
      engine: "piper",
      timeoutMs,
    };
  } catch (error) {
    const wrapped = new Error(
      `Piper synthesis failed: ${error.message || error} (command: ${command}, model: ${modelPath}, timeoutMs: ${timeoutMs})`,
    );
    wrapped.statusCode = 502;
    throw wrapped;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

async function generatePiperSpeechAudio({ text, voiceProfile }) {
  const config = getPiperConfig();
  const chunkPlan = planPiperChunkSynthesis(text, voiceProfile);

  if (chunkPlan.length <= 1) {
    return generateSinglePiperSpeechAudio({
      text: chunkPlan[0]?.text || text,
      voiceProfile,
      config,
    });
  }

  const chunkBuffers = [];
  const pauseDurationsMs = [];
  let maxTimeoutMs = 0;

  for (const chunk of chunkPlan) {
    const chunkAudio = await generateSinglePiperSpeechAudio({
      text: chunk.text,
      voiceProfile,
      config,
    });
    chunkBuffers.push(chunkAudio.buffer);
    pauseDurationsMs.push(chunk.pauseMs || 0);
    maxTimeoutMs = Math.max(maxTimeoutMs, Number(chunkAudio.timeoutMs) || 0);
  }

  return {
    buffer: concatenateWavBuffers(chunkBuffers, pauseDurationsMs),
    contentType: "audio/wav",
    engine: "piper",
    chunked: true,
    chunkCount: chunkPlan.length,
    pauseMsTotal: pauseDurationsMs.reduce((sum, pauseMs) => sum + Number(pauseMs || 0), 0),
    timeoutMs: maxTimeoutMs,
  };
}

// === KOKORO TTS ===

function getKokoroConfig() {
  let dbToken = null;
  let dbLocalPath = null;
  try {
    dbToken = getKokoroHfToken();
    dbLocalPath = getKokoroLocalPath();
  } catch {
    // DB may not be ready during early startup.
  }

  return {
    voice: process.env.KOKORO_DEFAULT_VOICE || "af_heart",
    dtype: process.env.KOKORO_DTYPE || "q8",
    hfToken: String(dbToken?.token || process.env.KOKORO_HF_TOKEN || process.env.HF_TOKEN || "").trim(),
    localPath: String(dbLocalPath || process.env.KOKORO_LOCAL_PATH || "").trim(),
  };
}

function getKokoroLoadTimeoutMs() {
  const value = Number(process.env.KOKORO_LOAD_TIMEOUT_MS || DEFAULT_KOKORO_LOAD_TIMEOUT_MS);
  if (!Number.isFinite(value)) return DEFAULT_KOKORO_LOAD_TIMEOUT_MS;
  return Math.max(5_000, Math.min(90_000, Math.floor(value)));
}

function getKokoroGenerateTimeoutMs(text = "") {
  const configured = Number(process.env.KOKORO_GENERATE_TIMEOUT_MS || DEFAULT_KOKORO_GENERATE_TIMEOUT_MS);
  const base = Number.isFinite(configured)
    ? Math.max(8_000, Math.min(120_000, Math.floor(configured)))
    : DEFAULT_KOKORO_GENERATE_TIMEOUT_MS;

  // Scale timeout proportionally to text length (~150 ms/char) so long chunks
  // don't time out on slow CPU hardware, but short chunks fail fast.
  const textLength = String(text || "").trim().length;
  if (!textLength) return base;
  const scaled = Math.round(10_000 + textLength * 150);
  return Math.min(120_000, Math.max(base, scaled));
}

async function withOpTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.statusCode = 503;
      error.ttsProvider = "kokoro";
      error.ttsProviderCode = "timeout";
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

function isKokoroPackageInstalled() {
  try {
    require.resolve("kokoro-js");
    return true;
  } catch {
    return false;
  }
}

function isKokoroAvailable() {
  if (isTtsDisableKokoroEnabled()) {
    return false;
  }

  return isKokoroPackageInstalled() && !_kokoroLoadError;
}

async function loadKokoroModule() {
  if (_kokoroModule) {
    return _kokoroModule;
  }

  if (!isKokoroPackageInstalled()) {
    const error = new Error("kokoro-js is not installed.");
    error.statusCode = 500;
    _kokoroImportError = error;
    throw error;
  }

  try {
    const mod = await import("kokoro-js");
    _kokoroModule = mod;
    _kokoroImportError = null;
    return mod;
  } catch (error) {
    _kokoroImportError = error;
    throw error;
  }
}

async function loadKokoroTts() {
  if (_kokoroTts) return _kokoroTts;
  if (_kokoroInitPromise) return _kokoroInitPromise;
  const config = getKokoroConfig();
  if (config.hfToken) {
    process.env.HF_TOKEN = config.hfToken;
  }

  const loadTimeoutMs = getKokoroLoadTimeoutMs();
  const modelPath = config.localPath || "onnx-community/Kokoro-82M-v1.0-ONNX";
  
  _kokoroInitPromise = withOpTimeout(
    loadKokoroModule()
      .then(({ KokoroTTS }) => KokoroTTS.from_pretrained(modelPath, {
        dtype: config.dtype,
      }))
      .then((tts) => {
        _kokoroTts = tts;
        _kokoroLoadError = null;
        _kokoroInitPromise = null;
        return tts;
      })
      .catch((error) => {
        _kokoroLoadError = error;
        _kokoroInitPromise = null;
        throw error;
      }),
    loadTimeoutMs,
    `Kokoro model warmup timed out after ${loadTimeoutMs}ms.`,
  ).catch((error) => {
    _kokoroLoadError = error;
    _kokoroInitPromise = null;
    throw error;
  });

  return _kokoroInitPromise;
}

// Called on server startup so the model is warm before the first user request.
export async function preloadKokoro() {
  if (!isKokoroPackageInstalled()) {
    console.warn("[Kokoro] kokoro-js not installed; skipping preload.");
    return;
  }
  console.log("[Kokoro] Loading model (first run may download ~171 MB)...");
  await loadKokoroTts();
  console.log("[Kokoro] Model ready.");
}

async function generateSingleKokoroChunk({ tts, text, voice, speed }) {
  const generateTimeoutMs = getKokoroGenerateTimeoutMs(text);
  const tmpFile = path.join(os.tmpdir(), `voxis-kokoro-${randomUUID()}.wav`);
  try {
    const audio = await withOpTimeout(
      tts.generate(text, { voice, speed }),
      generateTimeoutMs,
      `Kokoro synthesis timed out after ${generateTimeoutMs}ms for ${text.length} chars.`,
    );
    await audio.save(tmpFile);
    const buffer = await fs.readFile(tmpFile);
    return buffer;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

async function generateKokoroSpeechAudio({ text, voiceProfile }) {
  if (!isKokoroPackageInstalled()) {
    const error = new Error("Kokoro engine is not installed. Install kokoro-js or choose another TTS engine.");
    error.statusCode = 500;
    throw error;
  }

  // If warmup is already in-flight and the model is not ready yet, fail fast so
  // upstream proxies do not hold the request long enough to return 524 HTML pages.
  if (_kokoroInitPromise && !_kokoroTts) {
    const warmup = new Error("Kokoro model is warming up. Please retry in a few seconds.");
    warmup.statusCode = 503;
    warmup.ttsProvider = "kokoro";
    warmup.ttsProviderCode = "warming_up";
    throw warmup;
  }

  const config = getKokoroConfig();
  const voice = String(voiceProfile?.kokoroVoice || voiceProfile?.providerVoice || config.voice).trim();
  const speed = Math.min(2.0, Math.max(0.5, Number(voiceProfile?.rate) || 1));

  try {
    const tts = await loadKokoroTts();

    // Split into sentence-level chunks so each chunk has its own proportional
    // timeout and long responses don't time out or appear to hang at ~100ms/char.
    const chunkPlan = splitIntoChunks(text, { minPauseMs: 100, maxPauseMs: 600 });

    if (chunkPlan.length <= 1) {
      const synthesisText = chunkPlan[0]?.text || text;
      const buffer = await generateSingleKokoroChunk({ tts, text: synthesisText, voice, speed });
      return { buffer, contentType: "audio/wav", engine: "kokoro" };
    }

    // Generate sentence chunks sequentially and concatenate into a single WAV.
    const chunkBuffers = [];
    const pauseDurationsMs = [];
    for (const chunk of chunkPlan) {
      const buf = await generateSingleKokoroChunk({ tts, text: chunk.text, voice, speed });
      chunkBuffers.push(buf);
      pauseDurationsMs.push(chunk.pauseMs || 0);
    }

    return {
      buffer: concatenateWavBuffers(chunkBuffers, pauseDurationsMs),
      contentType: "audio/wav",
      engine: "kokoro",
      chunked: true,
      chunkCount: chunkPlan.length,
      pauseMsTotal: pauseDurationsMs.reduce((sum, ms) => sum + Number(ms || 0), 0),
    };
  } catch (error) {
    const message = String(error?.message || error || "Kokoro initialization failed.");
    const hint = /Unauthorized access to file:/i.test(message)
      ? " Kokoro could not download its model from Hugging Face. Pre-cache the model on the server or configure another TTS engine."
      : "";
    const wrapped = new Error(`Kokoro TTS failed: ${message}${hint}`);
    wrapped.statusCode = Number(error?.statusCode || 502);
    wrapped.ttsProvider = "kokoro";
    wrapped.ttsProviderCode = String(error?.ttsProviderCode || "unknown");
    throw wrapped;
  }
}

// === ELEVENLABS TTS ===

function getElevenLabsConfig() {
  // DB credential (BYOK from browser) takes priority over .env
  let dbCred = null;
  try { dbCred = getTtsCredential("elevenlabs"); } catch { /* db may not be ready */ }
  const envApiKey = String(process.env.ELEVENLABS_API_KEY || "").trim();
  const dbApiKey = String(dbCred?.apiKey || "").trim();

  return {
    apiKey: dbApiKey || envApiKey,
    dbApiKey,
    envApiKey,
    voiceId: dbCred?.voiceId || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM",
    model: dbCred?.model || process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
  };
}

function isElevenLabsConfigured() {
  return Boolean(getElevenLabsConfig().apiKey);
}

async function generateElevenLabsSpeechAudio({ text, voiceProfile }) {
  const config = getElevenLabsConfig();
  const voiceId = String(voiceProfile?.elevenLabsVoiceId || config.voiceId).trim();
  const model = String(voiceProfile?.elevenLabsModel || config.model).trim();
  const timeoutMs = getElevenLabsTimeoutMs(text);

  if (!config.apiKey) {
    const error = new Error("ElevenLabs TTS requires ELEVENLABS_API_KEY to be set.");
    error.statusCode = 500;
    throw error;
  }

  const stability = Math.min(1, Math.max(0, Number(voiceProfile?.stability ?? 0.5)));
  const similarityBoost = Math.min(1, Math.max(0, Number(voiceProfile?.similarityBoost ?? 0.75)));
  const style = Math.min(1, Math.max(0, Number(voiceProfile?.style ?? 0.5)));

  let response;
  try {
    response = await fetchWithTimeoutRetry(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": config.apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: true,
          },
        }),
      },
      { retries: 1, timeoutMs },
    );
  } catch (error) {
    if (/timed out/i.test(String(error?.message || ""))) {
      error.statusCode = 504;
      error.providerStatus = 504;
      error.ttsProvider = "elevenlabs";
      error.ttsProviderCode = "timeout";
      error.message = `ElevenLabs TTS timed out after ${timeoutMs}ms. Try a shorter sentence, then verify your voice/model settings.`;
    } else {
      error.statusCode = Number(error?.statusCode || 502);
      error.providerStatus = Number(error?.providerStatus || 0);
      error.ttsProvider = "elevenlabs";
      error.ttsProviderCode = String(error?.ttsProviderCode || "network_error");
      error.message = `ElevenLabs TTS request failed before audio generation: ${String(error?.message || "Unknown error")}`;
    }
    throw error;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    let errPayload = null;
    try {
      errPayload = JSON.parse(errText);
    } catch {
      errPayload = null;
    }

    const providerStatus = String(
      errPayload?.detail?.status || errPayload?.detail?.code || errPayload?.status || "",
    ).trim().toLowerCase();

    const error = new Error(`ElevenLabs TTS failed with ${response.status}: ${errText}`);
    error.providerStatus = response.status;
    error.ttsProvider = "elevenlabs";
    error.ttsProviderStatus = providerStatus;
    error.ttsProviderPayload = errPayload;
    if (response.status === 429 || providerStatus === "too_many_concurrent_requests") {
      error.statusCode = 429;
    } else if (providerStatus === "quota_exceeded") {
      error.statusCode = 402;
    } else {
      error.statusCode = 502;
    }
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType: "audio/mpeg", engine: "elevenlabs" };
}

// === CARTESIA TTS ===
// Pricing: ~$0.65/million chars (Sonic-2). Free tier + API key at https://cartesia.ai

// Maps voiceAdjustments deltas to Cartesia's __experimental_controls object.
// Returns null when no meaningful adjustments apply (cleaner API payload).
function buildCartesiaExperimentalControls(adj) {
  if (!adj) return null;

  const { rateDelta = 0, style = "neutral", energyBoost = 0 } = adj;

  // Map rate delta to Cartesia speed string
  let speed = null;
  if (rateDelta >= 0.12) speed = "fast";
  else if (rateDelta >= 0.06) speed = "slightly_fast";
  else if (rateDelta <= -0.10) speed = "slow";
  else if (rateDelta <= -0.05) speed = "slightly_slow";

  // Map style label to Cartesia emotion tag
  const STYLE_TO_EMOTION = {
    assertive:  [{ name: "anger",      level: "low"    }],
    angry:      [{ name: "anger",      level: "high"   }],
    excited:    [{ name: "positivity", level: "high"   }],
    cheerful:   [{ name: "positivity", level: "medium" }],
    warm:       [{ name: "positivity", level: "low"    }],
    curious:    [{ name: "curiosity",  level: "medium" }],
  };
  const emotion = energyBoost !== 0 ? (STYLE_TO_EMOTION[style] || null) : null;

  if (!speed && !emotion) return null;
  const controls = {};
  if (speed) controls.speed = speed;
  if (emotion) controls.emotion = emotion;
  return controls;
}

function getCartesiaConfig() {
  // DB credential (BYOK from browser) takes priority over .env
  let dbCred = null;
  try { dbCred = getTtsCredential("cartesia"); } catch { /* db may not be ready */ }
  return {
    apiKey: dbCred?.apiKey || process.env.CARTESIA_API_KEY || "",
    voiceId: dbCred?.voiceId || process.env.CARTESIA_VOICE_ID || DEFAULT_CARTESIA_VOICE_ID,
    model: dbCred?.model || process.env.CARTESIA_MODEL || DEFAULT_CARTESIA_MODEL,
  };
}

function isCartesiaConfigured() {
  return Boolean(getCartesiaConfig().apiKey);
}

async function generateCartesiaSpeechAudio({ text, voiceProfile }) {
  const config = getCartesiaConfig();
  const providerVoiceCandidate = String(voiceProfile?.providerVoice || "").trim();
  // Cartesia requires UUID format — reject non-UUID values and fall back to config default.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rawVoiceId = String(voiceProfile?.cartesiaVoiceId || providerVoiceCandidate || config.voiceId).trim();
  const voiceId = UUID_RE.test(rawVoiceId) ? rawVoiceId : config.voiceId;
  const model = String(voiceProfile?.cartesiaModel || config.model).trim();

  // Clean lyrics before synthesis: strip parenthetical echoes, smooth commas
  const synthesisText = voiceProfile?.singingActive ? cleanLyricsForTts(text) : text;
  const timeoutMs = getCartesiaTimeoutMs(synthesisText);

  if (!config.apiKey) {
    const error = new Error("Cartesia TTS requires CARTESIA_API_KEY to be set.");
    error.statusCode = 500;
    throw error;
  }

  // Build optional emotion/speed controls from voiceAdjustments and effective
  // speaking rate so Cartesia previews can reflect user/prosody speed changes.
  const effectiveRate = Math.min(1.6, Math.max(0.6, Number(voiceProfile?.rate) || 1));
  const baseAdj = voiceProfile?.voiceAdjustments && typeof voiceProfile.voiceAdjustments === "object"
    ? voiceProfile.voiceAdjustments
    : {};
  const adj = {
    ...baseAdj,
    rateDelta: Number.isFinite(Number(baseAdj.rateDelta))
      ? Number(baseAdj.rateDelta)
      : Number((effectiveRate - 1).toFixed(3)),
  };
  const experimentalControls = buildCartesiaExperimentalControls(adj);

  let response;
  try {
    // Build voice object — add __experimental_controls only when available
    const voicePayload = experimentalControls
      ? { mode: "id", id: voiceId, __experimental_controls: experimentalControls }
      : { mode: "id", id: voiceId };

    response = await fetchWithTimeoutRetry("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": config.apiKey,
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: synthesisText,
        model_id: model,
        voice: voicePayload,
        output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
      }),
    }, { retries: 0, timeoutMs });
  } catch (error) {
    if (/timed out/i.test(String(error?.message || ""))) {
      error.statusCode = 504;
      error.providerStatus = 504;
      error.ttsProvider = "cartesia";
      error.ttsProviderCode = "timeout";
      error.message = `Cartesia TTS timed out after ${timeoutMs}ms. Try a shorter sentence, then verify your Cartesia model/voice settings.`;
    } else {
      error.statusCode = Number(error?.statusCode || 502);
      error.providerStatus = Number(error?.providerStatus || 0);
      error.ttsProvider = "cartesia";
      error.ttsProviderCode = String(error?.ttsProviderCode || "network_error");
      error.message = `Cartesia TTS request failed before audio generation: ${String(error?.message || "Unknown error")}`;
    }
    throw error;
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    let errPayload = null;
    try {
      errPayload = JSON.parse(errText);
    } catch {
      errPayload = null;
    }

    const providerCode = String(
      errPayload?.error?.code || errPayload?.code || errPayload?.type || "",
    ).trim().toLowerCase();
    const providerMessage = String(
      errPayload?.error?.message || errPayload?.message || errPayload?.detail || "",
    ).trim();
    const baseMessage = providerMessage || errText || response.statusText || "Unknown provider error.";

    const hint = response.status === 401 || response.status === 403
      ? "Check your Cartesia API key in Voice Provider Credentials."
      : response.status === 429
        ? "Cartesia rate limit reached; retry shortly."
        : response.status === 400
          ? "Validate Cartesia voice ID (UUID) and model selection."
          : "Verify Cartesia provider settings and network access.";

    const error = new Error(`Cartesia TTS failed (${response.status}${providerCode ? `/${providerCode}` : ""}): ${baseMessage} ${hint}`.trim());
    error.statusCode = response.status === 401 || response.status === 403 || response.status === 429
      ? response.status
      : 502;
    error.providerStatus = response.status;
    error.ttsProvider = "cartesia";
    error.ttsProviderCode = providerCode;
    error.ttsProviderPayload = errPayload;
    throw error;
  }

  let arrayBuffer;

  try {
    arrayBuffer = await readResponseBodyWithTimeout(
      response,
      () => response.arrayBuffer(),
      timeoutMs,
      "Cartesia audio bytes",
    );
  } catch (error) {
    if (/timed out/i.test(String(error?.message || ""))) {
      error.statusCode = 504;
      error.providerStatus = 504;
      error.ttsProvider = "cartesia";
      error.ttsProviderCode = "timeout";
    }
    throw error;
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: "audio/mpeg",
    engine: "cartesia",
    engineControls: {
      experimentalControls,
      effectiveRate: Number(effectiveRate.toFixed(3)),
    },
  };
}

export async function generateSpeechAudio({ personality, text, voiceProfile, speechHint }) {
  if (!isTtsConfigured(voiceProfile)) {
    const error = new Error(
      "No TTS engine is configured. Set TTS_API_KEY (cloud), PIPER_MODEL_PATH (piper), ELEVENLABS_API_KEY, or CARTESIA_API_KEY. Kokoro is always available as a built-in fallback.",
    );
    error.statusCode = 500;
    throw error;
  }

  const requestedRaw = getRequestedEngine(voiceProfile);
  const requested = requestedRaw !== "auto" && !isAllowedTtsEngine(requestedRaw)
    ? "auto"
    : requestedRaw;

  const engine = resolveEngine(voiceProfile);
  const { directedText, adjustedVoiceProfile, prosodyEnvelope, speechContext, speechPacket, sfx } = prepareSpeechSynthesis({
    personality,
    text,
    voiceProfile,
    speechHint,
  });
  const cacheKey = buildTtsResponseCacheKey({
    personality,
    text,
    voiceProfile,
    speechHint,
    directedText,
    adjustedVoiceProfile,
  });
  const cachedResponse = getCachedTtsResponse(cacheKey);
  if (cachedResponse?.buffer) {
    return {
      ...cachedResponse,
      cached: true,
    };
  }
  const emotionFrame = interpretEmotionSpectrum(resolveMood(personality));
  const attemptedEngines = [];

  function shouldFallbackFromExplicitRequest(error) {
    const provider = String(error?.ttsProvider || "").toLowerCase();
    const providerStatus = String(error?.ttsProviderStatus || "").toLowerCase();
    const providerCode = String(error?.ttsProviderCode || "").toLowerCase();
    const statusCode = Number(error?.statusCode || 0);
    const upstreamStatus = Number(error?.providerStatus || 0);

    if (provider === "elevenlabs") {
      return (
        statusCode === 429 ||
        upstreamStatus === 429 ||
        providerStatus === "too_many_concurrent_requests" ||
        providerStatus === "concurrent_limit_exceeded" ||
        providerStatus === "quota_exceeded"
      );
    }

    if (provider === "cloud") {
      return (
        statusCode === 401 ||
        statusCode === 403 ||
        statusCode === 429 ||
        upstreamStatus === 401 ||
        upstreamStatus === 403 ||
        upstreamStatus === 429 ||
        providerCode === "insufficient_quota" ||
        providerCode === "invalid_api_key"
      );
    }

    // Explicit Cartesia mode is common in production. When Cartesia has
    // timeout/network/upstream instability, degrade to another configured
    // engine instead of surfacing opaque gateway failures.
    if (requested === "cartesia" || provider === "cartesia") {
      if (isTtsDebugProviderLockEnabled()) {
        return false;
      }

      return (
        statusCode === 400 ||  // invalid voice ID / model — degrade rather than hard-fail
        statusCode === 502 ||
        statusCode === 503 ||
        statusCode === 504 ||
        upstreamStatus === 400 ||
        upstreamStatus === 502 ||
        upstreamStatus === 503 ||
        upstreamStatus === 504 ||
        providerCode === "timeout" ||
        providerCode === "network_error" ||
        providerCode === "backend_timeout"
      );
    }

    // Piper process failures (binary missing, model not found, timeout) should
    // always degrade to the next configured engine rather than surface a 502.
    if (requested === "piper" || provider === "piper") {
      return true;
    }

    // Kokoro warmup/timeouts can be lengthy on first use; degrade rather than
    // block long enough for upstream 524 timeout pages.
    if (requested === "kokoro" || provider === "kokoro") {
      return statusCode === 503 || providerCode === "warming_up" || providerCode === "timeout";
    }

    return false;
  }

  async function runEngine(eng, profileOverride = adjustedVoiceProfile) {
    attemptedEngines.push(eng);
    const { synthesisText, effectiveVoiceProfile } = prepareEngineInput({
      engine: eng,
      text: directedText,
      voiceProfile: profileOverride,
      prosodyEnvelope,
    });
    const realismProfile = createRealismProfile(effectiveVoiceProfile);

    let audio;
    switch (eng) {
      case "kokoro":
        audio = await generateKokoroSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
        break;
      case "openvoice": {
        const mood = resolveMood(personality);
        const { rate } = deriveMoodVoiceParams(mood, prosodyEnvelope);
        audio = await synthesizeOpenVoice({
          text: synthesisText,
          personalityId: personality?.id,
          rate,
        });
        break;
      }
      case "kokoro-rvc": {
        // Step 1: Kokoro synthesizes text → WAV
        const kokoroAudio = await generateKokoroSpeechAudio({
          text: synthesisText,
          voiceProfile: effectiveVoiceProfile,
        });
        // Step 2: RVC converts the WAV to the target voice identity
        const cloneMeta = personality?.id ? getPersonalityCloneMeta(personality.id) : null;
        const packId = cloneMeta?.cloneRvcPackId ?? effectiveVoiceProfile?.cloneRvcPackId;
        if (!packId) {
          // No pack configured — return the raw Kokoro audio with a note
          audio = { ...kokoroAudio, engine: "kokoro", rvcSkipped: true };
        } else {
          const mood = resolveMood(personality);
          const { pitchShift } = deriveMoodVoiceParams(mood, prosodyEnvelope);
          audio = await convertWithRvc({
            inputBuffer: kokoroAudio.buffer,
            packId,
            pitchShift,
          });
        }
        break;
      }
      case "elevenlabs":
        audio = await generateElevenLabsSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
        break;
      case "cartesia":
        audio = await generateCartesiaSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
        break;
      case "piper":
        audio = await generatePiperSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
        break;
      default:
        audio = await generateCloudSpeechAudio({
          personality,
          speechHint,
          text: synthesisText,
          voiceProfile: effectiveVoiceProfile,
        });
        break;
    }

    const processedAudio = await applyRealismPostProcessing(audio, realismProfile);

    return {
      ...processedAudio,
      synthesisText,
      effectiveVoiceProfile,
    };
  }

  try {
    const audio = await runEngine(engine);
    const response = {
      ...audio,
      directedText,
      adjustedVoiceProfile,
      prosodyEnvelope,
      speechContext,
      telemetry: {
        requested,
        requestedRaw,
        requestedCoerced: requested !== requestedRaw,
        chosenEngine: audio.engine || engine,
        attemptedEngines,
        fallbackUsed: false,
        synthesisText: String(audio?.synthesisText || directedText),
        synthesisTextChanged: String(audio?.synthesisText || directedText) !== String(directedText),
        engineControls: audio?.engineControls || null,
        realism: audio?.realism || null,
        emotionFrame,
        speechEmotion: String(speechPacket?.emotion || ""),
        injectedPhrase: String(speechPacket?.injectedPhrase || "").trim(),
        injectedPhraseAppliedToSpeech: false,
        expressiveText: String(speechPacket?.expressive?.text || "").trim(),
        expressiveStyle: Array.isArray(speechPacket?.expressive?.style)
          ? speechPacket.expressive.style
          : [],
        personalityEvents: Array.isArray(speechPacket?.events)
          ? speechPacket.events.map((event) => ({
              type: String(event?.type || ""),
              text: String(event?.text || "").trim(),
              tag: String(event?.tag || "").trim(),
              delivery: String(event?.delivery || "overlay"),
              spoken: Boolean(event?.spoken),
              intensity: Number(event?.intensity || 0),
              emotion: String(event?.emotion || "").trim(),
            }))
          : [],
        chunked: Boolean(audio.chunked),
        chunkCount: Number(audio.chunkCount || 0),
        pauseMsTotal: Number(audio.pauseMsTotal || 0),
      },
      realism: audio?.realism || null,
      sfx,
      cached: false,
    };
    setCachedTtsResponse(cacheKey, response);
    return response;
  } catch (primaryError) {
    // For explicit engine requests, we normally avoid silent fallback.
    // Exception: provider-level limits (quota/concurrency) on ElevenLabs can
    // degrade to another configured engine so voice playback still works.
    if (requested !== "auto" && !shouldFallbackFromExplicitRequest(primaryError)) {
      throw primaryError;
    }

    // Auto fallback chain: try remaining engines in priority order.
    const fallbackOrder = getAutoEngineOrder(voiceProfile).filter((candidate) => candidate !== engine);

    for (const fallbackEngine of fallbackOrder) {
      try {
        const fallbackVoiceProfile = buildFallbackVoiceProfile(fallbackEngine, adjustedVoiceProfile, personality);
        const audio = await runEngine(fallbackEngine, fallbackVoiceProfile);
        const response = {
          ...audio,
          directedText,
          adjustedVoiceProfile: fallbackVoiceProfile,
          prosodyEnvelope,
          speechContext,
          telemetry: {
            requested,
            requestedRaw,
            requestedCoerced: requested !== requestedRaw,
            chosenEngine: audio.engine || fallbackEngine,
            attemptedEngines,
            fallbackUsed: true,
            fallbackFrom: engine,
            fallbackReason: primaryError.message || "Primary engine failed.",
            realism: audio?.realism || null,
            emotionFrame,
            speechEmotion: String(speechPacket?.emotion || ""),
            injectedPhrase: String(speechPacket?.injectedPhrase || "").trim(),
            injectedPhraseAppliedToSpeech: false,
            expressiveText: String(speechPacket?.expressive?.text || "").trim(),
            expressiveStyle: Array.isArray(speechPacket?.expressive?.style)
              ? speechPacket.expressive.style
              : [],
            personalityEvents: Array.isArray(speechPacket?.events)
              ? speechPacket.events.map((event) => ({
                  type: String(event?.type || ""),
                  text: String(event?.text || "").trim(),
                  tag: String(event?.tag || "").trim(),
                  delivery: String(event?.delivery || "overlay"),
                  spoken: Boolean(event?.spoken),
                  intensity: Number(event?.intensity || 0),
                  emotion: String(event?.emotion || "").trim(),
                }))
              : [],
            chunked: Boolean(audio.chunked),
            chunkCount: Number(audio.chunkCount || 0),
            pauseMsTotal: Number(audio.pauseMsTotal || 0),
          },
          realism: audio?.realism || null,
          sfx,
          cached: false,
        };
        setCachedTtsResponse(cacheKey, response);
        return response;
      } catch {
        // Continue to next fallback.
      }
    }

    throw primaryError;
  }
}

// ── Voice catalogue helpers ──────────────────────────────────────────────────

export const KOKORO_VOICES = {
  american_female: [
    { id: "af_heart", label: "Heart" },
    { id: "af_alloy", label: "Alloy" },
    { id: "af_aoede", label: "Aoede" },
    { id: "af_bella", label: "Bella" },
    { id: "af_jessica", label: "Jessica" },
    { id: "af_kore", label: "Kore" },
    { id: "af_nicole", label: "Nicole" },
    { id: "af_nova", label: "Nova" },
    { id: "af_river", label: "River" },
    { id: "af_sarah", label: "Sarah" },
    { id: "af_sky", label: "Sky" },
  ],
  american_male: [
    { id: "am_adam", label: "Adam" },
    { id: "am_echo", label: "Echo" },
    { id: "am_eric", label: "Eric" },
    { id: "am_fenrir", label: "Fenrir" },
    { id: "am_liam", label: "Liam" },
    { id: "am_michael", label: "Michael" },
    { id: "am_onyx", label: "Onyx" },
    { id: "am_orion", label: "Orion" },
    { id: "am_puck", label: "Puck" },
  ],
  british_female: [
    { id: "bf_alice", label: "Alice" },
    { id: "bf_emma", label: "Emma" },
    { id: "bf_isabella", label: "Isabella" },
    { id: "bf_lily", label: "Lily" },
  ],
  british_male: [
    { id: "bm_daniel", label: "Daniel" },
    { id: "bm_fable", label: "Fable" },
    { id: "bm_george", label: "George" },
    { id: "bm_lewis", label: "Lewis" },
  ],
};

export function listKokoroVoices() {
  return {
    available: isKokoroAvailable(),
    defaultVoice: getKokoroConfig().voice,
    voices: KOKORO_VOICES,
  };
}

export function listProviderStatus() {
  const kokoroConfig = getKokoroConfig();
  const allowed = new Set(getAllowedTtsEngines());

  return {
    kokoro: {
      available: allowed.has("kokoro") && isKokoroAvailable(),
      disabledByDebugLock: !allowed.has("kokoro"),
      disabledByEnv: isTtsDisableKokoroEnabled(),
      installed: isKokoroPackageInstalled(),
      loaded: Boolean(_kokoroTts),
      requiresSetup: Boolean(_kokoroLoadError),
      hfTokenConfigured: Boolean(kokoroConfig.hfToken),
      requiresEnv: "Optional: KOKORO_HF_TOKEN or Settings -> Kokoro",
      loadError: _kokoroLoadError ? String(_kokoroLoadError.message || _kokoroLoadError) : "",
      capabilities: getEngineCapabilities("kokoro"),
    },
    elevenlabs: {
      available: allowed.has("elevenlabs") && isElevenLabsConfigured(),
      disabledByDebugLock: !allowed.has("elevenlabs"),
      requiresEnv: "ELEVENLABS_API_KEY or Settings -> TTS",
      capabilities: getEngineCapabilities("elevenlabs"),
    },
    cartesia: {
      available: allowed.has("cartesia") && isCartesiaConfigured(),
      disabledByDebugLock: !allowed.has("cartesia"),
      requiresEnv: "CARTESIA_API_KEY or Settings -> TTS",
      capabilities: getEngineCapabilities("cartesia"),
    },
    piper: {
      available: allowed.has("piper") && isPiperConfigured(),
      disabledByDebugLock: !allowed.has("piper"),
      requiresEnv: "PIPER_MODEL_PATH",
      capabilities: getEngineCapabilities("piper"),
    },
    cloud: {
      available: allowed.has("cloud") && isCloudConfigured(),
      disabledByDebugLock: !allowed.has("cloud"),
      requiresEnv: "TTS_API_KEY or LLM_API_KEY",
      capabilities: getEngineCapabilities("cloud"),
    },
  };
}

function normalizeOptionName(value, fallback = "") {
  const text = String(value || fallback || "").trim();
  return text;
}

function sortByLabel(left, right) {
  return String(left.label || left.id || "").localeCompare(String(right.label || right.id || ""));
}

async function fetchElevenLabsOptions() {
  const config = getElevenLabsConfig();
  if (!config.apiKey) {
    return {
      provider: "elevenlabs",
      connected: false,
      voices: [],
      models: [],
      error: "No ElevenLabs API key is configured.",
    };
  }

  const keyCandidates = Array.from(new Set([
    String(config.dbApiKey || "").trim(),
    String(config.envApiKey || "").trim(),
  ].filter(Boolean)));

  let voices = [];
  let builtinVoices = [];
  let customVoices = [];
  let models = [];
  let error = "";
  let retriedWithEnvKey = false;

  for (let attemptIndex = 0; attemptIndex < keyCandidates.length; attemptIndex += 1) {
    const apiKey = keyCandidates[attemptIndex];
    const headers = {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    };

    let attemptVoices = [];
    let attemptBuiltinVoices = [];
    let attemptCustomVoices = [];
    let attemptModels = [];
    let voicesError = null;
    let modelsError = null;

    try {
      const voicesResponse = await fetchWithTimeoutRetry("https://api.elevenlabs.io/v1/voices", { headers }, { retries: 1 });
      if (!voicesResponse.ok) {
        const requestError = new Error(`voices request failed (${voicesResponse.status})`);
        requestError.status = voicesResponse.status;
        throw requestError;
      }

      const payload = await voicesResponse.json();
      const mapped = (Array.isArray(payload?.voices) ? payload.voices : [])
        .map((voice) => {
          const id = String(voice?.voice_id || "").trim();
          const label = normalizeOptionName(voice?.name, voice?.voice_id);
          const category = String(voice?.category || "").trim().toLowerCase();
          if (!id) {
            return null;
          }

          return {
            id,
            label,
            category,
            isCustom: category !== "premade",
          };
        })
        .filter(Boolean);

      attemptBuiltinVoices = mapped.filter((voice) => !voice.isCustom).sort(sortByLabel);
      attemptCustomVoices = mapped.filter((voice) => voice.isCustom).sort(sortByLabel);
      attemptVoices = [...attemptBuiltinVoices, ...attemptCustomVoices].map(({ id, label }) => ({ id, label }));
    } catch (fetchError) {
      voicesError = fetchError;
    }

    try {
      const modelsResponse = await fetchWithTimeoutRetry("https://api.elevenlabs.io/v1/models", { headers }, { retries: 1 });
      if (!modelsResponse.ok) {
        const requestError = new Error(`models request failed (${modelsResponse.status})`);
        requestError.status = modelsResponse.status;
        throw requestError;
      }

      const payload = await modelsResponse.json();
      attemptModels = (Array.isArray(payload) ? payload : [])
        .filter((model) => model?.can_do_text_to_speech !== false)
        .map((model) => ({
          id: String(model?.model_id || model?.id || "").trim(),
          label: normalizeOptionName(model?.name, model?.model_id || model?.id),
        }))
        .filter((model) => model.id)
        .sort(sortByLabel);
    } catch (fetchError) {
      modelsError = fetchError;
    }

    const hasData = attemptVoices.length > 0 || attemptModels.length > 0;
    const unauthorized = Number(voicesError?.status || modelsError?.status || 0) === 401;
    const hasMoreCandidates = attemptIndex < keyCandidates.length - 1;

    if (!hasData && unauthorized && hasMoreCandidates) {
      retriedWithEnvKey = true;
      continue;
    }

    voices = attemptVoices;
    builtinVoices = attemptBuiltinVoices;
    customVoices = attemptCustomVoices;
    models = attemptModels;

    if (voicesError) {
      error = `Unable to fetch ElevenLabs voices: ${voicesError.message || voicesError}`;
    } else if (modelsError) {
      error = `Unable to fetch ElevenLabs models: ${modelsError.message || modelsError}`;
    }

    break;
  }

  if (!voices.length && !models.length && error.includes("(401)")) {
    error = `${error}. Verify the ElevenLabs API key in Settings -> Voice Provider Credentials.`;
  }

  if (retriedWithEnvKey && !error) {
    console.warn("[TTS] ElevenLabs provider options: saved key unauthorized, used env fallback key.");
  }

  return {
    provider: "elevenlabs",
    connected: true,
    voices,
    builtinVoices: builtinVoices.map(({ id, label }) => ({ id, label })),
    customVoices: customVoices.map(({ id, label }) => ({ id, label })),
    models,
    defaults: {
      voiceId: config.voiceId,
      model: config.model,
    },
    error,
  };
}

async function fetchCartesiaOptions() {
  const config = getCartesiaConfig();
  if (!config.apiKey) {
    return {
      provider: "cartesia",
      connected: false,
      voices: [],
      models: [],
      error: "No Cartesia API key is configured.",
    };
  }

  const headers = {
    "X-API-Key": config.apiKey,
    "Cartesia-Version": "2024-06-10",
    "Content-Type": "application/json",
  };

  const defaultModels = [...CARTESIA_MODEL_FALLBACKS];
  let voices = [];
  let models = [...defaultModels];
  let error = "";
  let voiceCatalogSource = "unavailable";
  let modelCatalogSource = "fallback";

  try {
    const voicesResponse = await fetchWithTimeoutRetry(
      "https://api.cartesia.ai/voices",
      { headers },
      { retries: 0, timeoutMs: DEFAULT_CARTESIA_TIMEOUT_MS },
    );
    if (!voicesResponse.ok) {
      throw new Error(`voices request failed (${voicesResponse.status})`);
    }
    const payload = await voicesResponse.json();
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.voices)
        ? payload.voices
        : [];

    voices = list
      .map((voice) => ({
        id: String(voice?.id || voice?.voice_id || "").trim(),
        label: normalizeOptionName(voice?.name, voice?.id || voice?.voice_id),
        previewUrl: String(voice?.preview_url || "").trim(),
      }))
      .filter((voice) => voice.id)
      .sort(sortByLabel);
    voiceCatalogSource = voices.length ? "api" : "unavailable";
  } catch (fetchError) {
    error = `Unable to fetch Cartesia voices: ${fetchError.message || fetchError}`;
  }

  try {
    const modelEndpoints = [
      "https://api.cartesia.ai/models",
      "https://api.cartesia.ai/2024-06-10/models",
      "https://api.cartesia.ai/2024-11-13/models",
    ];

    let payload = null;
    let lastModelFetchError = null;
    let onlyNotFound = true;
    let usedFallbackModelCatalog = false;

    for (const endpoint of modelEndpoints) {
      const modelsResponse = await fetchWithTimeoutRetry(
        endpoint,
        { headers },
        { retries: 0, timeoutMs: DEFAULT_CARTESIA_TIMEOUT_MS },
      );
      if (!modelsResponse.ok) {
        if (modelsResponse.status !== 404) {
          onlyNotFound = false;
        }
        lastModelFetchError = new Error(`models request failed (${modelsResponse.status})`);
        continue;
      }

      payload = await modelsResponse.json();
      lastModelFetchError = null;
      break;
    }

    if (!payload && !onlyNotFound) {
      throw lastModelFetchError || new Error("models request failed");
    }

    if (!payload && onlyNotFound) {
      payload = defaultModels;
      usedFallbackModelCatalog = true;
    }

    const discoveredModels = normalizeCartesiaModelList(payload);

    if (discoveredModels.length && !usedFallbackModelCatalog) {
      models = discoveredModels;
      modelCatalogSource = "api";
    } else {
      models = [...defaultModels];
      modelCatalogSource = "fallback";
    }
  } catch (fetchError) {
    // Model discovery is optional. Keep fallback models available without
    // surfacing a noisy error when the catalog endpoint is unavailable.
    modelCatalogSource = "fallback";
  }

  return {
    provider: "cartesia",
    connected: true,
    voices,
    models,
    defaults: {
      voiceId: config.voiceId,
      model: config.model,
    },
    catalog: {
      voices: {
        source: voiceCatalogSource,
        count: voices.length,
      },
      models: {
        source: modelCatalogSource,
        count: models.length,
        fallbackModels: defaultModels,
      },
    },
    error,
  };
}

export async function listProviderOptions(provider) {
  const id = String(provider || "").trim().toLowerCase();
  if (!isAllowedTtsEngine(id)) {
    return {
      provider: id,
      connected: false,
      voices: [],
      models: [],
      error: "Provider is disabled by TTS debug lock.",
    };
  }

  if (id === "elevenlabs") {
    return fetchElevenLabsOptions();
  }

  if (id === "cartesia") {
    return fetchCartesiaOptions();
  }

  return {
    provider: id,
    connected: false,
    voices: [],
    models: [],
    error: "Provider does not expose dynamic options.",
  };
}

export async function getTtsHealthStatus() {
  const providerStatus = listProviderStatus();
  const piperConfig = getPiperConfig();
  const envEngine = String(process.env.TTS_ENGINE || "auto").trim().toLowerCase() || "auto";

  return {
    status: "ok",
    routing: {
      debugLockEnabled: isTtsDebugProviderLockEnabled(),
      allowedEngines: getAllowedTtsEngines(),
      envEngine,
      requestedEngine: getRequestedEngine(),
      autoOrder: getAutoEngineOrder(),
    },
    engines: {
      ...providerStatus,
      kokoro: {
        ...providerStatus.kokoro,
        importError: _kokoroImportError ? String(_kokoroImportError.message || _kokoroImportError) : "",
        loadError: _kokoroLoadError ? String(_kokoroLoadError.message || _kokoroLoadError) : "",
        warmingUp: Boolean(_kokoroInitPromise && !_kokoroTts),
        loadTimeoutMs: getKokoroLoadTimeoutMs(),
        generateTimeoutMs: getKokoroGenerateTimeoutMs(),
      },
      piper: {
        ...providerStatus.piper,
        command: String(piperConfig.command || "").trim(),
        modelPathConfigured: Boolean(piperConfig.modelPath),
        modelPath: piperConfig.modelPath,
        speakerConfigured: Boolean(piperConfig.speaker),
        timeoutMs: piperConfig.timeoutMs,
      },
    },
  };
}
