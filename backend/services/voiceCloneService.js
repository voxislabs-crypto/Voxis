/**
 * voiceCloneService.js
 *
 * Shared extraction pipeline for voice cloning.
 * Handles: YouTube URL (yt-dlp) or WAV/MP3 file path → clean 16kHz mono WAV.
 *
 * Dependencies (must be installed on host):
 *   yt-dlp   — pip install yt-dlp   OR  brew install yt-dlp
 *   ffmpeg   — apt install ffmpeg   OR  brew install ffmpeg
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE_DIR = path.dirname(fileURLToPath(import.meta.url));

const VOICE_CLONES_DIR = path.join(SERVICE_DIR, "..", "voice-clones");

const RVC_PACKS_DIR = path.join(SERVICE_DIR, "..", "rvc-voice-packs");

export async function ensureVoiceClonesDir(personalityId) {
  const dir = path.join(VOICE_CLONES_DIR, `persona-${personalityId}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function ensureRvcPacksDir(packId) {
  const dir = path.join(RVC_PACKS_DIR, String(packId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function getVoiceCloneDir(personalityId) {
  return path.join(VOICE_CLONES_DIR, `persona-${personalityId}`);
}

export function getRvcPackDir(packId) {
  return path.join(RVC_PACKS_DIR, String(packId));
}

/**
 * Run a shell command, return stdout as Buffer.
 * Calls onProgress with { step, pct, message } if provided.
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { ...options, stdio: ["pipe", "pipe", "pipe"] });
    const stderr = [];
    proc.stderr.on("data", (d) => stderr.push(d));
    proc.on("close", (code) => {
      if (code !== 0) {
        const errText = Buffer.concat(stderr).toString("utf8").slice(0, 500);
        const err = new Error(`${command} exited with code ${code}: ${errText}`);
        err.statusCode = 500;
        reject(err);
      } else {
        resolve(Buffer.concat(stderr)); // some tools write to stderr even on success
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

/**
 * Download audio from a YouTube URL using yt-dlp.
 * Returns path to the downloaded audio file (webm/m4a/mp3).
 */
async function downloadFromYoutube(youtubeUrl, tmpDir, onProgress) {
  onProgress({ step: "downloading", pct: 5, message: "Fetching audio from URL…" });

  const outTemplate = path.join(tmpDir, "yt-audio.%(ext)s");

  await runCommand("yt-dlp", [
    "--no-playlist",
    "--extract-audio",
    "--audio-format", "best",
    "--audio-quality", "0",
    "--output", outTemplate,
    "--no-progress",
    "--quiet",
    youtubeUrl,
  ]);

  // Find the downloaded file
  const files = await fs.readdir(tmpDir);
  const downloaded = files.find((f) => f.startsWith("yt-audio."));
  if (!downloaded) {
    const err = new Error("yt-dlp did not produce an output file. Check that the URL is valid.");
    err.statusCode = 422;
    throw err;
  }

  onProgress({ step: "downloading", pct: 20, message: "Audio downloaded." });
  return path.join(tmpDir, downloaded);
}

/**
 * Use ffmpeg to:
 *  1. Trim to first 60 seconds (enough for voice reference; keeps things fast)
 *  2. Convert to 16kHz mono WAV
 *  3. Apply loudnorm to –16 LUFS
 *  4. Trim leading/trailing silence
 *
 * Returns path to the cleaned WAV file.
 */
async function normalizeAudio(inputPath, tmpDir, onProgress) {
  onProgress({ step: "normalizing", pct: 35, message: "Normalizing audio (this may take a moment)…" });

  const outputPath = path.join(tmpDir, `normalized-${randomUUID()}.wav`);

  await runCommand("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-t", "60",                          // take at most 60 seconds
    "-ar", "16000",                       // 16kHz sample rate (required by OpenVoice + RVC)
    "-ac", "1",                           // mono
    "-af", [
      "silenceremove=start_periods=1:start_silence=0.3:start_threshold=-50dB",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
    ].join(","),
    "-f", "wav",
    outputPath,
  ]);

  onProgress({ step: "normalizing", pct: 55, message: "Audio normalized." });

  // Basic sanity check — make sure the file is a reasonable size
  const stat = await fs.stat(outputPath);
  if (stat.size < 8192) {
    const err = new Error(
      "Normalized audio is too short or silent. Use a clip with at least 6 seconds of clear speech.",
    );
    err.statusCode = 422;
    throw err;
  }

  return outputPath;
}

/**
 * Main extraction pipeline.
 *
 * @param {object} options
 * @param {string} [options.youtubeUrl]    YouTube URL to extract from
 * @param {string} [options.uploadedPath]  Path to a pre-uploaded WAV/MP3 file
 * @param {function} options.onProgress    Progress callback: ({ step, pct, message })
 * @returns {Promise<{ cleanedWavPath: string, tmpDir: string }>}
 *   tmpDir must be cleaned up by the caller after the file is moved.
 */
export async function extractAndNormalize({ youtubeUrl, uploadedPath, onProgress }) {
  if (!youtubeUrl && !uploadedPath) {
    const err = new Error("Provide either a YouTube URL or an uploaded audio file.");
    err.statusCode = 400;
    throw err;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "voxis-clone-"));

  try {
    let sourcePath;

    if (youtubeUrl) {
      // Validate URL format before shelling out
      try {
        const parsed = new URL(youtubeUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
      } catch {
        const err = new Error("Invalid URL. Provide a full https:// YouTube link.");
        err.statusCode = 400;
        throw err;
      }
      sourcePath = await downloadFromYoutube(youtubeUrl, tmpDir, onProgress);
    } else {
      sourcePath = uploadedPath;
      onProgress({ step: "received", pct: 20, message: "File received." });
    }

    const cleanedWavPath = await normalizeAudio(sourcePath, tmpDir, onProgress);
    return { cleanedWavPath, tmpDir };
  } catch (err) {
    // Clean up tmp dir on extraction failure
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/**
 * Check whether yt-dlp is available on the system PATH.
 */
export async function isYtDlpInstalled() {
  try {
    await runCommand("yt-dlp", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether ffmpeg is available on the system PATH.
 */
export async function isFfmpegInstalled() {
  try {
    await runCommand("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

export async function getVoiceClonePipelineStatus() {
  const [ytdlp, ffmpeg] = await Promise.all([isYtDlpInstalled(), isFfmpegInstalled()]);
  return { ytdlp, ffmpeg, ready: ytdlp && ffmpeg };
}
