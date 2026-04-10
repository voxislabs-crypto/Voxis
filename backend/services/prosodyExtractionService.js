import os from "node:os";
import path from "node:path";
import { existsSync, promises as fs } from "node:fs";
import { spawn } from "node:child_process";

const TEMPLATE_DIR = path.resolve(process.cwd(), "prosody-templates");
const AUDIO_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function validateUrl(input) {
  const value = String(input || "").trim();
  if (!/^https?:\/\//i.test(value)) {
    const error = new Error("A valid http(s) URL is required.");
    error.statusCode = 400;
    throw error;
  }

  return value;
}

function createMissingToolError(command, error) {
  const wrapped = new Error(
    `Required prosody extraction tool '${command}' is not installed or not on PATH. Install it and retry. On Ubuntu: sudo apt-get update && sudo apt-get install -y yt-dlp ffmpeg.`,
  );
  wrapped.statusCode = 500;
  wrapped.code = error?.code || "ENOENT";
  return wrapped;
}

function getProsodyYtDlpCommand() {
  const configured = String(process.env.PROSODY_YTDLP_COMMAND || "").trim();
  if (configured) {
    return configured;
  }

  const localBinary = path.join(os.homedir(), ".local", "bin", "yt-dlp");
  return existsSync(localBinary) ? localBinary : "yt-dlp";
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      if (error?.code === "ENOENT") {
        reject(createMissingToolError(command, error));
        return;
      }

      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}. ${stderr.trim()}`.trim()));
    });
  });
}

async function findDownloadedAudio(workspaceDir) {
  const files = await fs.readdir(workspaceDir, { withFileTypes: true });

  const audio = files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .find((name) => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()));

  if (!audio) {
    throw new Error("No audio file was produced from the provided URL.");
  }

  return path.join(workspaceDir, audio);
}

async function defaultDownloadAudio({ url, workspaceDir }) {
  const command = getProsodyYtDlpCommand();
  const outputPattern = path.join(workspaceDir, "source.%(ext)s");

  await runCommand(command, [
    "--no-playlist",
    "--extract-audio",
    "--audio-format",
    "wav",
    "--audio-quality",
    "0",
    "--output",
    outputPattern,
    url,
  ]);

  return findDownloadedAudio(workspaceDir);
}

function parseSilenceDurations(stderr) {
  return String(stderr || "")
    .split("\n")
    .map((line) => line.match(/silence_duration:\s*([0-9.]+)/i)?.[1])
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

async function defaultAnalyzeAudio({ audioPath }) {
  const ffprobeCommand = process.env.PROSODY_FFPROBE_COMMAND || "ffprobe";
  const ffmpegCommand = process.env.PROSODY_FFMPEG_COMMAND || "ffmpeg";

  const probe = await runCommand(ffprobeCommand, [
    "-v",
    "error",
    "-show_entries",
    "stream=sample_rate,channels:format=duration,bit_rate",
    "-of",
    "json",
    audioPath,
  ]);

  let metadata = {};
  try {
    metadata = JSON.parse(probe.stdout || "{}");
  } catch {
    const error = new Error("ffprobe returned invalid JSON while analyzing the prosody source audio.");
    error.statusCode = 502;
    throw error;
  }
  const stream = Array.isArray(metadata.streams) ? metadata.streams[0] || {} : {};
  const format = metadata.format || {};

  const durationSeconds = Number(format.duration) || 0;
  const sampleRate = Number(stream.sample_rate) || 0;
  const channels = Number(stream.channels) || 1;

  const silence = await runCommand(ffmpegCommand, [
    "-hide_banner",
    "-i",
    audioPath,
    "-af",
    "silencedetect=noise=-30dB:d=0.20",
    "-f",
    "null",
    "-",
  ]).catch(() => ({ stderr: "" }));

  return {
    durationSeconds,
    sampleRate,
    channels,
    pauseDurations: parseSilenceDurations(silence.stderr),
  };
}

export function deriveProsodyTemplate({
  sourceUrl,
  durationSeconds = 0,
  sampleRate = 0,
  channels = 1,
  pauseDurations = [],
  extractedAt = new Date().toISOString(),
}) {
  const safeDuration = Math.max(0, Number(durationSeconds) || 0);
  const safePauses = Array.isArray(pauseDurations)
    ? pauseDurations
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 0)
    : [];

  const pauseTotalSeconds = safePauses.reduce((total, value) => total + value, 0);
  const avgPauseSeconds = safePauses.length ? pauseTotalSeconds / safePauses.length : 0;
  const pauseRatio = safeDuration > 0 ? clamp(pauseTotalSeconds / safeDuration, 0, 0.95) : 0;
  const speechDensity = clamp(1 - pauseRatio, 0, 1);

  const cadenceLabel = avgPauseSeconds > 0.65
    ? "deliberate"
    : avgPauseSeconds < 0.25
      ? "rapid"
      : "measured";

  const rhythmLabel = speechDensity > 0.78
    ? "dense"
    : speechDensity < 0.56
      ? "spaced"
      : "balanced";

  return {
    version: 1,
    sourceUrl: String(sourceUrl || ""),
    extractedAt,
    rhythm: {
      label: rhythmLabel,
      speechDensity: Number(speechDensity.toFixed(3)),
      pauseRatio: Number(pauseRatio.toFixed(3)),
    },
    cadence: {
      label: cadenceLabel,
      avgPauseSeconds: Number(avgPauseSeconds.toFixed(3)),
      pauseCount: safePauses.length,
    },
    prosody: {
      contour: cadenceLabel === "rapid" ? "spiky" : cadenceLabel === "deliberate" ? "elongated" : "balanced",
      intensity: rhythmLabel === "dense" ? "high" : rhythmLabel === "spaced" ? "low" : "medium",
    },
    audio: {
      durationSeconds: Number(safeDuration.toFixed(3)),
      sampleRate: Number(sampleRate) || 0,
      channels: Number(channels) || 1,
    },
  };
}

async function defaultWriteTemplate({ personalityId, template }) {
  await fs.mkdir(TEMPLATE_DIR, { recursive: true });
  const outputPath = path.join(TEMPLATE_DIR, `persona-${personalityId}.prosody.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, "utf8");
  return outputPath;
}

