import { Router } from "express";

import { internalChatHandler } from "../controllers/internalChatController.js";
import {
  internalContextHandler,
  internalRoundHandler,
} from "../controllers/internalContextController.js";
import {
  voiceAudioHandler,
  voiceTurnHandler,
} from "../controllers/voiceTurnController.js";
import { requireInternalAuth } from "../middleware/requireInternalAuth.js";

const router = Router();

router.post("/chat", requireInternalAuth, internalChatHandler);
router.post("/context", requireInternalAuth, internalContextHandler);
router.post("/round", requireInternalAuth, internalRoundHandler);
router.post("/voice-turn", requireInternalAuth, voiceTurnHandler);
router.get("/voice-audio/:id", requireInternalAuth, voiceAudioHandler);

export default router;
