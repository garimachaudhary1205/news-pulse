"""Postgres access layer: connection, schema bootstrap, and the small set of
read/write helpers the pipeline needs.

The same schema is read by the Node backend, so the shapes here are the
contract between the two services.

Uses psycopg v3 (ships prebuilt wheels — no local Postgres headers needed).
"""

import os

import psycopg
from psycopg.rows import dict_row


def get_connection():
    """Open a new Postgres connection from DATABASE_URL.

    A short-lived connection per run keeps things simple and plays well with
    serverless/pooled Postgres (Supabase, Neon).
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. Copy .env.example to .env and fill it in."
        )
    return psycopg.connect(url)


SCHEMA = """
CREATE TABLE IF NOT EXISTS clusters (
    id            SERIAL PRIMARY KEY,
    label         TEXT        NOT NULL,
    top_terms     TEXT[]      NOT NULL DEFAULT '{}',
    article_count INTEGER     NOT NULL DEFAULT 0,
    start_time    TIMESTAMPTZ,
    end_time      TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
    id           SERIAL PRIMARY KEY,
    guid         TEXT UNIQUE NOT NULL,           -- dedupe key (feed guid or link)
    url          TEXT        NOT NULL,
    source_key   TEXT        NOT NULL,
    source_name  TEXT        NOT NULL,
    title        TEXT        NOT NULL,
    summary      TEXT        NOT NULL DEFAULT '',
    content      TEXT        NOT NULL DEFAULT '',
    published_at TIMESTAMPTZ,
    fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    cluster_id   INTEGER     REFERENCES clusters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_cluster   ON articles (cluster_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at);
CREATE INDEX IF NOT EXISTS idx_articles_source    ON articles (source_key);

-- Tracks each pipeline run so the API's /ingest/status endpoint has something
-- real to report.
CREATE TABLE IF NOT EXISTS ingest_jobs (
    id              TEXT PRIMARY KEY,
    status          TEXT NOT NULL,               -- queued | running | done | error
    new_articles    INTEGER,
    cluster_count   INTEGER,
    error           TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ
);
"""


def init_schema(conn):
    with conn.cursor() as cur:
        cur.execute(SCHEMA)
    conn.commit()


def existing_guids(conn):
    """Return the set of guids already stored, so we can skip them on re-runs."""
    with conn.cursor() as cur:
        cur.execute("SELECT guid FROM articles")
        return {row[0] for row in cur.fetchall()}


def insert_articles(conn, articles):
    """Insert new articles, ignoring any whose guid already exists.

    Returns the number of rows actually inserted (counted before/after, since
    ON CONFLICT DO NOTHING makes per-row rowcount unreliable).
    """
    if not articles:
        return 0
    rows = [
        (
            a["guid"], a["url"], a["source_key"], a["source_name"],
            a["title"], a["summary"], a["content"], a["published_at"],
        )
        for a in articles
    ]
    with conn.cursor() as cur:
        before = _article_count(cur)
        cur.executemany(
            """
            INSERT INTO articles
                (guid, url, source_key, source_name, title, summary, content, published_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (guid) DO NOTHING
            """,
            rows,
        )
        after = _article_count(cur)
    conn.commit()
    return after - before


def _article_count(cur):
    cur.execute("SELECT count(*) FROM articles")
    return cur.fetchone()[0]


def fetch_articles_for_clustering(conn, limit):
    """Most-recent articles (by published_at, nulls last) for the clustering step."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, title, summary, content, source_key, published_at
            FROM articles
            ORDER BY published_at DESC NULLS LAST, id DESC
            LIMIT %s
            """,
            (limit,),
        )
        return cur.fetchall()


def replace_clusters(conn, clusters):
    """Atomically swap in a freshly computed set of clusters.

    `clusters` is a list of dicts: {label, top_terms, article_ids,
    start_time, end_time}. Old clusters are wiped and article assignments
    recomputed in a single transaction so the API never sees a half-built state.
    """
    with conn.cursor() as cur:
        # Detach articles and drop the previous clustering.
        cur.execute("UPDATE articles SET cluster_id = NULL")
        cur.execute("DELETE FROM clusters")

        for c in clusters:
            cur.execute(
                """
                INSERT INTO clusters (label, top_terms, article_count, start_time, end_time)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (c["label"], c["top_terms"], len(c["article_ids"]),
                 c["start_time"], c["end_time"]),
            )
            cluster_id = cur.fetchone()[0]
            cur.executemany(
                "UPDATE articles SET cluster_id = %s WHERE id = %s",
                [(cluster_id, aid) for aid in c["article_ids"]],
            )
    conn.commit()


# --- ingest job tracking (used by the pipeline + read by the Node API) ---

def create_job(conn, job_id):
    # Upsert: the Node API may have already pre-created the row as 'queued'
    # when it returned the job id to the client. Either way we mark it running.
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO ingest_jobs (id, status) VALUES (%s, 'running')
            ON CONFLICT (id) DO UPDATE SET status='running'
            """,
            (job_id,),
        )
    conn.commit()


def finish_job(conn, job_id, new_articles, cluster_count):
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE ingest_jobs
            SET status='done', new_articles=%s, cluster_count=%s, finished_at=now()
            WHERE id=%s
            """,
            (new_articles, cluster_count, job_id),
        )
    conn.commit()


def fail_job(conn, job_id, message):
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE ingest_jobs SET status='error', error=%s, finished_at=now() WHERE id=%s",
            (message[:1000], job_id),
        )
    conn.commit()
