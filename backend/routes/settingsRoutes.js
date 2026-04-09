import { Router } from "express";

import {
  connectLlmSettingsHandler,
  detectLlmProviderHandler,
  disconnectLlmSettingsHandler,
  getLlmSettingsHandler,
  listLlmProvidersHandler,
  selectLlmModelHandler,
  getTtsSettingsHandler,
  saveTtsCredentialHandler,
  clearTtsCredentialHandler,
  saveVoiceDefaultsHandler,
} from "../controllers/settingsController.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";

const router = Router();

router.get("/settings/llm", requireAuth, getLlmSettingsHandler);
router.get("/settings/llm/providers", requireAuth, listLlmProvidersHandler);
router.post("/settings/llm/connect", requireAuth, requireAdmin, connectLlmSettingsHandler);
router.post("/settings/llm/detect", requireAuth, requireAdmin, detectLlmProviderHandler);
router.post("/settings/llm/model", requireAuth, requireAdmin, selectLlmModelHandler);
router.delete("/settings/llm", requireAuth, requireAdmin, disconnectLlmSettingsHandler);

// TTS BYOK — users save API keys from the browser, no .env needed
router.get("/settings/tts", requireAuth, getTtsSettingsHandler);
router.put("/settings/voice-defaults", requireAuth, requireAdmin, saveVoiceDefaultsHandler);
router.put("/settings/tts/:provider", requireAuth, requireAdmin, saveTtsCredentialHandler);
router.delete("/settings/tts/:provider", requireAuth, requireAdmin, clearTtsCredentialHandler);

export default router;
