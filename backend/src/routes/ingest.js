// /ingest routes: trigger the Python pipeline and poll its status.
import { Router } from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { query } from "../db.js";

const router = Router();

const INGEST_ENABLED = process.env.INGEST_ENABLED !== "false";
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const SCRAPER_DIR = path.resolve(process.env.SCRAPER_DIR || "../scraper");

// POST /ingest/trigger — kick off scrape+cluster as a detached subprocess.
// Pre-creates the job row so the client can poll immediately, then returns 202.
router.post("/trigger", async (req, res, next) => {
  if (!INGEST_ENABLED) {
    return res.status(501).json({
      error:
        "Ingestion is not enabled on this host. The scraper runs as a separate scheduled job.",
    });
  }

  const jobId = randomUUID();
  try {
    await query(
      "INSERT INTO ingest_jobs (id, status) VALUES ($1, 'queued')",
      [jobId]
    );
  } catch (err) {
    return next(err);
  }

  try {
    const child = spawn(
      PYTHON_BIN,
      ["-m", "src.pipeline", "--job-id", jobId],
      {
        cwd: SCRAPER_DIR,
        // Pass our env through so the subprocess sees DATABASE_URL even when
        // there's no .env file on the host (production).
        env: { ...process.env },
        detached: true,
        stdio: "ignore",
      }
    );

    child.on("error", async (err) => {
      // e.g. python binary not found — record it so the poll surfaces it.
      await query(
        "UPDATE ingest_jobs SET status='error', error=$2, finished_at=now() WHERE id=$1",
        [jobId, `Failed to start pipeline: ${err.message}`]
      ).catch(() => {});
    });

    child.unref();
  } catch (err) {
    await query(
      "UPDATE ingest_jobs SET status='error', error=$2, finished_at=now() WHERE id=$1",
      [jobId, `Failed to start pipeline: ${err.message}`]
    ).catch(() => {});
    return next(err);
  }

  res.status(202).json({ jobId, status: "queued" });
});

// GET /ingest/status/:jobId — current state of a run.
router.get("/status/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { rows, rowCount } = await query(
      `SELECT id AS "jobId", status,
              new_articles AS "newArticles",
              cluster_count AS "clusterCount",
              error, started_at AS "startedAt", finished_at AS "finishedAt"
       FROM ingest_jobs WHERE id = $1`,
      [jobId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
