FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.6.14 /uv /bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-cache

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app

ENV PATH="/app/.venv/bin:$PATH"
ENV VIRTUAL_ENV=/app/.venv

COPY docker-entrypoint-api.sh /docker-entrypoint-api.sh
RUN chmod +x /docker-entrypoint-api.sh

EXPOSE 8000

ENTRYPOINT ["/docker-entrypoint-api.sh"]
