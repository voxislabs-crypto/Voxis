import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { stylizeSpeech } from "./speechDirector.js";
import { applyMoodToVoice } from "./moodVoice.js";
import {
  compileProsodyEnvelope,
  applyGenericProsodyText,
  applyProsodyToElevenLabsText,
  applyProsodyToKokoroText,
} from "./prosodyCompiler.js";
import { interpretEmotionSpectrum } from "./emotionSpectrum.js";
import { getTtsCredential, getVoiceDefaults } from "../models/settingsModel.js";

const require = createRequire(import.meta.url);

// Kokoro — lazy-loaded singleton. Model (~171 MB for q8) downloads from HuggingFace on first use.
let _kokoroTts = null;
let _kokoroInitPromise = null;
let _kokoroModule = null;
let _kokoroImportError = null;

const DEFAULT_TTS_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "alloy";
const DEFAULT_TTS_FORMAT = "mp3";
const DEFAULT_FETCH_TIMEOUT_MS = 9000;

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

function getCloudConfig() {
  return {
    baseUrl: (process.env.TTS_BASE_URL || process.env.LLM_BASE_URL || DEFAULT_TTS_BASE_URL).replace(/\/$/, ""),
    apiKey: process.env.TTS_API_KEY || process.env.LLM_API_KEY || "",
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
  };
}

function toTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

  return {
    accent: inferAccent(sourceTokens),
    presentation: inferPresentation(sourceTokens),
    register: inferRegister(sourceTokens),
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
  const requested = String(voiceProfile?.engine || process.env.TTS_ENGINE || "auto").trim().toLowerCase();

  if (requested === "kokoro") return "kokoro";
  if (requested === "elevenlabs") return "elevenlabs";
  if (requested === "cartesia") return "cartesia";
  if (requested === "piper") return "piper";
  if (requested === "cloud" || requested === "openai") return "cloud";

  const autoOrder = getAutoEngineOrder(voiceProfile);
  return autoOrder[0] || "kokoro";
}

export function getAutoEngineOrder(voiceProfile) {
  const defaultSource = getVoiceDefaults().source;
  const preferredOrder = defaultSource === "llm"
    ? ["cloud", "elevenlabs", "cartesia", "piper", "kokoro"]
    : ["elevenlabs", "cartesia", "cloud", "piper", "kokoro"];

  return preferredOrder.filter((engine) => {
    if (engine === "elevenlabs") return isElevenLabsConfigured();
    if (engine === "cartesia") return isCartesiaConfigured();
    if (engine === "cloud") return isCloudConfigured();
    if (engine === "piper") return isPiperConfigured(voiceProfile);
    return isKokoroAvailable();
  });
}

export function isTtsConfigured(voiceProfile = null) {
  return (
    isCloudConfigured() ||
    isPiperConfigured(voiceProfile) ||
    isElevenLabsConfigured() ||
    isCartesiaConfigured() ||
    isKokoroAvailable()
  );
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

export function prepareSpeechSynthesis({ personality, text, voiceProfile, speechHint }) {
  const mood = resolveMood(personality);
  const speechContext = classifySpeechContext({ text, speechHint, personality });

  // stylizeSpeech may prepend [BURP] markers for Rick-style personas.
  // We strip them here — before TTS sees the text — and return them as sfx
  // metadata so the performance controller can emit sfx events to the frontend.
  const sfx = [];
  let directedText = stylizeSpeech(text, personality, mood, { styleMode: speechContext.styleMode }) || String(text || "").trim();
  directedText = directedText.replace(/\[BURP\]\s*/g, () => { sfx.push("burp"); return ""; }).trim();

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
    sfx,
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
    synthesisText = applyProsodyToKokoroText(text, prosodyEnvelope);
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

async function generateCloudSpeechAudio({ personality, text, voiceProfile, speechHint }) {
  const config = getCloudConfig();

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
        voiceProfile.cloudInstructions || "",
        speechHint || "",
        personality.researchSummary || "",
      ]
        .filter(Boolean)
        .join(" "),
    }),
  }, { retries: 1 });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`Cloud TTS request failed with ${response.status}: ${errorText}`);
    error.statusCode = 502;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || getContentType(config.format),
    engine: "cloud",
  };
}

