import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("ttsService Piper voice discovery", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "voxis-piper-voices-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists local Piper voices and speaker metadata from discovered models", async () => {
    const modelPath = path.join(tempDir, "en_US-lessac-medium.onnx");
    await writeFile(modelPath, "fake-model");
    await writeFile(
      `${modelPath}.json`,
      JSON.stringify({
        speaker_id_map: {
          default: 0,
          bright: 1,
        },
      }),
    );

    const { listPiperVoiceOptions } = await import("../services/ttsService.js");
    const result = await listPiperVoiceOptions({ searchDirs: [tempDir] });

    expect(result.voices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "en_US-lessac-medium",
          path: modelPath,
          speakerCount: 2,
          speakers: [
            { id: 0, label: "default" },
            { id: 1, label: "bright" },
          ],
        }),
      ]),
    );
  });
});
