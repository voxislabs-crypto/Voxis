import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { stylizeSpeech } from "./speechDirector.js";
import { applyMoodToVoice } from "./moodVoice.js";
import { getTtsCredential } from "../models/settingsModel.js";

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

function getCloudConfig() {
  return {
    baseUrl: (process.env.TTS_BASE_URL || process.env.LLM_BASE_URL || DEFAULT_TTS_BASE_URL).replace(/\/$/, ""),
    apiKey: process.env.TTS_API_KEY || process.env.LLM_API_KEY || "",
    model: process.env.TTS_MODEL || DEFAULT_TTS_MODEL,
    voice: process.env.TTS_DEFAULT_VOICE || DEFAULT_TTS_VOICE,
    format: process.env.TTS_RESPONSE_FORMAT || DEFAULT_TTS_FORMAT,
  };
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
  return Boolean(apiKey) || baseUrl !== DEFAULT_TTS_BASE_URL;
}

function isPiperConfigured(voiceProfile = null) {
  const { modelPath } = getPiperConfig();
  const overrideModelPath = String(voiceProfile?.piperModelPath || "").trim();
  return Boolean(overrideModelPath || modelPath);
}

function resolveEngine(voiceProfile) {
  const requested = String(voiceProfile?.engine || process.env.TTS_ENGINE || "auto").trim().toLowerCase();

  if (requested === "kokoro") return "kokoro";
  if (requested === "elevenlabs") return "elevenlabs";
  if (requested === "cartesia") return "cartesia";
  if (requested === "piper") return "piper";
  if (requested === "cloud" || requested === "openai") return "cloud";

  // Auto: preserve backward-compat order (cloud → piper), then Kokoro as built-in fallback.
  if (isCloudConfigured()) return "cloud";
  if (isPiperConfigured(voiceProfile)) return "piper";
  return "kokoro";
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

export function prepareSpeechSynthesis({ personality, text, voiceProfile }) {
  const mood = resolveMood(personality);

  // stylizeSpeech may prepend [BURP] markers for Rick-style personas.
  // We strip them here — before TTS sees the text — and return them as sfx
  // metadata so the performance controller can emit sfx events to the frontend.
  const sfx = [];
  let directedText = stylizeSpeech(text, personality, mood) || String(text || "").trim();
  directedText = directedText.replace(/\[BURP\]\s*/g, () => { sfx.push("burp"); return ""; }).trim();

  const adjustedVoiceProfile = {
    ...applyMoodToVoice(voiceProfile, mood),
    moodArousal: Number.isFinite(Number(mood?.arousal)) ? Number(mood.arousal) : undefined,
  };

  return {
    mood,
    directedText,
    adjustedVoiceProfile,
    sfx,
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

  const response = await fetch(`${config.baseUrl}/audio/speech`, {
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
        speechHint || "",
        personality.researchSummary || "",
      ]
        .filter(Boolean)
        .join(" "),
    }),
  });

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
  const lengthScale = Math.min(1.6, Math.max(0.55, Number((1 / rate).toFixed(3))));
  args.push("--length_scale", String(lengthScale));

  // noise_scale: phoneme energy/expressiveness variance (0–1).
  // noise_w: duration/cadence rhythm variation (0–1).
  // Both are driven from mood arousal so high-energy states sound more alive.
  const arousal = Number(voiceProfile?.moodArousal);
  if (Number.isFinite(arousal)) {
    const noiseScale = Math.min(1.0, Math.max(0.2, 0.5 + arousal * 0.4));
    const noiseW = Math.min(1.0, Math.max(0.3, 0.6 + arousal * 0.3));
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

  const response = await fetch(
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
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    const error = new Error(`ElevenLabs TTS failed with ${response.status}: ${errText}`);
    error.statusCode = 502;
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

  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
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
  });

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
  const { directedText, adjustedVoiceProfile, sfx } = prepareSpeechSynthesis({
    personality,
    text,
    voiceProfile,
  });

  async function runEngine(eng) {
    switch (eng) {
      case "kokoro":
        return generateKokoroSpeechAudio({ text: directedText, voiceProfile: adjustedVoiceProfile });
      case "elevenlabs":
        return generateElevenLabsSpeechAudio({ text: directedText, voiceProfile: adjustedVoiceProfile });
      case "cartesia":
        return generateCartesiaSpeechAudio({ text: directedText, voiceProfile: adjustedVoiceProfile });
      case "piper":
        return generatePiperSpeechAudio({ text: directedText, voiceProfile: adjustedVoiceProfile });
      default:
        return generateCloudSpeechAudio({
          personality,
          speechHint,
          text: directedText,
          voiceProfile: adjustedVoiceProfile,
        });
    }
  }

  try {
    const audio = await runEngine(engine);
    return { ...audio, directedText, adjustedVoiceProfile, sfx };
  } catch (primaryError) {
    // If the engine was explicitly requested, don't silently fall back.
    if (requested !== "auto") throw primaryError;

    // Auto fallback chain: try remaining engines in priority order.
    const fallbackOrder = ["cloud", "piper", "kokoro"].filter((e) => {
      if (e === engine) return false;
      if (e === "cloud") return isCloudConfigured();
      if (e === "piper") return isPiperConfigured(voiceProfile);
      return isKokoroAvailable();
    });

    for (const fallbackEngine of fallbackOrder) {
      try {
        const audio = await runEngine(fallbackEngine);
        return { ...audio, directedText, adjustedVoiceProfile, sfx };
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
    },
    elevenlabs: { available: isElevenLabsConfigured(), requiresEnv: "ELEVENLABS_API_KEY or Settings -> TTS" },
    cartesia: { available: isCartesiaConfigured(), requiresEnv: "CARTESIA_API_KEY or Settings -> TTS" },
    piper: { available: isPiperConfigured(), requiresEnv: "PIPER_MODEL_PATH" },
    cloud: { available: isCloudConfigured(), requiresEnv: "TTS_API_KEY or LLM_API_KEY" },
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
  let models = [];
  let error = "";

  try {
    const voicesResponse = await fetch("https://api.elevenlabs.io/v1/voices", { headers });
    if (!voicesResponse.ok) {
      throw new Error(`voices request failed (${voicesResponse.status})`);
    }
    const payload = await voicesResponse.json();
    voices = (Array.isArray(payload?.voices) ? payload.voices : [])
      .map((voice) => ({
        id: String(voice?.voice_id || "").trim(),
        label: normalizeOptionName(voice?.name, voice?.voice_id),
      }))
      .filter((voice) => voice.id)
      .sort(sortByLabel);
  } catch (fetchError) {
    error = `Unable to fetch ElevenLabs voices: ${fetchError.message || fetchError}`;
  }

  try {
    const modelsResponse = await fetch("https://api.elevenlabs.io/v1/models", { headers });
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
    const voicesResponse = await fetch("https://api.cartesia.ai/voices", { headers });
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
    const modelsResponse = await fetch("https://api.cartesia.ai/models", { headers });
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
