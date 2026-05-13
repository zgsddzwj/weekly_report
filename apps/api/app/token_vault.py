from app.config import get_settings
from app.crypto_util import fernet_from_key


def encrypt_token(plain: str) -> str:
    key = get_settings().encryption_key
    if not key:
        raise RuntimeError("ENCRYPTION_KEY is required to store Git tokens")
    return fernet_from_key(key).encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_token(blob: str) -> str:
    key = get_settings().encryption_key
    if not key:
        raise RuntimeError("ENCRYPTION_KEY is required")
    return fernet_from_key(key).decrypt(blob.encode("utf-8")).decode("utf-8")
