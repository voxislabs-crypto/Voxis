import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deriveProsodyTemplate,
  extractProsodyTemplateFromUrl,
} from "../services/prosodyExtractionService.js";

describe("prosodyExtractionService", () => {
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "voxis-prosody-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("derives stable cadence/rhythm metrics from analysis inputs", () => {
    const template = deriveProsodyTemplate({
      sourceUrl: "https://example.com/video",
      durationSeconds: 12,
      pauseDurations: [0.1, 0.18, 0.14],
      sampleRate: 22050,
      channels: 1,
      extractedAt: "2026-04-08T00:00:00.000Z",
    });

    expect(template.cadence.label).toBe("rapid");
    expect(template.rhythm.label).toBe("dense");
    expect(template.prosody.intensity).toBe("high");
    expect(template.audio.sampleRate).toBe(22050);
  });

  it("cleans temp workspace after successful extraction", async () => {
    let workspaceDir = "";
    const templatePath = path.join(tempRoot, "persona-42.prosody.json");

    const result = await extractProsodyTemplateFromUrl({
      personalityId: 42,
      url: "https://example.com/source",
      deps: {
        createWorkspace: () => fs.mkdtemp(path.join(tempRoot, "workspace-")),
        onWorkspaceCreated: (dir) => {
          workspaceDir = dir;
        },
        downloadAudio: async ({ workspaceDir: dir }) => {
          const filePath = path.join(dir, "sample.wav");
          await fs.writeFile(filePath, "audio-data");
          return filePath;
        },
        analyzeAudio: async () => ({
          durationSeconds: 10,
          sampleRate: 24000,
          channels: 1,
          pauseDurations: [0.4, 0.5],
        }),
        writeTemplate: async ({ template }) => {
          await fs.writeFile(templatePath, JSON.stringify(template), "utf8");
          return templatePath;
        },
      },
    });

    expect(result.templatePath).toBe(templatePath);
    await expect(fs.readFile(templatePath, "utf8")).resolves.toContain("cadence");
    await expect(fs.access(workspaceDir)).rejects.toBeTruthy();
  });

  it("cleans temp workspace when extraction fails", async () => {
    let workspaceDir = "";

    await expect(
      extractProsodyTemplateFromUrl({
        personalityId: 44,
        url: "https://example.com/fail",
        deps: {
          createWorkspace: () => fs.mkdtemp(path.join(tempRoot, "workspace-")),
          onWorkspaceCreated: (dir) => {
            workspaceDir = dir;
          },
          downloadAudio: async ({ workspaceDir: dir }) => {
            const filePath = path.join(dir, "broken.wav");
            await fs.writeFile(filePath, "audio-data");
            return filePath;
          },
          analyzeAudio: async () => {
            throw new Error("analysis failed");
          },
        },
      }),
    ).rejects.toThrow("Prosody extraction failed");

    await expect(fs.access(workspaceDir)).rejects.toBeTruthy();
  });

  it("surfaces a clear error when a required prosody tool is missing", async () => {
    await expect(
      extractProsodyTemplateFromUrl({
        personalityId: 45,
        url: "https://example.com/fail",
        deps: {
          createWorkspace: () => fs.mkdtemp(path.join(tempRoot, "workspace-")),
          downloadAudio: async () => {
            const error = new Error("spawn yt-dlp ENOENT");
            error.code = "ENOENT";
            error.statusCode = 500;
            throw error;
          },
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: expect.stringContaining("Prosody extraction failed"),
    });
  });
});
