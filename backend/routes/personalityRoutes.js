import { Router } from "express";

import {
  createPersonalityHandler,
  getPersonalityHandler,
  listPersonalitiesHandler,
  updateVoiceProfileHandler,
} from "../controllers/personalityController.js";
import { researchProfileHandler } from "../controllers/researchController.js";
import { chatHistoryHandler } from "../controllers/chatController.js";
import { generateSpeechHandler } from "../controllers/ttsController.js";

const router = Router();

router.post("/personality", createPersonalityHandler);
router.post("/research-profile", researchProfileHandler);
router.get("/personalities", listPersonalitiesHandler);
router.get("/personality/:id", getPersonalityHandler);
router.get("/personality/:id/messages", chatHistoryHandler);
router.post("/personality/:id/tts", generateSpeechHandler);
router.patch("/personality/:id/voice", updateVoiceProfileHandler);

export default router;
