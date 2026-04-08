import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { stylizeSpeech } from "./speechDirector.js";

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

  if (requested === "piper") {
    return "piper";
  }

  if (requested === "cloud" || requested === "openai") {
    return "cloud";
  }

  if (isPiperConfigured(voiceProfile)) {
    return "piper";
  }

  return "cloud";
}

export function isTtsConfigured(voiceProfile = null) {
  return isCloudConfigured() || isPiperConfigured(voiceProfile);
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

async function generateCloudSpeechAudio({ personality, text, voiceProfile }) {
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

export async function generateSpeechAudio({ personality, text, voiceProfile }) {
  if (!isTtsConfigured(voiceProfile)) {
    const error = new Error(
      "No TTS engine is configured. Configure Cloud TTS (TTS_API_KEY/TTS_BASE_URL) or Piper (PIPER_MODEL_PATH).",
    );
    error.statusCode = 500;
    throw error;
  }

  const requested = String(voiceProfile?.engine || "auto").trim().toLowerCase();
  const engine = resolveEngine(voiceProfile);
  const directedText = stylizeSpeech(text, personality) || String(text || "").trim();

  if (engine === "piper") {
    try {
      return await generatePiperSpeechAudio({ text: directedText, voiceProfile });
    } catch (error) {
      if (requested === "piper") {
        throw error;
      }

      if (isCloudConfigured()) {
        return generateCloudSpeechAudio({ personality, text: directedText, voiceProfile });
      }

      throw error;
    }
  }

  return generateCloudSpeechAudio({ personality, text: directedText, voiceProfile });
}
