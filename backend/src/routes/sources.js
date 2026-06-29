// /sources route: the distinct news sources present in the data, with counts.
// Powers the frontend's "filter by source" toggle.
import { Router } from "express";
import { query } from "../db.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT source_key AS "key", source_name AS "name", count(*)::int AS "articleCount"
       FROM articles
       GROUP BY source_key, source_name
       ORDER BY "name"`
    );
    res.json({ sources: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
