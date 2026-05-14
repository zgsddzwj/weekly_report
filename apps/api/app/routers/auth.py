from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser
from app.models import User
from app.request_util import client_ip
from app.schemas import TokenResponse, UserCreate, UserOut
from app.security import create_access_token, hash_password, verify_password
from app.services.audit import record_audit_event

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut)
def register(request: Request, payload: UserCreate, db: Annotated[Session, Depends(get_db)]) -> User:
    if db.query(User).filter(User.email == str(payload.email)).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=str(payload.email), hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    record_audit_event(
        action="auth.register",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        meta={"email": str(user.email)},
        client_ip=client_ip(request),
    )
    return user


@router.post("/login", response_model=TokenResponse)
def login(request: Request, payload: UserCreate, db: Annotated[Session, Depends(get_db)]) -> TokenResponse:
    user = db.query(User).filter(User.email == str(payload.email)).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        record_audit_event(
            action="auth.login_failure",
            user_id=None,
            meta={"email": str(payload.email)},
            client_ip=client_ip(request),
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(str(user.email))
    record_audit_event(
        action="auth.login_success",
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        meta={"email": str(user.email)},
        client_ip=client_ip(request),
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user
