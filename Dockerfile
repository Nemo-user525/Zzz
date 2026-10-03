FROM node:22-bookworm-slim AS frontend
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app/backend PORT=8086 XRAY_DB_PATH=/app/storage/xray.sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ /app/backend/
COPY configs/ /app/configs/
COPY data/ /app/data/
COPY --from=frontend /build/dist/ /app/frontend/dist/
COPY deploy/entrypoint.py /app/deploy/entrypoint.py
RUN useradd --uid 10001 --create-home xray && mkdir -p /app/storage /app/data/models /app/data/raw /app/data/runtime \
    && chown -R xray:xray /app
# The entrypoint prepares a newly mounted cloud disk, then drops to uid 10001.
EXPOSE 8086
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8086')+'/api/health',timeout=4)"
CMD ["python", "deploy/entrypoint.py"]
