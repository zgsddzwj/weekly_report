from fastapi import APIRouter
from fastapi.responses import JSONResponse
from redis import Redis
from sqlalchemy import text

from app.config import get_settings
from app.database import engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
def ready() -> JSONResponse:
    """Liveness is `/health`; readiness checks PostgreSQL + Redis (architecture §8)."""
    settings = get_settings()
    postgres_ok = False
    redis_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        postgres_ok = True
    except Exception:
        postgres_ok = False
    try:
        Redis.from_url(settings.redis_url, socket_connect_timeout=2).ping()
        redis_ok = True
    except Exception:
        redis_ok = False

    ok = postgres_ok and redis_ok
    body: dict[str, object] = {
        "status": "ready" if ok else "not_ready",
        "checks": {"postgres": postgres_ok, "redis": redis_ok},
        "features": {
            "llm": settings.feature_llm,
            "external_telemetry": settings.feature_external_telemetry,
            "allow_public_oauth": settings.allow_public_oauth,
        },
    }
    return JSONResponse(status_code=200 if ok else 503, content=body)
