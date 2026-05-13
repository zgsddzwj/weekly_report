from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser
from app.models import GitConnection, ReportProfile
from app.schemas import ReportProfileCreate, ReportProfileOut

router = APIRouter(prefix="/report-profiles", tags=["profiles"])


def _get_owned_connection(db: Session, user_id: int, conn_id: int) -> GitConnection | None:
    return (
        db.query(GitConnection)
        .filter(GitConnection.id == conn_id, GitConnection.user_id == user_id)
        .first()
    )


@router.get("", response_model=list[ReportProfileOut])
def list_profiles(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> list[ReportProfile]:
    return (
        db.query(ReportProfile)
        .filter(ReportProfile.user_id == user.id)
        .order_by(ReportProfile.id.desc())
        .all()
    )


@router.post("", response_model=ReportProfileOut)
def create_profile(
    payload: ReportProfileCreate,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> ReportProfile:
    if not _get_owned_connection(db, user.id, payload.git_connection_id):
        raise HTTPException(status_code=400, detail="Invalid git_connection_id")
    row = ReportProfile(
        user_id=user.id,
        git_connection_id=payload.git_connection_id,
        name=payload.name,
        repo_full_names=payload.repo_full_names,
        window_days=payload.window_days,
        filters=payload.filters,
        style=payload.style,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{profile_id}", response_model=ReportProfileOut)
def get_profile(
    profile_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> ReportProfile:
    row = (
        db.query(ReportProfile)
        .filter(ReportProfile.id == profile_id, ReportProfile.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    profile_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> None:
    row = (
        db.query(ReportProfile)
        .filter(ReportProfile.id == profile_id, ReportProfile.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
