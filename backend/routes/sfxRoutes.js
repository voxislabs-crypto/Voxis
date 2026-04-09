import { Router } from "express";
import { serveSfx } from "../controllers/sfxController.js";

const router = Router();

router.get("/api/sfx/audio/:name", serveSfx);

export default router;
