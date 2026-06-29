"""Feed registry.

Each source has a stable `key` (used for the frontend source filter), a
human-readable `name`, and a public RSS URL. Add or remove sources here only;
the rest of the pipeline is feed-agnostic.
"""

FEEDS = [
    {
        "key": "bbc",
        "name": "BBC News",
        "url": "http://feeds.bbci.co.uk/news/rss.xml",
    },
    {
        "key": "npr",
        "name": "NPR",
        "url": "https://feeds.npr.org/1001/rss.xml",
    },
    {
        "key": "guardian",
        "name": "The Guardian",
        "url": "https://www.theguardian.com/world/rss",
    },
    {
        "key": "aljazeera",
        "name": "Al Jazeera",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
    },
]
