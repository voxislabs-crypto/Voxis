/**
 * rvcAdapter.js
 *
 * Integrates RVC (Retrieval-based Voice Conversion) as a post-processing
 * layer on top of Kokoro TTS output.
 *
 * Pipeline: text → Kokoro WAV → RVC conversion → output WAV
 *
 * Voice Packs are pre-trained RVC models registered in the rvc_voice_packs
 * SQLite table. Each pack has a .pth model file + optional index file.
 *
 * Architecture:
 * - Uses a separate Python 3.10 microservice for RVC processing
 * - Communicates via HTTP to avoid dependency conflicts with Python 3.12
 *
 * Expected environment variables (optional):
 *   RVC_SERVICE_URL — RVC microservice URL (default: "http://127.0.0.1:7861")
 *   RVC_F0_METHOD   — pitch extraction method: rmvpe (default, best on CPU)
 *   RVC_TIMEOUT_MS  — conversion budget. Default is 10 minutes so a cold CPU load can finish.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { getRvcPackDir } from "./voiceCloneService.js";

export function getRvcServiceUrl() {
  return String(process.env.RVC_SERVICE_URL || "").trim() || "http://127.0.0.1:7861";
}

function rvcF0Method() {
  return String(process.env.RVC_F0_METHOD || "").trim() || "rmvpe";
}

function rvcTimeoutMs() {
  const configured = Number(process.env.RVC_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 1000) {
    return configured;
  }
  // Cold CPU loads of HuBERT + RMVPE exceed the old 90s cap on this machine.
  return 10 * 60 * 1000;
}

/**
 * Check if the RVC microservice is available.
 */
export async function isRvcInstalled() {
  try {
    const response = await fetch(`${getRvcServiceUrl()}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get the model path for a voice pack, given its directory.
 * Looks for the first .pth file in the pack directory.
 */
export async function resolveModelPath(packId) {
  const packDir = getRvcPackDir(packId);
  let files;
  try {
    files = await fs.readdir(packDir);
  } catch {
    return null;
  }
  const modelFile = files.find((f) => f.endsWith(".pth"));
  return modelFile ? path.join(packDir, modelFile) : null;
}

/**
 * Get the optional index file path for a pack.
 */
export async function resolveIndexPath(packId) {
  const packDir = getRvcPackDir(packId);
  let files;
  try {
    files = await fs.readdir(packDir);
  } catch {
    return null;
  }
  const indexFile = files.find((f) => f.endsWith(".index"));
  return indexFile ? path.join(packDir, indexFile) : null;
}

/**
 * Convert a WAV buffer using an RVC voice pack via the microservice.
 *
 * @param {object} opts
 * @param {Buffer} opts.inputBuffer   WAV audio to convert (e.g. Kokoro output)
 * @param {number|string} opts.packId RVC voice pack ID
 * @param {number} [opts.pitchShift]  Semitone shift (0 = no change, ±12 = one octave)
 * @returns {Promise<{ buffer: Buffer, contentType: string, engine: string }>}
 */
export async function convertWithRvc({ inputBuffer, packId, pitchShift = 0 }) {
  const modelPath = await resolveModelPath(packId);
  if (!modelPath) {
    const err = new Error(`RVC voice pack ${packId} model file (.pth) not found.`);
    err.statusCode = 400;
    throw err;
  }

  const indexPath = (await resolveIndexPath(packId)) || "";

  const formData = new FormData();
  formData.append("input_audio", new Blob([inputBuffer], { type: "audio/wav" }), "input.wav");
  formData.append("model_path", modelPath);
  if (indexPath) {
    formData.append("index_path", indexPath);
  }
  formData.append("f0_method", rvcF0Method());
  formData.append("f0_up_key", String(Math.round(Number(pitchShift) || 0)));

  const timeoutMs = rvcTimeoutMs();
  try {
    const response = await fetch(`${getRvcServiceUrl()}/convert`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(`RVC service error: ${response.status} - ${errorText}`);
      err.statusCode = response.status;
      throw err;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType: "audio/wav", engine: "kokoro-rvc" };
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      const err = new Error(`RVC conversion timed out after ${timeoutMs}ms.`);
      err.statusCode = 503;
      throw err;
    }
    throw error;
  }
}
