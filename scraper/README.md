# News Pulse — Scraper (Python)

RSS ingestion, full-text extraction, and TF-IDF topic clustering. Writes to a
Postgres database that the Node backend reads from.

## What it does

1. **Ingest** (`src/ingest.py`) — pulls entries from the feeds in `src/feeds.py`,
   normalizes the inconsistent RSS fields (`description` vs `content:encoded`,
   varied/missing dates) into one schema, and fetches the full article body for
   new articles (trafilatura, with a BeautifulSoup paragraph fallback). Failures
   to fetch/parse a page degrade gracefully to the RSS summary.
2. **Store** (`src/db.py`) — inserts into Postgres, deduping on a `guid`
   (`ON CONFLICT DO NOTHING`) so repeated runs never store the same article
   twice. Only new articles get a body fetch, so re-runs are cheap.
3. **Cluster** (`src/cluster.py`) — builds TF-IDF vectors over title+summary+body,
   links articles whose cosine similarity ≥ threshold, and takes connected
   components (union-find) as clusters. Each cluster is labelled by its top
   aggregated TF-IDF terms.

## Sources used

BBC News, NPR, The Guardian, Al Jazeera — all public RSS feeds. Edit
`src/feeds.py` to change them; the rest of the pipeline is feed-agnostic.

## Clustering approach & parameters

- **Approach:** TF-IDF + cosine similarity with a similarity-threshold (union-find)
  grouping, rather than KMeans/DBSCAN. Union-find means we don't pre-specify a
  cluster count and natural single-story articles stay as their own cluster.
- **Threshold** (`CLUSTER_SIMILARITY_THRESHOLD`, default `0.30`): chosen
  empirically — high enough that unrelated headlines don't merge, low enough that
  the same story across outlets does. Lower it for looser/bigger clusters, raise
  it for tighter ones.
- **Vectorizer:** English stop-words, unigrams + bigrams (bigrams capture
  multi-word entities like "world cup"), `sublinear_tf` to dampen long bodies,
  and the title repeated so the headline carries extra weight.
- **Known limitation:** purely lexical — two articles about the same event that
  use different vocabulary (e.g. "ceasefire" vs "truce") may not merge, and the
  threshold is global rather than adapted per topic. Embeddings would help but
  add heavy dependencies.

## Setup

```bash
cd scraper
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then put your Postgres URL in DATABASE_URL
```

## Run

```bash
# one-off run (scrape + cluster)
python -m src.pipeline

# generate + track a job id (used by the Node API's ingest endpoints)
python -m src.pipeline --new-job-id
python -m src.pipeline --job-id <existing-id>
```

Schema is created automatically on first run. Safe to run repeatedly — ideal for
a cron / scheduled job.

## Config (env vars)

| Var | Default | Purpose |
|-----|---------|---------|
| `DATABASE_URL` | — | Postgres connection string (required) |
| `CLUSTER_SIMILARITY_THRESHOLD` | `0.30` | Cosine threshold for "same topic" |
| `MAX_FULL_FETCH` | `60` | Max article bodies to fetch per run |
| `FETCH_TIMEOUT` | `12` | Per-request timeout (seconds) |
| `CLUSTER_WINDOW` | `400` | Most-recent N articles fed to clustering |
