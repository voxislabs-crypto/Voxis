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

const router = Router();

router.get("/users", listUsersHandler);
router.post("/users", createUserHandler);
router.get("/users/:id/profile", getUserProfileHandler);
router.put("/users/:id/profile", updateUserProfileHandler);
router.get("/users/:id/memory", listUserMemoryHandler);
router.post("/users/:id/memory", createUserMemoryHandler);
router.put("/users/:id/memory/:memoryId", updateUserMemoryHandler);
router.delete("/users/:id/memory/:memoryId", deleteUserMemoryHandler);

export default router;
