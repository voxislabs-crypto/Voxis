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
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// /me — resolves the currently signed-in Voxis user from the Clerk token
router.get("/me", requireAuth, (req, res) => res.json({ user: req.voxisUser }));

router.get("/users", requireAuth, listUsersHandler);
router.post("/users", requireAuth, createUserHandler);
router.get("/users/:id/profile", requireAuth, getUserProfileHandler);
router.put("/users/:id/profile", requireAuth, updateUserProfileHandler);
router.get("/users/:id/memory", requireAuth, listUserMemoryHandler);
router.post("/users/:id/memory", requireAuth, createUserMemoryHandler);
router.put("/users/:id/memory/:memoryId", requireAuth, updateUserMemoryHandler);
router.delete("/users/:id/memory/:memoryId", requireAuth, deleteUserMemoryHandler);

export default router;
