import { Router } from "express";

import { chatHandler } from "../controllers/chatController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/chat", requireAuth, chatHandler);

export default router;
