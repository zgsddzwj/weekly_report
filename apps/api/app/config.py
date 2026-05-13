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

    def cors_origin_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
