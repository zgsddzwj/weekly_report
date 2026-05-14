from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import audit, auth, git_connections, health, metrics, oidc, organizations, profiles, public_hooks, reports

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api/v1"

app.include_router(metrics.router)
app.include_router(health.router, prefix=api_prefix)
app.include_router(audit.router, prefix=api_prefix)
app.include_router(auth.router, prefix=api_prefix)
app.include_router(oidc.router, prefix=api_prefix)
app.include_router(organizations.router, prefix=api_prefix)
app.include_router(git_connections.router, prefix=api_prefix)
app.include_router(profiles.router, prefix=api_prefix)
app.include_router(reports.router, prefix=api_prefix)
app.include_router(public_hooks.router, prefix=api_prefix)
