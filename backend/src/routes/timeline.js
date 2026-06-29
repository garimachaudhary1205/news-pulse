// /timeline route: clusters shaped specifically for a charting library.
//
// A timeline chart needs, per cluster: a start and end timestamp (the active
// window), a count, and a normalized "intensity" (0..1) so the frontend can
// size/shade markers without re-deriving the max itself. We also return the
// overall min/max so the chart can fix its axis domain.
import { Router } from "express";
import { query } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const { source } = req.query;
    const params = [];
    let where = "WHERE c.article_count > 0 AND c.start_time IS NOT NULL";

    // Recent-window filter (default 30 days). Keeps the axis readable by
    // dropping stray old-dated feed items (e.g. evergreen "app promo" entries)
    // that would otherwise stretch the domain across a year. Pass days=0 to
    // disable and return everything.
    const days = req.query.days === undefined ? 30 : Number(req.query.days);
    if (Number.isFinite(days) && days > 0) {
      params.push(days);
      where += ` AND c.end_time >= now() - ($${params.length} * interval '1 day')`;
    }

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
              (SELECT array_agg(DISTINCT a.source_key)
               FROM articles a WHERE a.cluster_id = c.id) AS sources
       FROM clusters c
       ${where}
       ORDER BY c.start_time ASC`,
      params
    );

    const maxCount = rows.reduce((m, r) => Math.max(m, r.articleCount), 0) || 1;

    const items = rows.map((r) => {
      const start = new Date(r.startTime).getTime();
      const end = new Date(r.endTime).getTime();
      return {
        id: r.id,
        label: r.label,
        topTerms: r.topTerms,
        sources: r.sources || [],
        articleCount: r.articleCount,
        startTime: r.startTime,
        endTime: r.endTime,
        // Active window in ms (0 for single-instant clusters).
        durationMs: Math.max(0, end - start),
        // Size/shade metric for the chart, normalized to the busiest cluster.
        intensity: Number((r.articleCount / maxCount).toFixed(3)),
      };
    });

    const domain = items.length
      ? {
          start: items.reduce(
            (min, i) => (i.startTime < min ? i.startTime : min),
            items[0].startTime
          ),
          end: items.reduce(
            (max, i) => (i.endTime > max ? i.endTime : max),
            items[0].endTime
          ),
        }
      : null;

    res.json({ domain, count: items.length, items });
  } catch (err) {
    next(err);
  }
});

export default router;
