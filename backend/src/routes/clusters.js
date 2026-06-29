// /clusters routes: list view + full detail.
import { Router } from "express";
import { query } from "../db.js";

const router = Router();

// GET /clusters — list of topic clusters with label, article count, time range.
// Optional ?source=<key> filters to clusters that contain an article from that
// source (used by the frontend source toggle).
router.get("/", async (req, res, next) => {
  try {
    const { source } = req.query;
    const params = [];
    let where = "WHERE c.article_count > 0";
    if (source) {
      params.push(source);
      where += ` AND EXISTS (
        SELECT 1 FROM articles a
        WHERE a.cluster_id = c.id AND a.source_key = $${params.length}
      )`;
    }
    const { rows } = await query(
      `SELECT c.id, c.label, c.top_terms AS "topTerms",
              c.article_count AS "articleCount",
              c.start_time AS "startTime", c.end_time AS "endTime",
              c.updated_at AS "updatedAt",
              (SELECT array_agg(DISTINCT a.source_key)
               FROM articles a WHERE a.cluster_id = c.id) AS sources
       FROM clusters c
       ${where}
       ORDER BY c.article_count DESC, c.end_time DESC NULLS LAST`,
      params
    );
    res.json({ clusters: rows });
  } catch (err) {
    next(err);
  }
});

// GET /clusters/:id — full cluster detail with all articles, chronological.
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid cluster id" });
    }

    const clusterResult = await query(
      `SELECT id, label, top_terms AS "topTerms",
              article_count AS "articleCount",
              start_time AS "startTime", end_time AS "endTime",
              updated_at AS "updatedAt"
       FROM clusters WHERE id = $1`,
      [id]
    );
    if (clusterResult.rowCount === 0) {
      return res.status(404).json({ error: "Cluster not found" });
    }

    const articlesResult = await query(
      `SELECT id, title, url, source_key AS "sourceKey",
              source_name AS "sourceName", summary,
              published_at AS "publishedAt"
       FROM articles
       WHERE cluster_id = $1
       ORDER BY published_at ASC NULLS LAST, id ASC`,
      [id]
    );

    res.json({ ...clusterResult.rows[0], articles: articlesResult.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
