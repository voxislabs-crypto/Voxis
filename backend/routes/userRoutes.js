import { Router } from "express";

import {
  createUserHandler,
  getUserProfileHandler,
  listUsersHandler,
  updateUserProfileHandler,
} from "../controllers/userController.js";
import {
  createUserMemoryHandler,
  deleteUserMemoryHandler,
  listUserMemoryHandler,
  updateUserMemoryHandler,
} from "../controllers/userMemoryController.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { requireSelfOrAdmin } from "../gatekeeper/authorization.js";

const router = Router();

// /me — resolves the currently signed-in Voxis user from the Clerk token
router.get("/me", requireAuth, (req, res) => res.json({ user: req.voxisUser }));

router.get("/users", requireAuth, requireAdmin, listUsersHandler);
router.post("/users", requireAuth, requireAdmin, createUserHandler);
router.get("/users/:id/profile", requireAuth, requireSelfOrAdmin(), getUserProfileHandler);
router.put("/users/:id/profile", requireAuth, requireSelfOrAdmin(), updateUserProfileHandler);
router.get("/users/:id/memory", requireAuth, requireSelfOrAdmin(), listUserMemoryHandler);
router.post("/users/:id/memory", requireAuth, requireSelfOrAdmin(), createUserMemoryHandler);
router.put("/users/:id/memory/:memoryId", requireAuth, requireSelfOrAdmin(), updateUserMemoryHandler);
router.delete("/users/:id/memory/:memoryId", requireAuth, requireSelfOrAdmin(), deleteUserMemoryHandler);

export default router;
