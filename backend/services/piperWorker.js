/**
 * One resident Piper process for sequential synthesis.
 *
 * Piper's CLI loads the onnx voice before it reads stdin, then exits when
 * stdin closes. Each one-shot call paid that load again. This worker keeps
 * the process open and sends one JSON job per line (`--json-input`).
 *
 * Piper prints the finished WAV path on stdout. A crash, a job timeout, or a
 * dead pipe discards the process. The next request starts a fresh one.
 *
 * The loaded process cannot swap onnx models or length/noise scales.
 * Those are startup flags. Speaker id is per job. A scale or model change
 * replaces the process. Pauses between Voxis chunks stay in the WAV joiner;
 * Piper's own sentence gap stays at its default.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_PIPER_JOB_TIMEOUT_MS = 90_000;

let activeWorker = null;
let jobChain = Promise.resolve();

export function getPiperJobTimeoutMs(requestedMs) {
  const configured = Number(process.env.PIPER_JOB_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured >= 50) {
    return configured;
  }
  const requested = Number(requestedMs);
  if (Number.isFinite(requested) && requested >= 50) {
    return requested;
  }
  return DEFAULT_PIPER_JOB_TIMEOUT_MS;
}

function workerKey(settings) {
  return [
    settings.command,
    settings.modelPath,
    settings.lengthScale,
    settings.noiseScale,
    settings.noiseW,
  ].join("\0");
}

function pathsMatch(reported, expected) {
  const left = path.resolve(String(reported || "").trim());
  const right = path.resolve(String(expected || "").trim());
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function spawnPiper(command, args, options) {
  // Tests point PIPER_WORKER_SCRIPT at a stand-in. Production leaves it empty
  // and spawns the Piper binary directly.
  const script = String(process.env.PIPER_WORKER_SCRIPT || "").trim();
  if (script) {
    return spawn(command, ["-u", script, ...args], options);
  }
  return spawn(command, args, options);
}

function discardWorker(worker, reason, cause) {
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
  fs.rm(worker.outputDir, { recursive: true, force: true }).catch(() => {});
  const error = cause instanceof Error ? cause : new Error(reason);
  if (!error.statusCode) {
    error.statusCode = 503;
  }
  worker.failure = error;
  for (const waiter of worker.waiters.splice(0)) {
    waiter.reject(error);
  }
}

function startWorker(settings) {
  const outputDir = mkdtempSync(path.join(os.tmpdir(), "voxis-piper-worker-"));
  const args = [
    "--model", settings.modelPath,
    "--json-input",
    "--quiet",
    "--output_dir", outputDir,
    "--length_scale", settings.lengthScale,
  ];
  if (settings.noiseScale) {
    args.push("--noise_scale", settings.noiseScale, "--noise_w", settings.noiseW || "0.8");
  }
  const spawnOptions = {
    stdio: ["pipe", "pipe", "pipe"],
  };
  if (settings.cwd) {
    spawnOptions.cwd = settings.cwd;
  }
  const proc = spawnPiper(settings.command, args, spawnOptions);
  const worker = {
    proc,
    key: settings.key,
    outputDir,
    discarded: false,
    spawnError: null,
    waiters: [],
    pendingLines: [],
    stdoutBuffer: "",
    stderrBuffer: "",
  };

  proc.stdout.on("data", (chunk) => {
    worker.stdoutBuffer += chunk.toString("utf8");
    let newline = worker.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = worker.stdoutBuffer.slice(0, newline).replace(/\r$/, "").trim();
      worker.stdoutBuffer = worker.stdoutBuffer.slice(newline + 1);
      newline = worker.stdoutBuffer.indexOf("\n");
      if (!line) {
        continue;
      }
      const waiter = worker.waiters[0];
      if (waiter) {
        waiter.pushLine(line);
      } else {
        worker.pendingLines.push(line);
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    worker.stderrBuffer = `${worker.stderrBuffer}${chunk.toString("utf8")}`.slice(-4000);
  });

  proc.stdin.on("error", () => {
    // Closing the pipe rejects the waiter through discardWorker.
  });

  proc.on("error", (error) => {
    worker.spawnError = error;
    discardWorker(worker, `Piper worker failed to start: ${error.message}`, error);
  });

  proc.on("close", (code) => {
    if (worker.discarded) {
      return;
    }
    const detail = String(worker.stderrBuffer || "").trim().slice(-400);
    discardWorker(
      worker,
      `Piper worker exited with code ${code}${detail ? `: ${detail}` : "."}`,
    );
  });

  worker.readMatchingLine = (outputPath, timeoutMs) => new Promise((resolve, reject) => {
    const entry = {
      pushLine(line) {
        if (!pathsMatch(line, outputPath)) {
          return;
        }
        clearTimeout(timer);
        const index = worker.waiters.indexOf(entry);
        if (index >= 0) {
          worker.waiters.splice(index, 1);
        }
        resolve(line);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    };
    const timer = setTimeout(() => {
      const index = worker.waiters.indexOf(entry);
      if (index >= 0) {
        worker.waiters.splice(index, 1);
      }
      const error = new Error(`Piper synthesis timed out after ${timeoutMs}ms.`);
      error.statusCode = 503;
      discardWorker(worker, error.message);
      reject(error);
    }, timeoutMs);
    worker.waiters.push(entry);
    for (const line of worker.pendingLines.splice(0)) {
      entry.pushLine(line);
    }
  });

  return worker;
}

function ensureWorker(settings) {
  if (
    activeWorker
    && !activeWorker.discarded
    && activeWorker.proc.exitCode == null
    && activeWorker.key === settings.key
  ) {
    return activeWorker;
  }

  if (activeWorker && !activeWorker.discarded) {
    discardWorker(activeWorker, "Piper voice settings changed. Starting a new process.");
  }

  const worker = startWorker(settings);
  activeWorker = worker;
  return worker;
}

async function waitForAudioFile(outputPath) {
  const started = Date.now();
  while (Date.now() - started < 200) {
    try {
      const stat = await fs.stat(outputPath);
      if (stat.size > 0) {
        return;
      }
    } catch {
      // Piper prints the path after it closes the file. Give the disk a moment.
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  const error = new Error(`Piper reported ${outputPath} but the audio file was missing.`);
  error.statusCode = 502;
  throw error;
}

async function runLine(options) {
  const text = String(options.text || "").trim();
  if (!text) {
    const error = new Error("Piper synthesis needs text.");
    error.statusCode = 400;
    throw error;
  }

  const lengthScale = String(options.lengthScale || "1");
  const command = String(options.command || "piper").trim() || "piper";
  const commandLooksLikePath = path.isAbsolute(command) || command.includes("\\") || command.includes("/");
  if (commandLooksLikePath && !existsSync(command)) {
    const missing = new Error(`spawn ${command} ENOENT`);
    missing.code = "ENOENT";
    missing.statusCode = 503;
    throw missing;
  }
  const settings = {
    command,
    modelPath: String(options.modelPath || "").trim(),
    lengthScale,
    noiseScale: String(options.noiseScale || "").trim(),
    noiseW: String(options.noiseW || "").trim(),
    cwd: options.cwd || "",
  };
  settings.key = workerKey(settings);
  const outputPath = path.resolve(options.outputPath);
  const timeoutMs = getPiperJobTimeoutMs(options.timeoutMs);
  const worker = ensureWorker(settings);
  if (!worker.announced) {
    worker.announced = true;
    console.info(
      `[TTS] Piper worker started for ${path.basename(settings.modelPath)}. Later lines reuse this process until the voice model or speaking rate changes.`,
    );
  }
  const job = {
    text,
    output_file: outputPath,
  };
  if (/^\d+$/.test(String(options.speaker ?? "").trim())) {
    job.speaker_id = Number(options.speaker);
  }

  if (worker.discarded) {
    throw worker.failure || worker.spawnError || new Error("Piper worker exited before synthesis started.");
  }

  try {
    worker.proc.stdin.write(`${JSON.stringify(job)}\n`);
  } catch (error) {
    const missing = worker.spawnError?.code === "ENOENT" || error?.code === "ENOENT"
      ? (worker.spawnError?.code === "ENOENT" ? worker.spawnError : error)
      : null;
    if (missing) {
      discardWorker(worker, missing.message, missing);
      throw missing;
    }
    const wrapped = new Error(`Piper worker exited before synthesis started: ${error.message}`);
    wrapped.statusCode = 503;
    discardWorker(worker, wrapped.message, wrapped);
    throw wrapped;
  }

  if (worker.discarded) {
    throw worker.failure || worker.spawnError || new Error("Piper worker exited before synthesis started.");
  }

  await worker.readMatchingLine(outputPath, timeoutMs);
  if (worker.discarded) {
    return;
  }
  try {
    await waitForAudioFile(outputPath);
  } catch (error) {
    if (worker.discarded) {
      throw error;
    }
    throw error;
  }
}

function enqueue(task) {
  const run = jobChain.then(task, task);
  jobChain = run.then(() => undefined, () => undefined);
  return run;
}

process.on("exit", () => {
  try {
    activeWorker?.proc.kill();
  } catch {
    // The worker also exits when this process does.
  }
});

export function synthesizePiperLine(options) {
  return enqueue(() => runLine(options));
}
