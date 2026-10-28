import express from "express";
import cors from "cors";
import portfinder from "portfinder";
import fs from "fs";
import path from "path";

// Prevent unhandled async errors (e.g. from Clerk middleware in @clerk/express) from crashing
// the Node process. Express catches synchronous errors, but some middleware throws outside
// the request-response cycle. Log and continue.
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled promise rejection (non-fatal):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Process] Uncaught exception (non-fatal):", err);
});

import personalityRoutes from "./routes/personalityRoutes.js";
import councilRoutes from "./routes/councilRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import internalChatRoutes from "./routes/internalChatRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import loopRoutes from "./routes/loopRoutes.js";
import sfxRoutes from "./routes/sfxRoutes.js";
import cognitionRoutes from "./routes/cognitionRoutes.js";
import voxisRoutes from "./routes/voxisRoutes.js";
import { initSfxCache } from "./services/sfxCacheService.js";
import { getTtsHealthStatus, preloadKokoro } from "./services/ttsService.js";
import { startCognitionLoop } from "./services/cognitionLoopService.js";
import { clerkVerify } from "./middleware/requireAuth.js";

try {
  const dotenv = await import("dotenv");
  const path = await import("path");
  const envPath = path.resolve(process.cwd(), ".env");
  dotenv.config({ path: envPath });
  console.log("[Env] Loaded .env from:", envPath);
} catch {
  console.warn("[Env] dotenv not installed; relying on PM2/system environment only.");
}

const app = express();
const basePort = Number(process.env.PORT || 3101);
const listenHost = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
const PORT_FILE = path.join(process.cwd(), "..", "shared", "ports.json");

function getReleaseInfo() {
  return {
    gitSha: String(process.env.VOXIS_GIT_SHA || "").trim(),
    branch: String(process.env.VOXIS_BRANCH || "").trim(),
    pm2AppName: String(process.env.PM2_APP_NAME || "voxis-backend").trim(),
  };
}

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "30mb" }));

// Clerk JWT verification runs on every request (no-op when no token present).
// Individual routes call requireAuth() to enforce sign-in.
app.use(clerkVerify);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    release: getReleaseInfo(),
  });
});

