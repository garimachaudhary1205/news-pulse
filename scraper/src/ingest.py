"""RSS ingestion: pull entries from each feed, normalize them into one internal
schema, and (for new articles) fetch the full body text from the article page.

Design notes:
- Feeds disagree on field names and date formats. feedparser smooths a lot of
  this over, but we still defensively pull from several possible fields and
  normalize dates to timezone-aware UTC.
- Content extraction is best-effort: a page that fails to fetch or parse must
  never crash the run. We fall back to the RSS summary.
"""

import html
import re
from datetime import datetime, timezone

import feedparser
import requests
import trafilatura
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

from .feeds import FEEDS

USER_AGENT = (
    "Mozilla/5.0 (compatible; NewsPulseBot/1.0; +https://example.com/newspulse)"
)
_TAG_RE = re.compile(r"<[^>]+>")


def _clean_text(value):
    """Strip HTML tags / entities and collapse whitespace from a summary blob."""
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_date(entry):
    """Return a timezone-aware UTC datetime, or None if unparseable.

    Tries feedparser's pre-parsed struct first, then falls back to fuzzy
    parsing of the raw string fields different outlets use.
    """
    for attr in ("published_parsed", "updated_parsed"):
        struct = entry.get(attr)
        if struct:
            return datetime(*struct[:6], tzinfo=timezone.utc)
    for attr in ("published", "updated", "pubDate", "date"):
        raw = entry.get(attr)
        if raw:
            try:
                dt = dateparser.parse(raw)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except (ValueError, OverflowError, TypeError):
                continue
    return None


def _extract_summary(entry):
    """Pull a plain-text summary, trying the several fields feeds disagree on."""
    candidates = []
    if entry.get("summary"):
        candidates.append(entry["summary"])
    for content in entry.get("content", []) or []:
        if content.get("value"):
            candidates.append(content["value"])
    if entry.get("description"):
        candidates.append(entry["description"])
    # Pick the longest candidate after cleaning — usually the richest one.
    cleaned = [_clean_text(c) for c in candidates]
    cleaned = [c for c in cleaned if c]
    return max(cleaned, key=len) if cleaned else ""


def parse_feed(source):
    """Parse one feed into a list of normalized article dicts (no body yet)."""
    parsed = feedparser.parse(source["url"])
    articles = []
    for entry in parsed.entries:
        link = entry.get("link") or ""
        guid = entry.get("id") or link
        title = _clean_text(entry.get("title", ""))
        if not guid or not title:
            continue  # unusable entry, skip rather than store garbage
        articles.append(
            {
                "guid": guid,
                "url": link,
                "source_key": source["key"],
                "source_name": source["name"],
                "title": title,
                "summary": _extract_summary(entry),
                "content": "",  # filled in later for new articles only
                "published_at": _parse_date(entry),
            }
        )
    return articles


def fetch_full_text(url, timeout):
    """Best-effort fetch of the main article body. Returns "" on any failure."""
    try:
        resp = requests.get(
            url, timeout=timeout, headers={"User-Agent": USER_AGENT}
        )
        resp.raise_for_status()
    except requests.RequestException:
        return ""

    # trafilatura is the primary extractor; it handles most news layouts well.
    try:
        extracted = trafilatura.extract(
            resp.text, include_comments=False, include_tables=False
        )
        if extracted and len(extracted) > 200:
            return extracted.strip()
    except Exception:
        pass

    # Fallback: dump paragraph text via BeautifulSoup.
    try:
        soup = BeautifulSoup(resp.text, "html.parser")
        paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
        body = " ".join(p for p in paragraphs if len(p) > 40)
        return body.strip()
    except Exception:
        return ""


def collect_new_articles(existing_guids, max_full_fetch, fetch_timeout):
    """Parse every feed, drop already-seen guids, and enrich new ones with body
    text (up to `max_full_fetch` to stay polite and fast).

    Returns (new_articles, stats) where stats summarizes the run for logging.
    """
    seen = set(existing_guids)
    new_articles = []
    per_source = {}

    for source in FEEDS:
        try:
            parsed = parse_feed(source)
        except Exception as exc:  # a single broken feed shouldn't kill the run
            print(f"  ! feed failed: {source['name']}: {exc}")
            parsed = []
        kept = 0
        for art in parsed:
            if art["guid"] in seen:
                continue
            seen.add(art["guid"])
            new_articles.append(art)
            kept += 1
        per_source[source["name"]] = kept
        print(f"  {source['name']}: {kept} new")

    # Enrich newest-first so a low cap still grabs the most relevant stories.
    new_articles.sort(
        key=lambda a: a["published_at"] or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    fetched_bodies = 0
    for art in new_articles[:max_full_fetch]:
        if art["url"]:
            body = fetch_full_text(art["url"], fetch_timeout)
            if body:
                art["content"] = body
                fetched_bodies += 1

    stats = {
        "new_total": len(new_articles),
        "bodies_fetched": fetched_bodies,
        "per_source": per_source,
    }
    return new_articles, stats
