import "dotenv/config";
import express from "express";
import cors from "cors";

import personalityRoutes from "./routes/personalityRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import loopRoutes from "./routes/loopRoutes.js";
import { clerkVerify } from "./middleware/requireAuth.js";

const app = express();
const port = Number(process.env.PORT || 3101);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());

// Clerk JWT verification runs on every request (no-op when no token present).
// Individual routes call requireAuth() to enforce sign-in.
app.use(clerkVerify);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(personalityRoutes);
app.use(chatRoutes);
app.use(settingsRoutes);
app.use(userRoutes);
app.use(loopRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error",
  });
});

app.listen(port, () => {
  console.log(`Voxis backend listening on port ${port}`);
});
