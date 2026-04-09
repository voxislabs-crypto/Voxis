import { Router } from "express";
import {
  getLoopManifestHandler,
  streamLoopAudioHandler,
  getLoopStatusHandler,
  refreshAllLoopsHandler,
  refreshMoodLoopHandler,
} from "../controllers/loopController.js";

const router = Router();

// Public — PerformancePlayer fetches these at runtime
router.get("/api/loops/manifest", getLoopManifestHandler);
router.get("/api/loops/audio/:filename", streamLoopAudioHandler);

// Admin — trigger cache refresh (no auth required for local dev; add requireAuth() for prod)
router.get("/api/loops/status", getLoopStatusHandler);
router.post("/api/loops/refresh", refreshAllLoopsHandler);
router.post("/api/loops/refresh/:mood", refreshMoodLoopHandler);

export default router;
