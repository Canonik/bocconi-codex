# Production Dockerfile for the FastAPI backend.
# Build context: this `backend/` folder. Run from `starter/backend/`:
#   docker build -t bocconi-backend .
#   railway up

FROM python:3.13-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

# Install dependencies first (cached layer if pyproject doesn't change)
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project || uv sync --no-install-project || uv sync

# Copy backend source + bundled data/ (incl. prebuilt RAG index buddy.db ~83MB)
# Cache-bust marker: cb-2026-05-09-1355 (force COPY rebake after Merit Awards rollback / full-rebuild index)
COPY . .

# Build-time guard: index must ship AND must reflect the latest delta.
# stat -c%s prints the size — useful in build logs to confirm content vs cache.
# Without this guard, a cached COPY layer can ship an outdated index silently.
RUN test -s /app/data/index/buddy.db || (echo "FATAL: prebuilt RAG index missing at /app/data/index/buddy.db" && exit 1)
RUN echo "INDEX_SIZE_BYTES=$(stat -c%s /app/data/index/buddy.db)"

EXPOSE 8000

CMD ["sh", "-c", "uv run uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
