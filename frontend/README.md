# News Pulse — Frontend (Next.js / React)

The timeline visualization and cluster explorer. Talks to the Node backend.

## Features

- **Custom timeline** — each cluster is plotted along a time axis as a block
  spanning its earliest → latest article (a marker for single-instant clusters).
  Block **width = active window**, **size = article count**, and colour
  distinguishes single-source (blue) from **cross-source** stories (amber).
- **Cluster detail** — click any topic to slide open a panel with its articles
  (headline → original link, source, published time, summary).
- **Two views** — a custom **Timeline** (Gantt) and a calendar-style
  **Heatmap** of article volume per source per day (backed by `/activity`).
  Switch with the Timeline/Heatmap toggle; `?view=heatmap` deep-links to it.
- **Source filter** — toggle chips to include/exclude outlets.
- **Topic search** — filter clusters by keyword (label / top terms).
- **Sort** — "Most active" (biggest topics first) or "Most recent".
- **Refresh data** — triggers `POST /ingest/trigger`, polls status, and reloads
  the timeline when the run finishes.
- **Multi-article only** toggle — focus on real stories vs. one-off headlines.
- **Auto-refresh** (stretch) — polls `/timeline` every 30s and updates live.
- **Freshness indicator** — "Latest article Xh ago" in the header.
- **Deep links** — `?cluster=<id>` opens that cluster's detail on load.
- Rows are capped (60) when browsing all clusters so the timeline never renders a
  wall of single-article markers; the count line shows how many matched.
- Esc closes the detail panel; article times show as relative ("3h ago").

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local      # set NEXT_PUBLIC_API_URL to your backend
npm run dev                      # http://localhost:3000
```

## Config

| Var | Purpose |
|-----|---------|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API (e.g. `http://localhost:4000` or your Render URL) |

## Stack notes

- Next.js 16 (App Router) + React 19 + Tailwind CSS v4.
- The timeline is hand-built (no charting library) for full control over the
  Gantt-style layout, intensity sizing, and cross-source colouring. Positions
  are percentage-based off a domain computed from the visible items, so the axis
  auto-zooms to whatever the filters leave on screen.
- API access is a thin typed client in `lib/api.ts`; types mirror the backend in
  `lib/types.ts`.