app.get("/health/tts", async (_req, res, next) => {
  try {
    const status = await getTtsHealthStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

// Lightweight endpoint exposing the sanitized effective TTS runtime config.
// Useful for verifying prod env/PM2 variable loading without SSH access.
// Returns env var names and effective values — never raw secrets.
app.get("/health/tts/config", (_req, res) => {
  const boolFrom = (key, defaultVal) =>
    String(process.env[key] ?? defaultVal).trim().toLowerCase() !== "false";
  const strFrom = (key, fallback = "") => String(process.env[key] || fallback).trim();
  const numFrom = (key, fallback) => {
    const n = Number(process.env[key]);
    return Number.isFinite(n) ? n : fallback;
  };

  res.json({
    ttsEngine: strFrom("TTS_ENGINE", "auto"),
    debugLockEnabled: boolFrom("TTS_DEBUG_PROVIDER_LOCK", "true"),
    kokoroDisabled: boolFrom("TTS_DISABLE_KOKORO", "false") === true
      ? true
      : String(process.env.TTS_DISABLE_KOKORO ?? "false").trim().toLowerCase() === "true",
    requestTimeoutMs: numFrom("TTS_REQUEST_TIMEOUT_MS", 12000),
    keys: {
      cartesiaKeySet: Boolean(process.env.CARTESIA_API_KEY),
      openaiKeySet: Boolean(process.env.OPENAI_API_KEY || process.env.TTS_API_KEY),
      elevenLabsKeySet: Boolean(process.env.ELEVENLABS_API_KEY),
      piperModelPathSet: Boolean(process.env.PIPER_MODEL_PATH),
    },
    env: strFrom("NODE_ENV", "production"),
  });
});

app.get("/ports.json", (_req, res) => {
  res.sendFile(PORT_FILE);
});

app.get("/voxis-config.js", (req, res) => {
  const port = req.socket.localPort || basePort;
  res.set("Content-Type", "application/javascript");
  res.send(`window.__VOXIS_BACKEND_URL__ = "http://localhost:${port}";`);
});

app.use(personalityRoutes);
app.use(chatRoutes);
app.use("/api/internal", internalChatRoutes);
app.use(settingsRoutes);
app.use(userRoutes);
app.use(loopRoutes);
app.use(sfxRoutes);
app.use(cognitionRoutes);
app.use('/api/voxis', voxisRoutes);

// Temporary diagnostic: test Cartesia connectivity directly without going through ttsService.
// Remove after confirming Cartesia API key/model works.
app.get("/health/tts/cartesia-ping", async (_req, res) => {
  const { getTtsCredential } = await import("./models/settingsModel.js");
  let dbCred = null;
  try { dbCred = getTtsCredential("cartesia"); } catch { /* ignore */ }
  const apiKey = dbCred?.apiKey || process.env.CARTESIA_API_KEY || "";
  const model = dbCred?.model || process.env.CARTESIA_MODEL || "sonic-3";
  const voiceId = dbCred?.voiceId || process.env.CARTESIA_VOICE_ID || "694f9389-aac1-45b6-b726-9d9369183238";

  if (!apiKey) return res.status(400).json({ error: "No Cartesia API key configured." });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch("https://api.cartesia.ai/tts/bytes", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "X-API-Key": apiKey,
          "Cartesia-Version": "2024-06-10",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: "Test.",
          model_id: model,
          voice: { mode: "id", id: voiceId },
          output_format: { container: "mp3", bit_rate: 128000, sample_rate: 44100 },
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    const body = await response.text();
    return res.json({
      status: response.ok ? "ok" : "error",
      httpStatus: response.status,
      bodyLength: body.length,
      bodyPreview: body.slice(0, 300),
      model,
      voiceId,
      keyPrefix: apiKey.slice(0, 8) + "...",
    });
  } catch (err) {
    return res.json({ status: "fetch_error", error: err.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error",
  });
});

async function startServer() {
  const port = await portfinder.getPortPromise({
    port: basePort,
    stopPort: basePort + 100,
  });

  // Write port to shared file
  const sharedDir = path.dirname(PORT_FILE);
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.writeFileSync(PORT_FILE, JSON.stringify({ backend: port }, null, 2));

  app.listen(port, listenHost, () => {
    const release = getReleaseInfo();
    console.log(
      `Voxis backend listening on http://${listenHost}:${port} (branch=${release.branch || "unknown"}, sha=${release.gitSha || "unknown"})`,
    );
    // Non-blocking SFX pre-fetch on startup
    initSfxCache().catch((err) => console.warn("[SFX Cache] init error:", err.message));
    // Pre-load Kokoro model in the background so the first TTS request is instant.
    // Skip if a different engine is forced via TTS_ENGINE env to avoid crash loops
    // when Kokoro's HuggingFace model files are unavailable.
    const _forcedEngine = String(process.env.TTS_ENGINE || "auto").trim().toLowerCase();
    const _kokoroDisabled = String(process.env.TTS_DISABLE_KOKORO ?? "false").trim().toLowerCase() === "true";
    if (!_kokoroDisabled && (_forcedEngine === "auto" || _forcedEngine === "kokoro")) {
      preloadKokoro().catch((err) => console.warn("[Kokoro] preload error:", err.message));
    } else {
      console.log(`[Kokoro] Preload skipped (TTS_ENGINE=${_forcedEngine}, TTS_DISABLE_KOKORO=${_kokoroDisabled}).`);
    }

    const cognitionStatus = startCognitionLoop();
    console.log("[CognitionLoop] started", {
      enabled: cognitionStatus.config.enabled,
      intervalMinutes: cognitionStatus.config.intervalMinutes,
      nextRunAt: cognitionStatus.nextRunAt,
    });
  });
}

startServer();
