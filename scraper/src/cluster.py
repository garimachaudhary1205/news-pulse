"""Topic clustering with TF-IDF + cosine similarity.

Approach (kept deliberately transparent so it's easy to explain):
1. Build a TF-IDF matrix over each article's text (title is weighted by
   repetition since the headline is the strongest topic signal).
2. Compute pairwise cosine similarity.
3. Link any two articles whose similarity >= threshold, then take the
   connected components via union-find. Each component is a cluster.
4. Label each cluster by its top aggregated TF-IDF terms.

Union-find (rather than KMeans) means we don't have to pick a cluster count up
front, and naturally-singleton stories stay as their own one-article cluster.
"""

from datetime import timezone

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


class _UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra


def _doc_text(article):
    """Title (doubled to weight it) + summary + body. Body is truncated so one
    very long article doesn't dominate the vocabulary."""
    title = article["title"] or ""
    summary = article["summary"] or ""
    content = (article["content"] or "")[:2000]
    return f"{title} {title} {summary} {content}"


def cluster_articles(articles, threshold=0.30):
    """Cluster a list of article rows (dicts with id/title/summary/content/
    published_at). Returns a list of cluster dicts ready for db.replace_clusters.
    """
    if not articles:
        return []

    docs = [_doc_text(a) for a in articles]

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.85,
        sublinear_tf=True,
    )
    matrix = vectorizer.fit_transform(docs)
    terms = np.array(vectorizer.get_feature_names_out())

    # Link articles above the similarity threshold.
    sim = cosine_similarity(matrix)
    n = len(articles)
    uf = _UnionFind(n)
    for i in range(n):
        for j in range(i + 1, n):
            if sim[i, j] >= threshold:
                uf.union(i, j)

    groups = {}
    for idx in range(n):
        groups.setdefault(uf.find(idx), []).append(idx)

    clusters = []
    for member_idxs in groups.values():
        clusters.append(_build_cluster(member_idxs, articles, matrix, terms))

    # Biggest, most active clusters first.
    clusters.sort(key=lambda c: len(c["article_ids"]), reverse=True)
    return clusters


def _build_cluster(member_idxs, articles, matrix, terms):
    members = [articles[i] for i in member_idxs]

    # Label = top aggregated TF-IDF terms across the cluster's documents.
    summed = np.asarray(matrix[member_idxs].sum(axis=0)).ravel()
    top_idx = summed.argsort()[::-1][:3]
    top_terms = [terms[i] for i in top_idx if summed[i] > 0]
    label = _make_label(top_terms, members)

    dates = [m["published_at"] for m in members if m["published_at"]]
    start_time = min(dates) if dates else None
    end_time = max(dates) if dates else None

    return {
        "label": label,
        "top_terms": top_terms,
        "article_ids": [m["id"] for m in members],
        "start_time": start_time,
        "end_time": end_time,
    }


def _make_label(top_terms, members):
    """Title-case the top terms into a readable label; fall back to the headline
    of a single-article cluster."""
    if top_terms:
        return " · ".join(t.title() for t in top_terms)
    if members:
        title = members[0]["title"]
        return title[:60] + ("…" if len(title) > 60 else "")
    return "Untitled"
