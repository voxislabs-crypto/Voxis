import { Router } from "express";
import { listSfxTagsHandler, prefetchSfx, serveSfx } from "../controllers/sfxController.js";

const router = Router();

router.get("/api/sfx/audio/:name", serveSfx);
router.post("/api/sfx/prefetch", prefetchSfx);
router.get("/api/sfx/tags", listSfxTagsHandler);
// Dev proxy compatibility
router.get("/sfx/audio/:name", serveSfx);
router.post("/sfx/prefetch", prefetchSfx);
router.get("/sfx/tags", listSfxTagsHandler);

export default router;
