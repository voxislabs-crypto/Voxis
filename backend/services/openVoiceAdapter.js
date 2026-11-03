/**
 * openVoiceAdapter.js
 *
 * Integrates OpenVoice v2 (MyShell-AI/OpenVoice) for zero-shot voice cloning.
 * OpenVoice v2 uses MeloTTS as the base synthesizer + a lightweight tone-color
 * converter to transfer prosody / timbre from a reference clip.
 *
 * Python dependencies (install once on the server):
 *   pip install git+https://github.com/myshell-ai/MeloTTS.git
 *   pip install git+https://github.com/myshell-ai/OpenVoice.git
 *
 * The adapter keeps one Python process alive. MeloTTS and the tone-color
 * converter stay loaded between requests. Node never loads the Python runtime
 * itself. A one-shot CLI remains in openvoice_synthesize.py for manual runs.
 *
 * Expected environment variables (optional):
 *   OPENVOICE_PYTHON  — python3 binary to use (default: "python3")
 *   OPENVOICE_SCRIPTS_DIR — override scripts directory path
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ensureVoiceClonesDir, getVoiceCloneDir } from "./voiceCloneService.js";

const SCRIPTS_DIR =
  process.env.OPENVOICE_SCRIPTS_DIR ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "voice-clone-scripts");

function getPythonBin() {
  // Read at call time. server.js loads dotenv after modules are imported.
  return String(process.env.OPENVOICE_PYTHON || "").trim() || "python";
}

const OPENVOICE_TIMEOUT_MS = 12 * 60 * 1000;

/**
 * Run the OpenVoice Python synthesis script as a subprocess.
 */
