import "dotenv/config";
import express from "express";
import cors from "cors";

import clustersRouter from "./routes/clusters.js";
import timelineRouter from "./routes/timeline.js";
import ingestRouter from "./routes/ingest.js";
import sourcesRouter from "./routes/sources.js";
import activityRouter from "./routes/activity.js";

const app = express();
app.use(express.json());

// CORS: allow configured origins (comma-separated) or any when "*".
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(
  cors({
    origin:
      corsOrigin === "*" ? true : corsOrigin.split(",").map((s) => s.trim()),
  })
);

app.get("/", (_req, res) => {
  res.json({
    service: "news-pulse-backend",
    endpoints: [
      "GET /health",
      "GET /clusters",
      "GET /clusters/:id",
      "GET /timeline",
      "GET /sources",
      "GET /activity",
      "POST /ingest/trigger",
      "GET /ingest/status/:jobId",
    ],
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/clusters", clustersRouter);
app.use("/timeline", timelineRouter);
app.use("/ingest", ingestRouter);
app.use("/sources", sourcesRouter);
app.use("/activity", activityRouter);

// 404 for anything unmatched.
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// Central error handler — logs server-side, returns a clean 500.
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`News Pulse API listening on :${port}`);
});
