import "dotenv/config";
import express from "express";
import cors from "cors";

import personalityRoutes from "./routes/personalityRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(personalityRoutes);
app.use(chatRoutes);

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
