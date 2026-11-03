import { Router } from "express";
import {
  getLoopManifestHandler,
  streamLoopAudioHandler,
  getLoopStatusHandler,
  refreshAllLoopsHandler,
  refreshMoodLoopHandler,
} from "../controllers/loopController.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Public — PerformancePlayer fetches these at runtime
router.get("/api/loops/manifest", getLoopManifestHandler);
router.get("/api/loops/audio/:filename", streamLoopAudioHandler);

// Runtime/cache control is administrative. Public media playback remains above.
router.get("/api/loops/status", requireAuth, requireAdmin, getLoopStatusHandler);
router.post("/api/loops/refresh", requireAuth, requireAdmin, refreshAllLoopsHandler);
router.post("/api/loops/refresh/:mood", requireAuth, requireAdmin, refreshMoodLoopHandler);

export default router;
