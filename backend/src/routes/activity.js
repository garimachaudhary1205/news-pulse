// /activity route: article volume bucketed by day and source, for the
// calendar-style heatmap. Counts come straight from the articles table so the
// heatmap reflects real per-day publishing volume (not cluster approximations).
import { Router } from "express";
import { query } from "../db.js";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const params = [];
    let where = "WHERE published_at IS NOT NULL";

    const days = req.query.days === undefined ? 30 : Number(req.query.days);
    if (Number.isFinite(days) && days > 0) {
      params.push(days);
      where += ` AND published_at >= now() - ($${params.length} * interval '1 day')`;
    }

    const { rows } = await query(
      `SELECT to_char(date_trunc('day', published_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
              source_key AS "sourceKey", source_name AS "sourceName",
              count(*)::int AS count
       FROM articles
       ${where}
       GROUP BY 1, 2, 3
       ORDER BY 1`,
      params
    );

    // Pivot into a heatmap-friendly shape on the server.
    const daySet = new Set();
    const srcMap = new Map(); // key -> { key, name, counts: {day:n}, total }
    const totalsByDay = {};
    let maxCell = 0;
    let maxTotal = 0;

    for (const r of rows) {
      daySet.add(r.day);
      if (!srcMap.has(r.sourceKey)) {
        srcMap.set(r.sourceKey, {
          key: r.sourceKey,
          name: r.sourceName,
          counts: {},
          total: 0,
        });
      }
      const src = srcMap.get(r.sourceKey);
      src.counts[r.day] = r.count;
      src.total += r.count;
      maxCell = Math.max(maxCell, r.count);
      totalsByDay[r.day] = (totalsByDay[r.day] || 0) + r.count;
      maxTotal = Math.max(maxTotal, totalsByDay[r.day]);
    }

    const days_ = Array.from(daySet).sort();
    const sources = Array.from(srcMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    res.json({ days: days_, sources, totalsByDay, maxCell, maxTotal });
  } catch (err) {
    next(err);
  }
});

export default router;
