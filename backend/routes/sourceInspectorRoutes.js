import { Router } from "express";

import { createSourceInspectorHandlers } from "../controllers/sourceInspectorController.js";
import { requireSourceInspectorAuth } from "../middleware/requireSourceInspectorAuth.js";

export function createSourceInspectorRouter(deps) {
  const {
    discoverHandler,
    readHandler,
    searchHandler,
  } = createSourceInspectorHandlers(deps);
  const router = Router();
  router.use(requireSourceInspectorAuth);
  router.post("/discover", discoverHandler);
  router.post("/read", readHandler);
  router.post("/search", searchHandler);
  return router;
}

const sourceInspectorRoutes = createSourceInspectorRouter();

export default sourceInspectorRoutes;
