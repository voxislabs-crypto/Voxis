import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

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

function isCloudConfigured() {
  const { apiKey, baseUrl } = getCloudConfig();
  return Boolean(apiKey) || baseUrl !== DEFAULT_TTS_BASE_URL;
}

function isPiperConfigured() {
  const { modelPath } = getPiperConfig();
  return Boolean(modelPath);
}

function resolveEngine(voiceProfile) {
  const requested = String(voiceProfile?.engine || process.env.TTS_ENGINE || "auto").trim().toLowerCase();

  if (requested === "piper") {
    return "piper";
  }

  if (requested === "cloud" || requested === "openai") {
    return "cloud";
  }

  if (isPiperConfigured()) {
    return "piper";
  }

  return "cloud";
}

export function isTtsConfigured() {
  return isCloudConfigured() || isPiperConfigured();
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
  if (!isTtsConfigured()) {
    const error = new Error(
      "No TTS engine is configured. Configure Cloud TTS (TTS_API_KEY/TTS_BASE_URL) or Piper (PIPER_MODEL_PATH).",
    );
    error.statusCode = 500;
    throw error;
  }

  const requested = String(voiceProfile?.engine || "auto").trim().toLowerCase();
  const engine = resolveEngine(voiceProfile);

  if (engine === "piper") {
    try {
      return await generatePiperSpeechAudio({ text, voiceProfile });
    } catch (error) {
      if (requested === "piper") {
        throw error;
      }

      if (isCloudConfigured()) {
        return generateCloudSpeechAudio({ personality, text, voiceProfile });
      }

      throw error;
    }
  }

  return generateCloudSpeechAudio({ personality, text, voiceProfile });
}
