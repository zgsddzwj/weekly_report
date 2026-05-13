import base64
import os

from cryptography.fernet import Fernet


def fernet_from_key(key: str) -> Fernet:
    raw = key.encode("utf-8")
    if len(raw) == 44 and raw.endswith(b"="):
        return Fernet(raw)
    digest = base64.urlsafe_b64encode(raw.ljust(32)[:32])
    return Fernet(digest)


def generate_fernet_key() -> str:
    return Fernet.generate_key().decode("utf-8")


def ensure_encryption_key(env_key: str | None) -> str:
    if env_key:
        return env_key
    return generate_fernet_key()
