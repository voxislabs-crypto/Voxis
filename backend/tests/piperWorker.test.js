/**
 * Mocked Piper worker process.
 *
 * These tests spawn a stand-in that speaks Piper's --json-input protocol:
 * one JSON job per stdin line, and the WAV path on stdout when that line is
 * done. They do not load an onnx voice. Nothing here is a local Piper timing run.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const MOCK_WORKER = String.raw`
import json
import os
import sys
import time

pid_path = os.environ.get("PIPER_TEST_PID_FILE", "")
status_path = os.environ.get("PIPER_TEST_STATUS_FILE", "")

def status(message):
    if not status_path:
        return
    with open(status_path, "a", encoding="utf-8") as handle:
        handle.write(message + "\n")
        handle.flush()

if pid_path:
    with open(pid_path, "w", encoding="utf-8") as handle:
        handle.write(str(os.getpid()))
        handle.flush()

mode = os.environ.get("PIPER_TEST_MODE", "ok")
if mode == "crash-before-ready":
    status("crash-before-ready")
    sys.stderr.write("worker crashed before ready\n")
    sys.exit(3)

status("ready")

for line in sys.stdin:
    raw = line.strip()
    if not raw:
        continue
    job = json.loads(raw)
    text = str(job.get("text") or "")
    output = str(job.get("output_file") or "")
    status("job " + text)
    if text == "STALL":
        time.sleep(30)
        continue
    if text == "CRASH":
        os._exit(9)
    if text == "NOISE":
        sys.stdout.write("this is not a wav path\n")
        sys.stdout.flush()
    if text == "NOFILE":
        sys.stdout.write(output + "\n")
        sys.stdout.flush()
        continue
    if output:
        with open(output, "wb") as handle:
            handle.write(b"RIFFmock")
    sys.stdout.write(output + "\n")
    sys.stdout.flush()
`;

const savedEnv = {
  PIPER_COMMAND: process.env.PIPER_COMMAND,
  PIPER_WORKER_SCRIPT: process.env.PIPER_WORKER_SCRIPT,
  PIPER_JOB_TIMEOUT_MS: process.env.PIPER_JOB_TIMEOUT_MS,
  PIPER_TEST_PID_FILE: process.env.PIPER_TEST_PID_FILE,
  PIPER_TEST_STATUS_FILE: process.env.PIPER_TEST_STATUS_FILE,
  PIPER_TEST_MODE: process.env.PIPER_TEST_MODE,
};

let pythonBin = "";
let workDir = "";
let scriptPath = "";
let pidFile = "";
let statusFile = "";
const trackedPids = [];

function findPython() {
  const candidates = [process.env.PIPER_COMMAND, "python", "python3", "py"].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  throw new Error("Python is required to spawn the mocked Piper worker.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readPid() {
  try {
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    if (Number.isInteger(pid) && pid > 0) {
      trackedPids.push(pid);
      return pid;
    }
  } catch {
    // The worker has not written its pid yet.
  }
  return 0;
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid) {
  if (!pid) return;
  try {
    process.kill(pid);
  } catch {
    // Already gone.
  }
}

async function waitUntilDead(pid) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (!isAlive(pid)) return;
    await sleep(25);
  }
  throw new Error(`mocked worker ${pid} was still running`);
}

async function waitForStatus(fragment) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    let text = "";
    try {
      text = fs.readFileSync(statusFile, "utf8");
    } catch {
      text = "";
    }
    if (text.includes(fragment)) return text;
    await sleep(20);
  }
  throw new Error(`timed out waiting for worker status "${fragment}"`);
}

function resetStatus() {
  fs.writeFileSync(statusFile, "");
}

async function loadWorker() {
  vi.resetModules();
  return import("../services/piperWorker.js");
}

function speak(worker, text, overrides = {}) {
  const outputPath = path.join(workDir, `out-${Date.now()}-${Math.random().toString(16).slice(2)}.wav`);
  return worker.synthesizePiperLine({
    command: pythonBin,
    modelPath: "mock-model.onnx",
    text,
    outputPath,
    lengthScale: "1",
    noiseScale: "",
    noiseW: "",
    timeoutMs: 5000,
    ...overrides,
  }).then(() => fs.readFileSync(outputPath));
}

beforeAll(() => {
  process.setMaxListeners(40);
  pythonBin = findPython();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-piper-mock-"));
  scriptPath = path.join(workDir, "piper_worker.py");
  fs.writeFileSync(scriptPath, MOCK_WORKER);
});

beforeEach(() => {
  pidFile = path.join(workDir, `pid-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  statusFile = path.join(workDir, `status-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(pidFile, "");
  fs.writeFileSync(statusFile, "");
  process.env.PIPER_COMMAND = pythonBin;
  process.env.PIPER_WORKER_SCRIPT = scriptPath;
  process.env.PIPER_JOB_TIMEOUT_MS = "5000";
  process.env.PIPER_TEST_PID_FILE = pidFile;
  process.env.PIPER_TEST_STATUS_FILE = statusFile;
  process.env.PIPER_TEST_MODE = "ok";
});

afterEach(async () => {
  const current = readPid();
  for (const pid of new Set([...trackedPids, current].filter(Boolean))) {
    killPid(pid);
  }
  trackedPids.length = 0;
  if (current) {
    await waitUntilDead(current).catch(() => {});
  }
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Piper persistent worker (mocked process, not the onnx voice)", () => {
  it("keeps the default job timeout at 90 seconds unless PIPER_JOB_TIMEOUT_MS is set", async () => {
    delete process.env.PIPER_JOB_TIMEOUT_MS;
    const worker = await loadWorker();
    expect(worker.getPiperJobTimeoutMs()).toBe(90_000);
    expect(worker.getPiperJobTimeoutMs(120_000)).toBe(120_000);
    process.env.PIPER_JOB_TIMEOUT_MS = "250";
    expect(worker.getPiperJobTimeoutMs(120_000)).toBe(250);
  });

  it("loads once and runs later jobs on the same process", async () => {
    const worker = await loadWorker();
    const first = await speak(worker, "one");
    const pid = readPid();
    const second = await speak(worker, "two");

    expect(first.toString("utf8")).toContain("RIFF");
    expect(second.length).toBeGreaterThan(0);
    expect(readPid()).toBe(pid);
    expect(isAlive(pid)).toBe(true);
    const status = fs.readFileSync(statusFile, "utf8");
    expect(status.match(/ready/g)).toHaveLength(1);
    expect(status).toContain("job one");
    expect(status).toContain("job two");
  }, 15000);

  it("processes two queued jobs one after another without a second worker", async () => {
    const worker = await loadWorker();
    const [first, second] = await Promise.all([
      speak(worker, "alpha"),
      speak(worker, "beta"),
    ]);
    const status = fs.readFileSync(statusFile, "utf8");

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(status.match(/ready/g)).toHaveLength(1);
    expect(status.indexOf("job alpha")).toBeGreaterThan(-1);
    expect(status.indexOf("job beta")).toBeGreaterThan(status.indexOf("job alpha"));
  }, 15000);

  it("ignores a malformed stdout line and still accepts the wav path", async () => {
    const worker = await loadWorker();
    const result = await speak(worker, "NOISE");
    const pid = readPid();
    const next = await speak(worker, "after-noise");

    expect(result.toString("utf8")).toContain("RIFF");
    expect(readPid()).toBe(pid);
    expect(next.length).toBeGreaterThan(0);
    expect(isAlive(pid)).toBe(true);
  }, 15000);

  it("keeps the worker when the reported audio file is missing", async () => {
    const worker = await loadWorker();
    await expect(speak(worker, "NOFILE")).rejects.toThrow(/missing/);
    const pid = readPid();
    const next = await speak(worker, "after-nofile");

    expect(next.toString("utf8")).toContain("RIFF");
    expect(readPid()).toBe(pid);
    expect(isAlive(pid)).toBe(true);
  }, 15000);

  it("starts a fresh worker after the current worker crashes mid-job", async () => {
    const worker = await loadWorker();
    await speak(worker, "before-crash");
    const firstPid = readPid();
    await expect(speak(worker, "CRASH")).rejects.toThrow(/exited/);
    await waitUntilDead(firstPid);
    resetStatus();
    const recovered = await speak(worker, "after-crash");

    expect(recovered.toString("utf8")).toContain("RIFF");
    expect(readPid()).not.toBe(firstPid);
    expect(isAlive(readPid())).toBe(true);
  }, 15000);

  it("times out a stalled synthesis, cleans up that process, and completes on a new worker", async () => {
    process.env.PIPER_JOB_TIMEOUT_MS = "400";
    const worker = await loadWorker();
    const stalled = speak(worker, "STALL");
    await expect(stalled).rejects.toThrow(/timed out/i);
    const firstPid = readPid();
    await waitUntilDead(firstPid);
    resetStatus();
    const recovered = await speak(worker, "after-timeout");

    expect(recovered.length).toBeGreaterThan(0);
    expect(readPid()).not.toBe(firstPid);
    expect(isAlive(firstPid)).toBe(false);
  }, 15000);

  it("starts a fresh worker after the process exits during startup", async () => {
    process.env.PIPER_TEST_MODE = "crash-before-ready";
    const worker = await loadWorker();
    await expect(speak(worker, "never")).rejects.toThrow(/exited/);
    const crashedPid = readPid();
    await waitUntilDead(crashedPid);

    process.env.PIPER_TEST_MODE = "ok";
    resetStatus();
    const recovered = await speak(worker, "after-startup-failure");
    expect(recovered.length).toBeGreaterThan(0);
    expect(readPid()).not.toBe(crashedPid);
    expect(isAlive(readPid())).toBe(true);
  }, 15000);

  it("replaces the process when the speaking rate changes and reuses it when the rate stays", async () => {
    const worker = await loadWorker();
    await speak(worker, "steady", { lengthScale: "1" });
    const firstPid = readPid();
    await speak(worker, "still-steady", { lengthScale: "1" });
    expect(readPid()).toBe(firstPid);

    await speak(worker, "faster", { lengthScale: "0.8" });
    const secondPid = readPid();
    expect(secondPid).not.toBe(firstPid);
    expect(isAlive(secondPid)).toBe(true);
    await waitUntilDead(firstPid);
  }, 15000);
});
