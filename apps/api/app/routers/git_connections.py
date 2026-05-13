from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser
from app.models import GitConnection
from app.schemas import GitConnectionCreate, GitConnectionOut
from app.token_vault import encrypt_token

router = APIRouter(prefix="/git-connections", tags=["git"])


@router.get("", response_model=list[GitConnectionOut])
def list_connections(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> list[GitConnection]:
    return (
        db.query(GitConnection)
        .filter(GitConnection.user_id == user.id)
        .order_by(GitConnection.id.desc())
        .all()
    )


@router.post("", response_model=GitConnectionOut)
def create_connection(
    payload: GitConnectionCreate,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> GitConnection:
    row = GitConnection(
        user_id=user.id,
        provider=payload.provider,
        base_url=payload.base_url.rstrip("/"),
        label=payload.label,
        token_encrypted=encrypt_token(payload.token),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{conn_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_connection(
    conn_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> None:
    row = (
        db.query(GitConnection)
        .filter(GitConnection.id == conn_id, GitConnection.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
