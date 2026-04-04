import { Router } from "express";

import {
  connectLlmSettingsHandler,
  detectLlmProviderHandler,
  disconnectLlmSettingsHandler,
  getLlmSettingsHandler,
  listLlmProvidersHandler,
  selectLlmModelHandler,
} from "../controllers/settingsController.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";

const router = Router();

router.get("/settings/llm", requireAuth, getLlmSettingsHandler);
router.get("/settings/llm/providers", requireAuth, listLlmProvidersHandler);
router.post("/settings/llm/connect", requireAuth, requireAdmin, connectLlmSettingsHandler);
router.post("/settings/llm/detect", requireAuth, requireAdmin, detectLlmProviderHandler);
router.post("/settings/llm/model", requireAuth, requireAdmin, selectLlmModelHandler);
router.delete("/settings/llm", requireAuth, requireAdmin, disconnectLlmSettingsHandler);

export default router;
