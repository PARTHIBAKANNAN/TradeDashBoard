# Optional container image for TradeDashboard (primary deploy path is venv+systemd; see deploy/README.md).
# Multi-stage: build the React app, then run the FastAPI BFF serving it same-origin.
# Works on both amd64 and arm64 (Oracle Ampere).

# ---- Stage 1: build frontend ----
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: runtime ----
FROM python:3.13-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    FRONTEND_DIST=/app/frontend/dist \
    TOKEN_CACHE_FILE=/data/.token_cache.json

# tzdata so IST-based scheduling is correct on a UTC host.
RUN apt-get update && apt-get install -y --no-install-recommends tzdata && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./
# pip-system-certs is marked win32-only in requirements.txt, so it is skipped here.
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir --no-deps fyers-apiv3==3.1.14 \
 && pip install --no-cache-dir "aiohttp>=3.10" websocket-client aws-lambda-powertools "setuptools<81"

COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist

VOLUME ["/data"]
EXPOSE 8000
# Single instance only (one FYERS websocket per app). Do NOT scale replicas.
CMD ["python", "run.py"]
