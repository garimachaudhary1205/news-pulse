"""Pipeline entry point: scrape -> store -> cluster.

Runnable directly (`python -m src.pipeline`) for local/cron use, and importable
by the Node backend, which shells out to it for POST /ingest/trigger.

A job id can be passed so the run records its status in the ingest_jobs table
for the API's /ingest/status/:jobId endpoint:

    python -m src.pipeline --job-id <id>
"""

import argparse
import os
import sys
import uuid

from dotenv import load_dotenv

from . import db
from .cluster import cluster_articles
from .ingest import collect_new_articles


def _int_env(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def run(job_id=None):
    load_dotenv()

    threshold = float(os.environ.get("CLUSTER_SIMILARITY_THRESHOLD", "0.30"))
    max_full_fetch = _int_env("MAX_FULL_FETCH", 60)
    fetch_timeout = _int_env("FETCH_TIMEOUT", 12)
    cluster_window = _int_env("CLUSTER_WINDOW", 400)

    conn = db.get_connection()
    db.init_schema(conn)

    if job_id:
        db.create_job(conn, job_id)

    try:
        print("→ Ingesting feeds...")
        seen = db.existing_guids(conn)
        new_articles, stats = collect_new_articles(
            seen, max_full_fetch, fetch_timeout
        )
        inserted = db.insert_articles(conn, new_articles)
        print(
            f"  stored {inserted} new article(s); "
            f"fetched body text for {stats['bodies_fetched']}"
        )

        print("→ Clustering...")
        rows = db.fetch_articles_for_clustering(conn, cluster_window)
        clusters = cluster_articles(rows, threshold=threshold)
        db.replace_clusters(conn, clusters)
        multi = sum(1 for c in clusters if len(c["article_ids"]) > 1)
        print(
            f"  {len(clusters)} cluster(s) over {len(rows)} article(s) "
            f"({multi} multi-article)"
        )

        if job_id:
            db.finish_job(conn, job_id, inserted, len(clusters))
        return {"new_articles": inserted, "clusters": len(clusters)}
    except Exception as exc:
        if job_id:
            db.fail_job(conn, job_id, str(exc))
        raise
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="News Pulse ingestion pipeline")
    parser.add_argument(
        "--job-id",
        nargs="?",
        const=None,
        default=None,
        help="Optional job id to record run status in ingest_jobs.",
    )
    parser.add_argument(
        "--new-job-id",
        action="store_true",
        help="Generate a job id, print it, and track this run under it.",
    )
    args = parser.parse_args()

    job_id = args.job_id
    if args.new_job_id and not job_id:
        job_id = uuid.uuid4().hex
        print(f"job_id={job_id}")

    try:
        run(job_id=job_id)
    except Exception as exc:
        print(f"Pipeline failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
