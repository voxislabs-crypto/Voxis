import express from "express";
import cors from "cors";

import personalityRoutes from "./routes/personalityRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import loopRoutes from "./routes/loopRoutes.js";
import sfxRoutes from "./routes/sfxRoutes.js";
import { initSfxCache } from "./services/sfxCacheService.js";
import { getTtsHealthStatus, preloadKokoro } from "./services/ttsService.js";
import { clerkVerify } from "./middleware/requireAuth.js";

try {
  await import("dotenv/config");
} catch {
  console.warn("[Env] dotenv not installed; relying on PM2/system environment only.");
}

const app = express();
const port = Number(process.env.PORT || 3101);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());

// Clerk JWT verification runs on every request (no-op when no token present).
// Individual routes call requireAuth() to enforce sign-in.
app.use(clerkVerify);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/health/tts", async (_req, res, next) => {
  try {
    const status = await getTtsHealthStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

app.use(personalityRoutes);
app.use(chatRoutes);
app.use(settingsRoutes);
app.use(userRoutes);
app.use(loopRoutes);
app.use(sfxRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error",
  });
});

app.listen(port, () => {
  console.log(`Voxis backend listening on port ${port}`);
  // Non-blocking SFX pre-fetch on startup
  initSfxCache().catch((err) => console.warn("[SFX Cache] init error:", err.message));
  // Pre-load Kokoro model in the background so the first TTS request is instant
  preloadKokoro().catch((err) => console.warn("[Kokoro] preload error:", err.message));
});