function openVoiceErrorText(stderrText) {
  const lines = String(stderrText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const owned = lines.filter((line) => line.includes("[openvoice_synthesize]") || /error|exception|traceback|too short/i.test(line));
  return (owned.length ? owned : lines).slice(-6).join(" ").slice(-700);
}

let activeWorker = null;
let jobChain = Promise.resolve();

function parseWorkerMessage(line) {
  try {
    const message = JSON.parse(line);
    if (message && typeof message === "object") {
      return message;
    }
  } catch {
    // Library logs sometimes share stdout. Only JSON lines are protocol.
  }
  return null;
}

function discardWorker(worker, reason) {
  if (!worker || worker.discarded) {
    return;
  }
  worker.discarded = true;
  if (activeWorker === worker) {
    activeWorker = null;
  }
  try {
    worker.proc.kill();
  } catch {
    // The process may already be gone.
  }
  const error = new Error(reason);
  error.statusCode = 503;
  for (const waiter of worker.waiters.splice(0)) {
    waiter.reject(error);
  }
}

function startWorker() {
  const script = path.join(SCRIPTS_DIR, "openvoice_synthesize.py");
  const proc = spawn(getPythonBin(), ["-u", script, "--serve"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
  });
  const worker = {
    proc,
    discarded: false,
    waiters: [],
    stdoutBuffer: "",
    stderrBuffer: "",
  };

  proc.stdout.on("data", (chunk) => {
    worker.stdoutBuffer += chunk.toString("utf8");
    let newline = worker.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = worker.stdoutBuffer.slice(0, newline).trim();
      worker.stdoutBuffer = worker.stdoutBuffer.slice(newline + 1);
      newline = worker.stdoutBuffer.indexOf("\n");
      const message = line ? parseWorkerMessage(line) : null;
      if (!message) {
        continue;
      }
      const waiter = worker.waiters.shift();
      if (waiter) {
        waiter.resolve(message);
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    worker.stderrBuffer = `${worker.stderrBuffer}${chunk.toString("utf8")}`.slice(-4000);
  });

  proc.on("error", (error) => {
    discardWorker(worker, `OpenVoice worker failed to start: ${error.message}`);
  });

  proc.on("close", (code) => {
    if (worker.discarded) {
      return;
    }
    const detail = openVoiceErrorText(worker.stderrBuffer);
    discardWorker(
      worker,
      `OpenVoice worker exited with code ${code}${detail ? `: ${detail}` : "."}`,
    );
  });

  worker.readMessage = (timeoutMs) => new Promise((resolve, reject) => {
    const entry = {
      resolve: (message) => {
        clearTimeout(timer);
        resolve(message);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    };
    const timer = setTimeout(() => {
      const index = worker.waiters.indexOf(entry);
      if (index >= 0) {
        worker.waiters.splice(index, 1);
      }
      const error = new Error(`OpenVoice synthesis timed out after ${timeoutMs}ms.`);
      error.statusCode = 503;
      discardWorker(worker, error.message);
      reject(error);
    }, timeoutMs);
    worker.waiters.push(entry);
  });

  return worker;
}

async function ensureWorker() {
  if (activeWorker && !activeWorker.discarded && activeWorker.proc.exitCode == null) {
    return activeWorker;
  }

  const worker = startWorker();
  activeWorker = worker;
  const ready = await worker.readMessage(OPENVOICE_TIMEOUT_MS);
  if (!ready?.ready) {
    const message = ready?.error || "OpenVoice worker failed to load its models.";
    discardWorker(worker, message);
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }
  console.info(
    `[TTS] OpenVoice worker ready on ${ready.device || "cpu"} after ${Number(ready.load_ms || 0)}ms. Later lines reuse the loaded models.`,
  );
  return worker;
}

function enqueueOpenVoice(task) {
  const run = jobChain.then(task, task);
  jobChain = run.then(() => undefined, () => undefined);
  return run;
}

process.on("exit", () => {
  try {
    activeWorker?.proc.kill();
  } catch {
    // Best effort. The worker also exits when the backend process does.
  }
});

/**
 * Check if the OpenVoice Python environment is available.
 */
export async function isOpenVoiceInstalled() {
  return new Promise((resolve) => {
    const proc = spawn(getPythonBin(), ["-c", "import openvoice; import melo"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/**
 * Register a cleaned reference WAV for a persona.
 * Copies the normalized WAV into the persona's clone directory.
 *
 * @returns {Promise<string>} The stored reference path (absolute, on disk).
 */
export async function registerReference(personalityId, cleanedWavPath) {
  const dir = await ensureVoiceClonesDir(personalityId);
  const destPath = path.join(dir, "openvoice-reference.wav");
  await fs.copyFile(cleanedWavPath, destPath);
  return destPath;
}

/**
 * Check if a reference clip is registered for this persona.
 */
export async function hasReference(personalityId) {
  const refPath = path.join(getVoiceCloneDir(personalityId), "openvoice-reference.wav");
  try {
    await fs.access(refPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synthesize speech using OpenVoice v2.
 * Uses the resident Python worker. The first call loads MeloTTS. Later calls
 * reuse that process, the same reference clip, and the same tone converter.
 *
 * @param {object} opts
 * @param {string} opts.text
 * @param {number|string} opts.personalityId
 * @param {number} [opts.rate]   Speech rate multiplier (0.7–1.3)
 * @returns {Promise<{ buffer: Buffer, contentType: string, engine: string }>}
 */
async function synthesizeWithWorker({ text, personalityId, rate, refPath }) {
  const tmpOut = path.join(os.tmpdir(), `voxis-ov-${randomUUID()}.wav`);
  const worker = await ensureWorker();
  const clampedRate = Math.min(1.3, Math.max(0.7, Number(rate) || 1));
  worker.proc.stdin.write(`${JSON.stringify({
    reference: refPath,
    text,
    output: tmpOut,
    rate: clampedRate,
    language: "EN",
  })}\n`);

  try {
    const result = await worker.readMessage(OPENVOICE_TIMEOUT_MS);
    if (!result?.ok) {
      const error = new Error(result?.error || "OpenVoice synthesis failed.");
      error.statusCode = 502;
      throw error;
    }
    const buffer = await fs.readFile(tmpOut);
    console.info(
      `[TTS] OpenVoice clone for persona ${personalityId} finished in ${Number(result.elapsed_ms || 0)}ms.`,
    );
    return { buffer, contentType: "audio/wav", engine: "openvoice" };
  } finally {
    await fs.unlink(tmpOut).catch(() => {});
  }
}

export async function synthesizeOpenVoice({ text, personalityId, rate = 1 }) {
  const refPath = path.join(getVoiceCloneDir(personalityId), "openvoice-reference.wav");

  try {
    await fs.access(refPath);
  } catch {
    const err = new Error(
      "No OpenVoice reference clip found for this persona. Run voice cloning first.",
    );
    err.statusCode = 400;
    throw err;
  }

  return enqueueOpenVoice(() => synthesizeWithWorker({
    text,
    personalityId,
    rate,
    refPath,
  }));
}

/**
 * Remove stored reference clips for a persona.
 */
export async function removeOpenVoiceReference(personalityId) {
  const refPath = path.join(getVoiceCloneDir(personalityId), "openvoice-reference.wav");
  await fs.unlink(refPath).catch(() => {});
}