export async function extractProsodyTemplateFromUrl({
  personalityId,
  url,
  deps = {},
}) {
  if (!Number.isInteger(Number(personalityId))) {
    const error = new Error("A valid personality id is required for prosody extraction.");
    error.statusCode = 400;
    throw error;
  }

  const sourceUrl = validateUrl(url);
  const createWorkspace = deps.createWorkspace || (() => fs.mkdtemp(path.join(os.tmpdir(), "voxis-prosody-")));
  const removePath = deps.removePath || ((targetPath) => fs.rm(targetPath, { recursive: true, force: true }));
  const downloadAudio = deps.downloadAudio || defaultDownloadAudio;
  const analyzeAudio = deps.analyzeAudio || defaultAnalyzeAudio;
  const writeTemplate = deps.writeTemplate || defaultWriteTemplate;
  const now = deps.now || (() => new Date());
  const onWorkspaceCreated = deps.onWorkspaceCreated || null;
  const onAudioReady = deps.onAudioReady || null;

  const workspaceDir = await createWorkspace();
  if (typeof onWorkspaceCreated === "function") {
    onWorkspaceCreated(workspaceDir);
  }

  let templatePath = "";
  let audioDerived = null;

  try {
    const audioPath = await downloadAudio({ url: sourceUrl, workspaceDir });
    if (typeof onAudioReady === "function") {
      audioDerived = await onAudioReady({ audioPath, workspaceDir, personalityId, sourceUrl });
    }
    const analysis = await analyzeAudio({ audioPath, workspaceDir });

    const template = deriveProsodyTemplate({
      sourceUrl,
      ...analysis,
      extractedAt: now().toISOString(),
    });

    templatePath = await writeTemplate({ personalityId, template });

    return {
      template,
      templatePath,
      sourceUrl,
      extractedAt: template.extractedAt,
      audioDerived,
    };
  } catch (error) {
    if (templatePath) {
      await removePath(templatePath).catch(() => {});
    }

    const wrapped = new Error(`Prosody extraction failed: ${error.message || error}`);
    wrapped.statusCode = error.statusCode || (error?.code === "ENOENT" ? 500 : 502);
    throw wrapped;
  } finally {
    await removePath(workspaceDir).catch(() => {});
  }
}
