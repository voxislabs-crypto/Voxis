import { Router } from "express";

import {
  createPersonalityHandler,
  getPersonalityHandler,
  listPersonalitiesHandler,
  updatePersonalityHandler,
  updateVoiceProfileHandler,
  getVoicePresetsHandler,
  getRecommendedVoicePresetHandler,
} from "../controllers/personalityController.js";
import { runHarnessHandler } from "../controllers/harnessController.js";
import { researchProfileHandler } from "../controllers/researchController.js";
import { chatHistoryHandler } from "../controllers/chatController.js";
import { generateSpeechHandler, listPiperVoicesHandler, listKokoroVoicesHandler, listProviderStatusHandler } from "../controllers/ttsController.js";
import { extractProsodyTemplateHandler } from "../controllers/prosodyController.js";
import {
  extractVoiceSamplesHandler,
  confirmVoiceSampleHandler,
  getVoiceSamplesHandler,
  streamVoiceSampleAudioHandler,
} from "../controllers/voiceSampleController.js";
import {
  backfillMemoryEmbeddingsHandler,
  listMemoryHandler,
  updateMemoryHandler,
  deleteMemoryHandler,
} from "../controllers/memoryController.js";
import {
  performanceHandler,
  parsePerformanceHandler,
} from "../controllers/performanceController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/personality", requireAuth, createPersonalityHandler);
router.post("/research-profile", requireAuth, researchProfileHandler);
router.get("/personalities", requireAuth, listPersonalitiesHandler);
router.get("/voice-presets", requireAuth, getVoicePresetsHandler);
router.get("/personality/:id", requireAuth, getPersonalityHandler);
router.get("/personality/:id/voice-preset", requireAuth, getRecommendedVoicePresetHandler);
router.put("/personality/:id", requireAuth, updatePersonalityHandler);
router.post("/personality/:id/harness", requireAuth, runHarnessHandler);
router.get("/personality/:id/messages", requireAuth, chatHistoryHandler);
router.get("/personality/:id/memory", requireAuth, listMemoryHandler);
router.post("/personality/:id/memory/backfill", requireAuth, backfillMemoryEmbeddingsHandler);
router.put("/memory/:memoryId", requireAuth, updateMemoryHandler);
router.delete("/memory/:memoryId", requireAuth, deleteMemoryHandler);
router.get("/tts/piper-voices", requireAuth, listPiperVoicesHandler);
router.get("/tts/kokoro-voices", requireAuth, listKokoroVoicesHandler);
router.get("/tts/providers", requireAuth, listProviderStatusHandler);
router.post("/personality/:id/tts", requireAuth, generateSpeechHandler);
router.post("/personality/:id/prosody-template", requireAuth, extractProsodyTemplateHandler);
router.post("/personality/:id/voice-samples", requireAuth, extractVoiceSamplesHandler);
router.get("/personality/:id/voice-samples", requireAuth, getVoiceSamplesHandler);
router.post("/personality/:id/voice-samples/confirm", requireAuth, confirmVoiceSampleHandler);
router.get("/personality/:id/voice-samples/audio/:clipFile", requireAuth, streamVoiceSampleAudioHandler);
router.patch("/personality/:id/voice", requireAuth, updateVoiceProfileHandler);
router.post("/personality/:id/performance", requireAuth, performanceHandler);
router.post("/personality/:id/performance/parse", requireAuth, parsePerformanceHandler);

export default router;