function runPiper({ command, args, text }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
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

async function generatePiperSpeechAudio({ text, voiceProfile }) {
  const config = getPiperConfig();
  const modelPath = String(voiceProfile?.piperModelPath || config.modelPath || "").trim();

  if (!modelPath) {
    const error = new Error(
      "Piper TTS requires PIPER_MODEL_PATH or voiceProfile.piperModelPath.",
    );
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

  // noise_scale: phoneme energy/expressiveness variance (0–1).
  // noise_w: duration/cadence rhythm variation (0–1).
  // Both are driven from mood arousal so high-energy states sound more alive.
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
    await runPiper({ command: config.command, args, text });
    const buffer = await fs.readFile(tmpFile);

    return {
      buffer,
      contentType: "audio/wav",
      engine: "piper",
    };
  } catch (error) {
    const wrapped = new Error(`Piper synthesis failed: ${error.message || error}`);
    wrapped.statusCode = 502;
    throw wrapped;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

// === KOKORO TTS ===

function getKokoroConfig() {
  return {
    voice: process.env.KOKORO_DEFAULT_VOICE || "af_heart",
    dtype: process.env.KOKORO_DTYPE || "q8",
  };
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
  return isKokoroPackageInstalled();
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
  _kokoroInitPromise = loadKokoroModule()
    .then(({ KokoroTTS }) => KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0", {
      dtype: getKokoroConfig().dtype,
    }))
    .then((tts) => {
      _kokoroTts = tts;
      _kokoroInitPromise = null;
      return tts;
    })
    .catch((error) => {
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

async function generateKokoroSpeechAudio({ text, voiceProfile }) {
  if (!isKokoroPackageInstalled()) {
    const error = new Error("Kokoro engine is not installed. Install kokoro-js or choose another TTS engine.");
    error.statusCode = 500;
    throw error;
  }

  const config = getKokoroConfig();
  const voice = String(voiceProfile?.kokoroVoice || voiceProfile?.providerVoice || config.voice).trim();
  const tmpFile = path.join(os.tmpdir(), `voxis-kokoro-${randomUUID()}.wav`);
  try {
    const tts = await loadKokoroTts();
    const audio = await tts.generate(text, { voice });
    await audio.save(tmpFile);
    const buffer = await fs.readFile(tmpFile);
    return { buffer, contentType: "audio/wav", engine: "kokoro" };
  } catch (error) {
    const wrapped = new Error(`Kokoro TTS failed: ${error.message || error}`);
    wrapped.statusCode = 502;
    throw wrapped;
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

// === ELEVENLABS TTS ===

function getElevenLabsConfig() {
  // DB credential (BYOK from browser) takes priority over .env
  let dbCred = null;
  try { dbCred = getTtsCredential("elevenlabs"); } catch { /* db may not be ready */ }
  return {
    apiKey: dbCred?.apiKey || process.env.ELEVENLABS_API_KEY || "",
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

  if (!config.apiKey) {
    const error = new Error("ElevenLabs TTS requires ELEVENLABS_API_KEY to be set.");
    error.statusCode = 500;
    throw error;
  }

  const stability = Math.min(1, Math.max(0, Number(voiceProfile?.stability ?? 0.5)));
  const similarityBoost = Math.min(1, Math.max(0, Number(voiceProfile?.similarityBoost ?? 0.75)));
  const style = Math.min(1, Math.max(0, Number(voiceProfile?.style ?? 0.5)));

  const response = await fetchWithTimeoutRetry(
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
    { retries: 1 },
  );

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

function getCartesiaConfig() {
  // DB credential (BYOK from browser) takes priority over .env
  let dbCred = null;
  try { dbCred = getTtsCredential("cartesia"); } catch { /* db may not be ready */ }
  return {
    apiKey: dbCred?.apiKey || process.env.CARTESIA_API_KEY || "",
    voiceId: dbCred?.voiceId || process.env.CARTESIA_VOICE_ID || "a0e99841-438c-4a64-b679-ae501e7d6091",
    model: dbCred?.model || process.env.CARTESIA_MODEL || "sonic-2",
  };
}

function isCartesiaConfigured() {
  return Boolean(getCartesiaConfig().apiKey);
}

async function generateCartesiaSpeechAudio({ text, voiceProfile }) {
  const config = getCartesiaConfig();
  const voiceId = String(voiceProfile?.cartesiaVoiceId || config.voiceId).trim();
  const model = String(voiceProfile?.cartesiaModel || config.model).trim();

  if (!config.apiKey) {
    const error = new Error("Cartesia TTS requires CARTESIA_API_KEY to be set.");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetchWithTimeoutRetry("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": config.apiKey,
      "Cartesia-Version": "2024-06-10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transcript: text,
      model_id: model,
      voice: { mode: "id", id: voiceId },
      output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
    }),
  }, { retries: 1 });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    const error = new Error(`Cartesia TTS failed with ${response.status}: ${errText}`);
    error.statusCode = 502;
    throw error;
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType: "audio/mpeg", engine: "cartesia" };
}

export async function generateSpeechAudio({ personality, text, voiceProfile, speechHint }) {
  if (!isTtsConfigured(voiceProfile)) {
    const error = new Error(
      "No TTS engine is configured. Set TTS_API_KEY (cloud), PIPER_MODEL_PATH (piper), ELEVENLABS_API_KEY, or CARTESIA_API_KEY. Kokoro is always available as a built-in fallback.",
    );
    error.statusCode = 500;
    throw error;
  }

  const requested = String(voiceProfile?.engine || "auto").trim().toLowerCase();
  const engine = resolveEngine(voiceProfile);
  const { directedText, adjustedVoiceProfile, prosodyEnvelope, speechContext, sfx } = prepareSpeechSynthesis({
    personality,
    text,
    voiceProfile,
    speechHint,
  });
  const emotionFrame = interpretEmotionSpectrum(resolveMood(personality));
  const attemptedEngines = [];

  function shouldFallbackFromExplicitRequest(error) {
    const provider = String(error?.ttsProvider || "").toLowerCase();
    const providerStatus = String(error?.ttsProviderStatus || "").toLowerCase();
    const statusCode = Number(error?.statusCode || 0);
    const upstreamStatus = Number(error?.providerStatus || 0);

    if (provider !== "elevenlabs") {
      return false;
    }

    return (
      statusCode === 429 ||
      upstreamStatus === 429 ||
      providerStatus === "too_many_concurrent_requests" ||
      providerStatus === "concurrent_limit_exceeded" ||
      providerStatus === "quota_exceeded"
    );
  }

  async function runEngine(eng, profileOverride = adjustedVoiceProfile) {
    attemptedEngines.push(eng);
    const { synthesisText, effectiveVoiceProfile } = prepareEngineInput({
      engine: eng,
      text: directedText,
      voiceProfile: profileOverride,
      prosodyEnvelope,
    });

    switch (eng) {
      case "kokoro":
        return generateKokoroSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
      case "elevenlabs":
        return generateElevenLabsSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
      case "cartesia":
        return generateCartesiaSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
      case "piper":
        return generatePiperSpeechAudio({ text: synthesisText, voiceProfile: effectiveVoiceProfile });
      default:
        return generateCloudSpeechAudio({
          personality,
          speechHint,
          text: synthesisText,
          voiceProfile: effectiveVoiceProfile,
        });
    }
  }

  try {
    const audio = await runEngine(engine);
    return {
      ...audio,
      directedText,
      adjustedVoiceProfile,
      prosodyEnvelope,
      speechContext,
      telemetry: {
        requested,
        chosenEngine: audio.engine || engine,
        attemptedEngines,
        fallbackUsed: false,
        emotionFrame,
      },
      sfx,
    };
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
        return {
          ...audio,
          directedText,
          adjustedVoiceProfile: fallbackVoiceProfile,
          prosodyEnvelope,
          speechContext,
          telemetry: {
            requested,
            chosenEngine: audio.engine || fallbackEngine,
            attemptedEngines,
            fallbackUsed: true,
            fallbackFrom: engine,
            fallbackReason: primaryError.message || "Primary engine failed.",
            emotionFrame,
          },
          sfx,
        };
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
  return {
    kokoro: {
      available: isKokoroAvailable(),
      installed: isKokoroPackageInstalled(),
      loaded: Boolean(_kokoroTts),
      requiresSetup: false,
      capabilities: getEngineCapabilities("kokoro"),
    },
    elevenlabs: {
      available: isElevenLabsConfigured(),
      requiresEnv: "ELEVENLABS_API_KEY or Settings -> TTS",
      capabilities: getEngineCapabilities("elevenlabs"),
    },
    cartesia: {
      available: isCartesiaConfigured(),
      requiresEnv: "CARTESIA_API_KEY or Settings -> TTS",
      capabilities: getEngineCapabilities("cartesia"),
    },
    piper: {
      available: isPiperConfigured(),
      requiresEnv: "PIPER_MODEL_PATH",
      capabilities: getEngineCapabilities("piper"),
    },
    cloud: {
      available: isCloudConfigured(),
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

  const headers = {
    "xi-api-key": config.apiKey,
    "Content-Type": "application/json",
  };

  let voices = [];
  let builtinVoices = [];
  let customVoices = [];
  let models = [];
  let error = "";

  try {
    const voicesResponse = await fetchWithTimeoutRetry("https://api.elevenlabs.io/v1/voices", { headers }, { retries: 1 });
    if (!voicesResponse.ok) {
      throw new Error(`voices request failed (${voicesResponse.status})`);
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

    builtinVoices = mapped.filter((voice) => !voice.isCustom).sort(sortByLabel);
    customVoices = mapped.filter((voice) => voice.isCustom).sort(sortByLabel);
    voices = [...builtinVoices, ...customVoices].map(({ id, label }) => ({ id, label }));
  } catch (fetchError) {
    error = `Unable to fetch ElevenLabs voices: ${fetchError.message || fetchError}`;
  }

  try {
    const modelsResponse = await fetchWithTimeoutRetry("https://api.elevenlabs.io/v1/models", { headers }, { retries: 1 });
    if (!modelsResponse.ok) {
      throw new Error(`models request failed (${modelsResponse.status})`);
    }
    const payload = await modelsResponse.json();
    models = (Array.isArray(payload) ? payload : [])
      .filter((model) => model?.can_do_text_to_speech !== false)
      .map((model) => ({
        id: String(model?.model_id || model?.id || "").trim(),
        label: normalizeOptionName(model?.name, model?.model_id || model?.id),
      }))
      .filter((model) => model.id)
      .sort(sortByLabel);
  } catch (fetchError) {
    if (!error) {
      error = `Unable to fetch ElevenLabs models: ${fetchError.message || fetchError}`;
    }
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

  let voices = [];
  let models = [];
  let error = "";

  try {
    const voicesResponse = await fetchWithTimeoutRetry("https://api.cartesia.ai/voices", { headers }, { retries: 1 });
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
      }))
      .filter((voice) => voice.id)
      .sort(sortByLabel);
  } catch (fetchError) {
    error = `Unable to fetch Cartesia voices: ${fetchError.message || fetchError}`;
  }

  try {
    const modelsResponse = await fetchWithTimeoutRetry("https://api.cartesia.ai/models", { headers }, { retries: 1 });
    if (!modelsResponse.ok) {
      throw new Error(`models request failed (${modelsResponse.status})`);
    }
    const payload = await modelsResponse.json();
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.models)
        ? payload.models
        : [];

    models = list
      .map((model) => ({
        id: String(model?.id || model?.model_id || "").trim(),
        label: normalizeOptionName(model?.name, model?.id || model?.model_id),
      }))
      .filter((model) => model.id)
      .sort(sortByLabel);
  } catch (fetchError) {
    if (!error) {
      error = `Unable to fetch Cartesia models: ${fetchError.message || fetchError}`;
    }
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
    error,
  };
}

export async function listProviderOptions(provider) {
  const id = String(provider || "").trim().toLowerCase();
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

  return {
    status: "ok",
    engines: {
      ...providerStatus,
      kokoro: {
        ...providerStatus.kokoro,
        importError: _kokoroImportError ? String(_kokoroImportError.message || _kokoroImportError) : "",
      },
    },
  };
}
