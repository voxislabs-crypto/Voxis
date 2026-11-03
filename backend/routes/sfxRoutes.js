import { Router } from "express";
import { listSfxTagsHandler, prefetchSfx, serveSfx } from "../controllers/sfxController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.get("/api/sfx/audio/:name", serveSfx);
router.post("/api/sfx/prefetch", requireAuth, prefetchSfx);
router.get("/api/sfx/tags", listSfxTagsHandler);
// Dev proxy compatibility
router.get("/sfx/audio/:name", serveSfx);
router.post("/sfx/prefetch", requireAuth, prefetchSfx);
router.get("/sfx/tags", listSfxTagsHandler);

export default router;
