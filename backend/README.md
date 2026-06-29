# News Pulse — Backend API (Node.js / Express)

REST API that serves clusters, articles, and timeline data from the Postgres
database the Python scraper writes to.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| GET | `/clusters` | List clusters: label, top terms, article count, time range. `?source=<key>` filters. |
| GET | `/clusters/:id` | Full cluster detail + all articles, sorted chronologically. `400` on bad id, `404` if missing. |
| GET | `/timeline` | Clusters shaped for charting (see below). `?days=N` window (default 30, `0` = all), `?source=<key>`. |
| GET | `/sources` | Distinct sources with article counts (powers the source filter). |
| GET | `/activity` | Per-day article counts pivoted by source (powers the heatmap). `?days=N` window (default 30). |
| POST | `/ingest/trigger` | Spawns the Python pipeline as a detached subprocess; returns `{ jobId }` (`202`). |
| GET | `/ingest/status/:jobId` | Poll a run: `queued → running → done/error`, with `newArticles`/`clusterCount`. `404` if unknown. |

### Timeline shape

`/timeline` returns what a charting library actually needs rather than a raw list:

```json
{
  "domain": { "start": "...", "end": "..." },
  "count": 112,
  "items": [
    {
      "id": 114, "label": "Plane · Died · Crash", "topTerms": ["plane","died","crash"],
      "articleCount": 2, "startTime": "...", "endTime": "...",
      "durationMs": 14315000, "intensity": 1.0
    }
  ]
}
```

- `domain` — overall min/max for fixing the chart's time axis.
- `durationMs` — the active window per cluster (block width on the timeline).
- `intensity` — article count normalized to the busiest cluster (0..1) for sizing/shading markers.

## Setup

```bash
cd backend
npm install
cp .env.example .env     # set DATABASE_URL (same DB as the scraper)
npm start                # or: npm run dev  (watch mode)
```

## Config (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | — | Postgres connection string (required). SSL auto-enabled when `sslmode=require`. |
| `PORT` | `4000` | HTTP port |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins, or `*` |
| `PYTHON_BIN` | `../scraper/venv/bin/python` | Interpreter used by `/ingest/trigger` |
| `SCRAPER_DIR` | `../scraper` | Working dir for the pipeline subprocess |
| `INGEST_ENABLED` | `true` | Set `false` where the scraper isn't co-located; trigger then returns `501` |

## Notes

- `POST /ingest/trigger` shells out to `python -m src.pipeline --job-id <id>` and
  passes the process env through, so the subprocess gets `DATABASE_URL` even with
  no `.env` on the host. It pre-creates the job row (`queued`) so the client can
  poll immediately, then the pipeline transitions it to `running`/`done`.
- On hosts where Python isn't co-located with Node, set `INGEST_ENABLED=false`
  and run the scraper as a separate scheduled job against the same database.
- All config is env-driven; no DB URLs or secrets in code.
