import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

const DEFAULT_CLIP_SECONDS = 4;
const MAX_CANDIDATE_CLIPS = 12;
const SAMPLE_DIR = path.resolve(process.cwd(), "voice-samples");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function classifyVoiceBand(spectralCentroid) {
  if (spectralCentroid < 2000) return "low";
  if (spectralCentroid > 5000) return "high";
  return "mid";
}

function classifyVoiceQuality({ rmsDb, zcr }) {
  if (!Number.isFinite(rmsDb) || !Number.isFinite(zcr)) {
    return "unknown";
  }

  if (rmsDb > -18 && zcr < 0.09) {
    return "clear";
  }

  if (zcr >= 0.14) {
    return "breathy";
  }

  if (rmsDb <= -24 && zcr < 0.08) {
    return "tense";
  }

  return "clear";
}

function inferVoiceLabel(spectralCentroid) {
  if (spectralCentroid < 2600) return "deep";
  if (spectralCentroid > 4600) return "bright";
  return "balanced";
}

function parseAstats(stderr, sampleRate) {
  const text = String(stderr || "");
  const rmsMatch = text.match(/RMS level dB:\s*(-?[0-9.]+)/i);
  const zcrMatch = text.match(/Zero crossings rate:\s*([0-9.]+)/i);

  const rmsDb = rmsMatch ? parseNumber(rmsMatch[1], -30) : -30;
  const zcr = zcrMatch ? parseNumber(zcrMatch[1], 0.08) : 0.08;

  const sr = parseNumber(sampleRate, 22050);
  const averagePitch = clamp((zcr * sr) / 2, 70, 320);
  const spectralCentroid = clamp((zcr * sr * 1.8), 1200, 7800);

  return { rmsDb, zcr, averagePitch, spectralCentroid };
}

function parseSilenceWindows(stderr) {
  const rows = String(stderr || "").split("\n");
  const windows = [];
  let activeStart = null;

  for (const row of rows) {
    const startMatch = row.match(/silence_start:\s*([0-9.]+)/i);
    if (startMatch) {
      activeStart = parseNumber(startMatch[1], null);
      continue;
    }

    const endMatch = row.match(/silence_end:\s*([0-9.]+)/i);
    if (endMatch && activeStart != null) {
      windows.push({ start: activeStart, end: parseNumber(endMatch[1], activeStart) });
      activeStart = null;
    }
  }

  return windows.filter((window) => window.end > window.start);
}

