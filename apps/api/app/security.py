from datetime import timedelta

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_access_token(sub: str) -> str:
    s = get_settings()
    expire = timedelta(minutes=s.access_token_expire_minutes)
    from datetime import datetime, timezone

    payload = {"sub": sub, "exp": datetime.now(timezone.utc) + expire}
    return jwt.encode(payload, s.secret_key, algorithm=s.algorithm)


def decode_token(token: str) -> str | None:
    try:
        s = get_settings()
        data = jwt.decode(token, s.secret_key, algorithms=[s.algorithm])
        sub = data.get("sub")
        return str(sub) if sub else None
    except JWTError:
        return None
