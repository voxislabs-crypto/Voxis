import { Router } from "express";
import { prefetchSfx, serveSfx } from "../controllers/sfxController.js";

const router = Router();

router.get("/api/sfx/audio/:name", serveSfx);
router.post("/api/sfx/prefetch", prefetchSfx);

export default router;