async function ensureDir(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function runCommand(command, args) {
  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}. ${stderr.trim()}`.trim()));
    });
  });
}

export async function analyzeAudioSegments({
  personalityId,
  audioPath,
  clipSeconds = DEFAULT_CLIP_SECONDS,
  maxClips = MAX_CANDIDATE_CLIPS,
  deps = {},
}) {
  const ffprobeCommand = deps.ffprobeCommand || process.env.PROSODY_FFPROBE_COMMAND || "ffprobe";
  const ffmpegCommand = deps.ffmpegCommand || process.env.PROSODY_FFMPEG_COMMAND || "ffmpeg";
  const run = deps.runCommand || runCommand;
  const workspaceDir = deps.workspaceDir || await fs.mkdtemp(path.join(os.tmpdir(), "voxis-voice-segments-"));

  let shouldCleanupWorkspace = !deps.workspaceDir;

  try {
    const probe = await run(ffprobeCommand, [
      "-v",
      "error",
      "-show_entries",
      "stream=sample_rate,channels:format=duration",
      "-of",
      "json",
      audioPath,
    ]);

    const probeJson = JSON.parse(probe.stdout || "{}");
    const stream = Array.isArray(probeJson.streams) ? probeJson.streams[0] || {} : {};
    const format = probeJson.format || {};
    const durationSeconds = parseNumber(format.duration, 0);
    const sampleRate = parseNumber(stream.sample_rate, 22050);

    if (durationSeconds <= 0) {
      return {
        totalSegments: 0,
        segments: [],
        representatives: [],
        analysis: {
          averagePitch: 0,
          averageSpectral: 0,
          averageDensity: 0,
          distribution: {},
        },
      };
    }

    const silence = await run(ffmpegCommand, [
      "-hide_banner",
      "-i",
      audioPath,
      "-af",
      "silencedetect=noise=-30dB:d=0.30",
      "-f",
      "null",
      "-",
    ]).catch(() => ({ stderr: "" }));

    const silenceWindows = parseSilenceWindows(silence.stderr);
    const speechWindows = [];
    let cursor = 0;

    for (const window of silenceWindows) {
      if (window.start > cursor) {
        speechWindows.push({ start: cursor, end: window.start });
      }
      cursor = Math.max(cursor, window.end);
    }

    if (cursor < durationSeconds) {
      speechWindows.push({ start: cursor, end: durationSeconds });
    }

    const candidateWindows = [];
    for (const region of speechWindows) {
      const regionDuration = region.end - region.start;
      if (regionDuration < 0.6) continue;

      const chunks = Math.ceil(regionDuration / clipSeconds);
      for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex += 1) {
        if (candidateWindows.length >= maxClips) break;

        const start = region.start + chunkIndex * clipSeconds;
        const end = Math.min(region.end, start + clipSeconds);
        if (end - start < 0.6) continue;

        candidateWindows.push({ start, end });
      }

      if (candidateWindows.length >= maxClips) {
        break;
      }
    }

    if (candidateWindows.length === 0) {
      candidateWindows.push({ start: 0, end: Math.min(durationSeconds, clipSeconds) });
    }

    const segments = [];

    for (let index = 0; index < candidateWindows.length; index += 1) {
      const window = candidateWindows[index];
      const clipPath = path.join(workspaceDir, `segment-${index}.wav`);
      const segmentDuration = Number((window.end - window.start).toFixed(3));

      await run(ffmpegCommand, [
        "-hide_banner",
        "-y",
        "-i",
        audioPath,
        "-ss",
        String(window.start),
        "-t",
        String(segmentDuration),
        "-ac",
        "1",
        "-ar",
        String(sampleRate),
        clipPath,
      ]).catch(() => null);

      try {
        await fs.access(clipPath);
      } catch {
        continue;
      }

      const astats = await run(ffmpegCommand, [
        "-hide_banner",
        "-i",
        clipPath,
        "-af",
        "astats=metadata=1:reset=0",
        "-f",
        "null",
        "-",
      ]).catch(() => ({ stderr: "" }));

      const metrics = parseAstats(astats.stderr, sampleRate);
      const hasSpeech = metrics.rmsDb > -45;
      const speechDensity = clamp(1 - Math.max(0, -metrics.rmsDb - 16) / 45, 0, 1);
      const confidence = clamp(
        0.45 + (hasSpeech ? 0.25 : 0) + Math.min(0.2, speechDensity * 0.2) + Math.min(0.1, metrics.zcr),
        0,
        0.99,
      );

      segments.push({
        clipIndex: index,
        startTime: Number(window.start.toFixed(3)),
        endTime: Number(window.end.toFixed(3)),
        duration: segmentDuration,
        hasSpeech,
        speechDensity: Number(speechDensity.toFixed(3)),
        averagePitch: Number(metrics.averagePitch.toFixed(2)),
        spectralCentroid: Number(metrics.spectralCentroid.toFixed(2)),
        zcr: Number(metrics.zcr.toFixed(4)),
        energyDb: Number(metrics.rmsDb.toFixed(2)),
        voiceBand: classifyVoiceBand(metrics.spectralCentroid),
        voiceQuality: classifyVoiceQuality({ rmsDb: metrics.rmsDb, zcr: metrics.zcr }),
        voiceLabel: inferVoiceLabel(metrics.spectralCentroid),
        confidence: Number(confidence.toFixed(3)),
        clipPath,
      });
    }

    const ranked = [...segments]
      .filter((segment) => segment.hasSpeech)
      .sort((a, b) => b.confidence - a.confidence);

    const representatives = [];
    const bands = ["low", "mid", "high"];

    for (const band of bands) {
      const inBand = ranked.find((segment) => segment.voiceBand === band);
      if (inBand) {
        representatives.push(inBand);
      }
    }

    for (const segment of ranked) {
      if (representatives.length >= 3) break;
      if (!representatives.some((entry) => entry.clipIndex === segment.clipIndex)) {
        representatives.push(segment);
      }
    }

    const outputDir = path.join(SAMPLE_DIR, `persona-${personalityId}`);
    await ensureDir(outputDir);

    const persistedRepresentatives = [];
    for (const sample of representatives.slice(0, 3)) {
      const fileName = `clip-${sample.clipIndex}.wav`;
      const outputPath = path.join(outputDir, fileName);
      await fs.copyFile(sample.clipPath, outputPath);

      persistedRepresentatives.push({
        ...sample,
        clipPath: undefined,
        clipFile: fileName,
      });
    }

    const averagePitch = segments.length
      ? segments.reduce((sum, segment) => sum + segment.averagePitch, 0) / segments.length
      : 0;
    const averageSpectral = segments.length
      ? segments.reduce((sum, segment) => sum + segment.spectralCentroid, 0) / segments.length
      : 0;
    const averageDensity = segments.length
      ? segments.reduce((sum, segment) => sum + segment.speechDensity, 0) / segments.length
      : 0;

    const distribution = segments.reduce((acc, segment) => {
      if (!segment.hasSpeech) return acc;
      acc[segment.voiceBand] = (acc[segment.voiceBand] || 0) + 1;
      return acc;
    }, {});

    return {
      totalSegments: segments.length,
      segments: segments.map((segment) => ({ ...segment, clipPath: undefined })),
      representatives: persistedRepresentatives,
      analysis: {
        averagePitch: Number(averagePitch.toFixed(2)),
        averageSpectral: Number(averageSpectral.toFixed(2)),
        averageDensity: Number(averageDensity.toFixed(3)),
        distribution,
      },
      sampleDir: outputDir,
    };
  } finally {
    if (shouldCleanupWorkspace) {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
