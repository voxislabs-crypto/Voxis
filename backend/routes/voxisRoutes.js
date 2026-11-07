import express from "express";

const router = express.Router();

// Unused by the current UI. The only caller was frontend/src/components/VoxisTab.old.jsx.
// chatWithVoxis skipped the mood step, user context, and response strategy.
// Persona turns go to POST /chat. This response keeps an old client from using the bypass.
router.post("/chat", (_req, res) => {
  return res.status(410).json({
    success: false,
    error: "POST /api/voxis/chat is unused. Send persona turns to POST /chat.",
  });
});

export default router;
