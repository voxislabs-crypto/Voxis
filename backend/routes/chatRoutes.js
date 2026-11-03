import { Router } from "express";

import { chatHandler } from "../controllers/chatController.js";
import { transcribeAudioHandler } from "../controllers/sttController.js";
import { authenticatedVoiceAudioHandler, authenticatedVoiceTurnHandler } from "../controllers/voiceTurnController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/chat", requireAuth, chatHandler);
router.post("/stt/transcribe", requireAuth, transcribeAudioHandler);
router.post("/voice-turn", requireAuth, authenticatedVoiceTurnHandler);
router.get("/voice-audio/:id", requireAuth, authenticatedVoiceAudioHandler);

export default router;
