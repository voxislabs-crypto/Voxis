import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyzeAudioSegments } from "../services/voiceSegmentationService.js";

describe("voiceSegmentationService", () => {
  it("returns representative clips with public metadata", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "voxis-voice-test-"));
    const audioPath = path.join(tempRoot, "input.wav");
    await fs.writeFile(audioPath, "stub");

    const createdClips = new Set();

    const runCommand = async (command, args) => {
      if (command === "ffprobe") {
        return {
          stdout: JSON.stringify({
            streams: [{ sample_rate: "22050", channels: 1 }],
            format: { duration: "12" },
          }),
          stderr: "",
        };
      }

      if (command === "ffmpeg" && args.includes("silencedetect=noise=-30dB:d=0.30")) {
        return {
          stdout: "",
          stderr: "silence_start: 4\nsilence_end: 5\n",
        };
      }

      if (command === "ffmpeg" && args.includes("astats=metadata=1:reset=0")) {
        return {
          stdout: "",
          stderr: "RMS level dB: -18.5\nZero crossings rate: 0.11\n",
        };
      }

      if (command === "ffmpeg") {
        const outputPath = args[args.length - 1];
        createdClips.add(outputPath);
        await fs.writeFile(outputPath, "clip");
        return { stdout: "", stderr: "" };
      }

      return { stdout: "", stderr: "" };
    };

    const workspaceDir = path.join(tempRoot, "workspace");
    await fs.mkdir(workspaceDir, { recursive: true });

    const result = await analyzeAudioSegments({
      personalityId: 42,
      audioPath,
      deps: {
        workspaceDir,
        runCommand,
        ffprobeCommand: "ffprobe",
        ffmpegCommand: "ffmpeg",
      },
    });

    expect(result.totalSegments).toBeGreaterThan(0);
    expect(Array.isArray(result.representatives)).toBe(true);
    expect(result.representatives.length).toBeGreaterThan(0);
    expect(result.representatives[0].clipFile).toContain("clip-");
    expect(result.representatives[0].voiceBand).toBeDefined();
    expect(result.analysis.averagePitch).toBeGreaterThan(0);
    expect(createdClips.size).toBeGreaterThan(0);

    await fs.rm(path.resolve(process.cwd(), "voice-samples", "persona-42"), { recursive: true, force: true });
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("returns empty analysis for zero-duration audio", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "voxis-voice-test-empty-"));
    const audioPath = path.join(tempRoot, "input.wav");
    await fs.writeFile(audioPath, "stub");

    const runCommand = async (command) => {
      if (command === "ffprobe") {
        return {
          stdout: JSON.stringify({ streams: [{ sample_rate: "22050" }], format: { duration: "0" } }),
          stderr: "",
        };
      }

      return { stdout: "", stderr: "" };
    };

    const result = await analyzeAudioSegments({
      personalityId: 99,
      audioPath,
      deps: {
        workspaceDir: path.join(tempRoot, "workspace"),
        runCommand,
        ffprobeCommand: "ffprobe",
        ffmpegCommand: "ffmpeg",
      },
    });

    expect(result.totalSegments).toBe(0);
    expect(result.representatives).toEqual([]);

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
