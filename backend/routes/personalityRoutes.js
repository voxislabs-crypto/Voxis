import { Router } from "express";

import {
  claimLegacyPersonalitiesHandler,
  analyzeCharacterHandler,
  createPersonalityHandler,
  deletePersonalityHandler,
  getPersonalityHandler,
  listPersonalitiesHandler,
  resetPersonalityHandler,
  updatePersonalityHandler,
  updateVoiceProfileHandler,
  previewSpokenShiftHandler,
  applySpokenShiftHandler,
  getVoicePresetsHandler,
  getRecommendedVoicePresetHandler,
  extractPersonaHandler,
  explainBehaviorHandler,
  classifyIntentHandler,
} from "../controllers/personalityController.js";
import { runHarnessHandler } from "../controllers/harnessController.js";
import { researchProfileHandler } from "../controllers/researchController.js";
import { chatHistoryHandler, personaOpenerHandler } from "../controllers/chatController.js";
import {
  generateSpeechHandler,
  listPiperVoicesHandler,
  listKokoroVoicesHandler,
  listProviderStatusHandler,
  listProviderOptionsHandler,
} from "../controllers/ttsController.js";
import { extractProsodyTemplateHandler, searchYouTubeHandler } from "../controllers/prosodyController.js";
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
  listPersonaPreferencesHandler,
  createPersonaPreferenceHandler,
  updatePersonaPreferenceHandler,
  deletePersonaPreferenceHandler,
} from "../controllers/preferencesController.js";
import {
  performanceHandler,
  parsePerformanceHandler,
} from "../controllers/performanceController.js";
import {
  startVoiceCloneHandler,
  removeVoiceCloneHandler,
  getVoiceCloneStatusHandler,
  listRvcPacksHandler,
  uploadRvcPackHandler,
  deleteRvcPackHandler,
} from "../controllers/voiceCloneController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.post("/personality", requireAuth, createPersonalityHandler);
router.post("/personality/spoken-shift/preview", requireAuth, previewSpokenShiftHandler);
router.post("/analyze-character", requireAuth, analyzeCharacterHandler);
router.post("/extract-persona", requireAuth, extractPersonaHandler);
router.post("/explain-behavior", requireAuth, explainBehaviorHandler);
router.post("/classify-intent", requireAuth, classifyIntentHandler);
router.post("/research-profile", requireAuth, researchProfileHandler);
router.get("/personalities", requireAuth, listPersonalitiesHandler);
router.post("/personalities/claim-legacy", requireAuth, claimLegacyPersonalitiesHandler);
router.get("/voice-presets", requireAuth, getVoicePresetsHandler);
router.get("/personality/:id", requireAuth, getPersonalityHandler);
router.get("/personality/:id/voice-preset", requireAuth, getRecommendedVoicePresetHandler);
router.put("/personality/:id", requireAuth, updatePersonalityHandler);
router.post("/personality/:id/spoken-shift/apply", requireAuth, applySpokenShiftHandler);
router.post("/personality/:id/reset", requireAuth, resetPersonalityHandler);
router.delete("/personality/:id", requireAuth, deletePersonalityHandler);
router.post("/personality/:id/harness", requireAuth, runHarnessHandler);
router.get("/personality/:id/messages", requireAuth, chatHistoryHandler);
router.post("/personality/:id/opener", requireAuth, personaOpenerHandler);
router.get("/personality/:id/memory", requireAuth, listMemoryHandler);
router.post("/personality/:id/memory/backfill", requireAuth, backfillMemoryEmbeddingsHandler);
router.put("/memory/:memoryId", requireAuth, updateMemoryHandler);
router.delete("/memory/:memoryId", requireAuth, deleteMemoryHandler);
router.get("/personality/:id/preferences", requireAuth, listPersonaPreferencesHandler);
router.post("/personality/:id/preferences", requireAuth, createPersonaPreferenceHandler);
router.put("/personality-preference/:prefId", requireAuth, updatePersonaPreferenceHandler);
router.delete("/personality-preference/:prefId", requireAuth, deletePersonaPreferenceHandler);
router.get("/tts/piper-voices", requireAuth, listPiperVoicesHandler);
router.get("/tts/kokoro-voices", requireAuth, listKokoroVoicesHandler);
router.get("/tts/providers", requireAuth, listProviderStatusHandler);
router.get("/tts/provider-options", requireAuth, listProviderOptionsHandler);
router.post("/personality/:id/tts", requireAuth, generateSpeechHandler);
router.get("/youtube/search", requireAuth, searchYouTubeHandler);
router.post("/personality/:id/prosody-template", requireAuth, extractProsodyTemplateHandler);
router.post("/personality/:id/voice-samples", requireAuth, extractVoiceSamplesHandler);
router.get("/personality/:id/voice-samples", requireAuth, getVoiceSamplesHandler);
router.post("/personality/:id/voice-samples/confirm", requireAuth, confirmVoiceSampleHandler);
router.get("/personality/:id/voice-samples/audio/:clipFile", requireAuth, streamVoiceSampleAudioHandler);
router.patch("/personality/:id/voice", requireAuth, updateVoiceProfileHandler);
router.post("/personality/:id/performance", requireAuth, performanceHandler);
router.post("/personality/:id/performance/parse", requireAuth, parsePerformanceHandler);

// ── Voice Clone routes ───────────────────────────────────────────────────────
router.get("/personality/:id/voice-clone", requireAuth, getVoiceCloneStatusHandler);
router.post("/personality/:id/voice-clone", requireAuth, ...startVoiceCloneHandler);
router.delete("/personality/:id/voice-clone", requireAuth, removeVoiceCloneHandler);
router.get("/voice-clone/rvc-packs", requireAuth, listRvcPacksHandler);
router.post("/voice-clone/rvc-packs", requireAuth, ...uploadRvcPackHandler);
router.delete("/voice-clone/rvc-packs/:packId", requireAuth, deleteRvcPackHandler);

export default router;
