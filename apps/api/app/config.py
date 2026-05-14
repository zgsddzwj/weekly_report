from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Week Report"
    secret_key: str = "change-me-in-production-use-openssl-rand-hex-32"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    database_url: str = "postgresql+psycopg://weekreport:weekreport@localhost:5432/weekreport"

    redis_url: str = "redis://localhost:6379/0"

    encryption_key: str = ""  # Fernet key; generated in docker entrypoint if empty

    # Comma-separated origins (env-friendly for Docker)
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    # Architecture §3.4 feature flags (safe defaults for private deployments)
    feature_llm: bool = False
    feature_external_telemetry: bool = False
    allow_public_oauth: bool = True

    # Optional S3-compatible object storage (MinIO / AWS) for large Markdown offload
    s3_endpoint_url: str | None = None
    s3_bucket: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_region: str = "us-east-1"
    s3_use_path_style: bool = True
    result_offload_min_bytes: int = 262_144  # 256 KiB

    # OpenAI-compatible LLM (vLLM / Ollama / gateway) — only used when FEATURE_LLM=true
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: int = 120

    # Generic OIDC login (Authlib) — set OIDC_ISSUER + client + redirect to enable
    oidc_enabled: bool = False
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: str | None = None

    # Public URL of the web app (scheme + host + optional port) for SPA links / OIDC landing
    public_app_url: str = "http://localhost:8080"
    # Browser-reachable API URL for OIDC redirect_uri (often the API origin, not the SPA)
    api_public_url: str = "http://localhost:8000"
    oidc_redirect_uri_override: str | None = None

    # Optional outbound telemetry batch URL (never enabled without explicit endpoint + flag)
    telemetry_ingest_url: str | None = None

    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
