# Backend image that also bundles the Python scraper, so the live
# `POST /ingest/trigger` endpoint can shell out to the pipeline on the same
# host (Render / Railway / Fly.io). Build context is the repo root.

FROM node:20-slim

# Python + minimal build tools for the scraper.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Python scraper ---
COPY scraper/requirements.txt /app/scraper/requirements.txt
RUN python3 -m venv /app/scraper/venv \
    && /app/scraper/venv/bin/pip install --no-cache-dir -r /app/scraper/requirements.txt
COPY scraper /app/scraper

# --- Node backend ---
COPY backend/package*.json /app/backend/
WORKDIR /app/backend
RUN npm ci --omit=dev
COPY backend /app/backend

# The backend spawns the pipeline using these.
ENV PYTHON_BIN=/app/scraper/venv/bin/python \
    SCRAPER_DIR=/app/scraper \
    INGEST_ENABLED=true \
    NODE_ENV=production

# Render/Railway inject PORT; the app reads it (defaults to 4000 locally).
EXPOSE 4000
CMD ["node", "src/index.js"]
