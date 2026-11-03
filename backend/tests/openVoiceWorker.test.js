/**
 * Mocked OpenVoice worker process.
 *
 * These tests spawn a stand-in Python process that speaks the --serve JSON
 * protocol. They do not load MeloTTS, OpenVoice checkpoints, or Ara's voice.
 * Nothing in this file is a local OpenVoice integration test.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PERSONA = "ov-mock-worker";
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REFERENCE_DIR = path.join(BACKEND_ROOT, "voice-clones", `persona-${PERSONA}`);

const MOCK_WORKER = String.raw`
import json
import os
import sys
import time

pid_path = os.environ.get("OPENVOICE_TEST_PID_FILE", "")
status_path = os.environ.get("OPENVOICE_TEST_STATUS_FILE", "")

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

mode = os.environ.get("OPENVOICE_TEST_MODE", "ok")
if "--serve" not in sys.argv:
    sys.exit(0)

if mode == "crash-before-ready":
    status("crash-before-ready")
    sys.stderr.write("worker crashed before ready\n")
    sys.exit(3)

if mode == "hang-ready":
    status("hang-ready")
    time.sleep(30)
    sys.exit(0)

if mode == "bad-ready":
    sys.stdout.write("loading weights\n")
    sys.stdout.flush()
    sys.stdout.write(json.dumps({"ready": False, "error": "model missing"}) + "\n")
    sys.stdout.flush()
    time.sleep(2)
    sys.exit(0)

sys.stdout.write("library log before ready\n")
sys.stdout.flush()
sys.stdout.write(json.dumps({"ready": True, "device": "cpu", "load_ms": 4}) + "\n")
sys.stdout.flush()
status("ready")

for line in sys.stdin:
    raw = line.strip()
    if not raw:
        continue
    job = json.loads(raw)
    text = str(job.get("text") or "")
    output = str(job.get("output") or "")
    status("job " + text)
    if text == "STALL":
        time.sleep(30)
        continue
    if text == "CRASH":
        os._exit(9)
    if text == "FAIL":
        sys.stdout.write(json.dumps({"ok": False, "error": "synthesis failed"}) + "\n")
        sys.stdout.flush()
        continue
    if text == "NOISE":
        sys.stdout.write("this is not json\n")
        sys.stdout.flush()
    if text == "NOFILE":
        sys.stdout.write(json.dumps({"ok": True, "elapsed_ms": 1}) + "\n")
        sys.stdout.flush()
        continue
    if output:
        with open(output, "wb") as handle:
            handle.write(b"RIFFmock")
    sys.stdout.write(json.dumps({"ok": True, "elapsed_ms": 2}) + "\n")
    sys.stdout.flush()
`;

const savedEnv = {
  OPENVOICE_PYTHON: process.env.OPENVOICE_PYTHON,
  OPENVOICE_SCRIPTS_DIR: process.env.OPENVOICE_SCRIPTS_DIR,
  OPENVOICE_JOB_TIMEOUT_MS: process.env.OPENVOICE_JOB_TIMEOUT_MS,
  OPENVOICE_TEST_PID_FILE: process.env.OPENVOICE_TEST_PID_FILE,
  OPENVOICE_TEST_STATUS_FILE: process.env.OPENVOICE_TEST_STATUS_FILE,
  OPENVOICE_TEST_MODE: process.env.OPENVOICE_TEST_MODE,
};

let pythonBin = "";
let scriptsDir = "";
let pidFile = "";
let statusFile = "";
const trackedPids = [];

function findPython() {
  const candidates = [
    process.env.OPENVOICE_PYTHON,
    "python",
    "python3",
    "py",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  throw new Error("Python is required to spawn the mocked OpenVoice worker.");
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

async function loadAdapter() {
  vi.resetModules();
  return import("../services/openVoiceAdapter.js");
}

function speak(adapter, text) {
  return adapter.synthesizeOpenVoice({
    text,
    personalityId: PERSONA,
    rate: 1,
  });
}

beforeAll(() => {
  process.setMaxListeners(40);
  pythonBin = findPython();
  scriptsDir = fs.mkdtempSync(path.join(os.tmpdir(), "voxis-ov-mock-"));
  fs.writeFileSync(path.join(scriptsDir, "openvoice_synthesize.py"), MOCK_WORKER);
  fs.mkdirSync(REFERENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(REFERENCE_DIR, "openvoice-reference.wav"), "not-a-real-clip");
});

beforeEach(() => {
  pidFile = path.join(scriptsDir, `pid-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  statusFile = path.join(scriptsDir, `status-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(pidFile, "");
  fs.writeFileSync(statusFile, "");
  process.env.OPENVOICE_PYTHON = pythonBin;
  process.env.OPENVOICE_SCRIPTS_DIR = scriptsDir;
  process.env.OPENVOICE_JOB_TIMEOUT_MS = "5000";
  process.env.OPENVOICE_TEST_PID_FILE = pidFile;
  process.env.OPENVOICE_TEST_STATUS_FILE = statusFile;
  process.env.OPENVOICE_TEST_MODE = "ok";
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
  fs.rmSync(scriptsDir, { recursive: true, force: true });
  fs.rmSync(REFERENCE_DIR, { recursive: true, force: true });
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("OpenVoice persistent worker (mocked process, not MeloTTS)", () => {
  it("keeps the default synthesis timeout at 12 minutes", async () => {
    delete process.env.OPENVOICE_JOB_TIMEOUT_MS;
    const adapter = await loadAdapter();
    expect(adapter.getOpenVoiceTimeoutMs()).toBe(12 * 60 * 1000);
    process.env.OPENVOICE_JOB_TIMEOUT_MS = "250";
    expect(adapter.getOpenVoiceTimeoutMs()).toBe(250);
  });

  it("loads once and runs later jobs on the same process", async () => {
    const adapter = await loadAdapter();
    const first = await speak(adapter, "one");
    const pid = readPid();
    const second = await speak(adapter, "two");

    expect(first.engine).toBe("openvoice");
    expect(first.buffer.length).toBeGreaterThan(0);
    expect(second.buffer.length).toBeGreaterThan(0);
    expect(readPid()).toBe(pid);
    expect(isAlive(pid)).toBe(true);
    const status = fs.readFileSync(statusFile, "utf8");
    expect(status.match(/ready/g)).toHaveLength(1);
  }, 15000);

  it("processes two queued jobs one after another without a second worker", async () => {
    const adapter = await loadAdapter();
    const [first, second] = await Promise.all([
      speak(adapter, "alpha"),
      speak(adapter, "beta"),
    ]);
    const status = fs.readFileSync(statusFile, "utf8");

    expect(first.buffer.length).toBeGreaterThan(0);
    expect(second.buffer.length).toBeGreaterThan(0);
    expect(status.match(/ready/g)).toHaveLength(1);
    expect(status.indexOf("job alpha")).toBeGreaterThan(-1);
    expect(status.indexOf("job beta")).toBeGreaterThan(status.indexOf("job alpha"));
  }, 15000);

  it("keeps the worker after a failed synthesis job", async () => {
    const adapter = await loadAdapter();
    await expect(speak(adapter, "FAIL")).rejects.toThrow(/synthesis failed/);
    const pid = readPid();
    const next = await speak(adapter, "after-fail");

    expect(next.buffer.length).toBeGreaterThan(0);
    expect(readPid()).toBe(pid);
    expect(isAlive(pid)).toBe(true);
  }, 15000);

  it("ignores a malformed stdout line and still accepts the following JSON result", async () => {
    const adapter = await loadAdapter();
    const result = await speak(adapter, "NOISE");
    const pid = readPid();
    const next = await speak(adapter, "after-noise");

    expect(result.buffer.toString("utf8")).toContain("RIFF");
    expect(readPid()).toBe(pid);
    expect(next.buffer.length).toBeGreaterThan(0);
  }, 15000);

  it("survives a successful status whose audio file is missing", async () => {
    const adapter = await loadAdapter();
    await expect(speak(adapter, "NOFILE")).rejects.toThrow();
    const pid = readPid();
    const next = await speak(adapter, "after-nofile");

    expect(next.engine).toBe("openvoice");
    expect(readPid()).toBe(pid);
    expect(isAlive(pid)).toBe(true);
  }, 15000);

  it("starts a fresh worker after the current worker crashes mid-job", async () => {
    const adapter = await loadAdapter();
    await speak(adapter, "before-crash");
    const firstPid = readPid();
    const crashed = speak(adapter, "CRASH");
    await expect(crashed).rejects.toThrow(/exited/);
    await waitUntilDead(firstPid);
    resetStatus();
    const recovered = await speak(adapter, "after-crash");

    expect(recovered.buffer.length).toBeGreaterThan(0);
    expect(readPid()).not.toBe(firstPid);
    expect(isAlive(readPid())).toBe(true);
  }, 15000);

  it("kills the worker during synthesis and completes the next job on a replacement", async () => {
    const adapter = await loadAdapter();
    const stalled = speak(adapter, "STALL");
    await waitForStatus("job STALL");
    const firstPid = readPid();
    expect(firstPid).toBeGreaterThan(0);
    killPid(firstPid);

    await expect(stalled).rejects.toThrow();
    await waitUntilDead(firstPid);
    resetStatus();
    const recovered = await speak(adapter, "after-kill");
    const replacementPid = readPid();

    expect(recovered.buffer.length).toBeGreaterThan(0);
    expect(recovered.engine).toBe("openvoice");
    expect(replacementPid).not.toBe(firstPid);
    expect(isAlive(firstPid)).toBe(false);
    expect(isAlive(replacementPid)).toBe(true);
    expect(fs.readFileSync(statusFile, "utf8")).toContain("ready");
  }, 15000);

  it("times out a stalled synthesis, cleans up that process, and completes on a new worker", async () => {
    process.env.OPENVOICE_JOB_TIMEOUT_MS = "400";
    const adapter = await loadAdapter();
    const stalled = speak(adapter, "STALL");
    await expect(stalled).rejects.toThrow(/timed out/i);
    const firstPid = readPid();
    await waitUntilDead(firstPid);
    resetStatus();
    const recovered = await speak(adapter, "after-timeout");

    expect(recovered.buffer.length).toBeGreaterThan(0);
    expect(readPid()).not.toBe(firstPid);
    expect(isAlive(firstPid)).toBe(false);
  }, 15000);

  it("starts a fresh worker after startup crashes or a refused ready message", async () => {
    process.env.OPENVOICE_TEST_MODE = "crash-before-ready";
    const adapter = await loadAdapter();
    await expect(speak(adapter, "never")).rejects.toThrow(/exited/);
    const crashedPid = readPid();
    await waitUntilDead(crashedPid);

    process.env.OPENVOICE_TEST_MODE = "bad-ready";
    resetStatus();
    await expect(speak(adapter, "never")).rejects.toThrow(/model missing/);
    const refusedPid = readPid();
    await waitUntilDead(refusedPid);

    process.env.OPENVOICE_TEST_MODE = "ok";
    resetStatus();
    const recovered = await speak(adapter, "after-startup-failure");
    expect(recovered.buffer.length).toBeGreaterThan(0);
    expect(readPid()).not.toBe(crashedPid);
    expect(readPid()).not.toBe(refusedPid);
    expect(isAlive(readPid())).toBe(true);
  }, 15000);

  it("hangs on startup, kills that process at the timeout, then finishes on a new worker", async () => {
    process.env.OPENVOICE_JOB_TIMEOUT_MS = "400";
    process.env.OPENVOICE_TEST_MODE = "hang-ready";
    const adapter = await loadAdapter();
    await expect(speak(adapter, "never")).rejects.toThrow(/timed out/i);
    const hungPid = readPid();
    await waitUntilDead(hungPid);

    process.env.OPENVOICE_TEST_MODE = "ok";
    process.env.OPENVOICE_JOB_TIMEOUT_MS = "5000";
    resetStatus();
    const recovered = await speak(adapter, "after-hang");
    expect(recovered.buffer.length).toBeGreaterThan(0);
    expect(readPid()).not.toBe(hungPid);
    expect(isAlive(hungPid)).toBe(false);
  }, 15000);
});
