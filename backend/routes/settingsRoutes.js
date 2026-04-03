import { Router } from "express";

import {
  connectLlmSettingsHandler,
  detectLlmProviderHandler,
  disconnectLlmSettingsHandler,
  getLlmSettingsHandler,
  listLlmProvidersHandler,
  selectLlmModelHandler,
} from "../controllers/settingsController.js";

const router = Router();

router.get("/settings/llm", getLlmSettingsHandler);
router.get("/settings/llm/providers", listLlmProvidersHandler);
router.post("/settings/llm/connect", connectLlmSettingsHandler);
router.post("/settings/llm/detect", detectLlmProviderHandler);
router.post("/settings/llm/model", selectLlmModelHandler);
router.delete("/settings/llm", disconnectLlmSettingsHandler);

export default router;
