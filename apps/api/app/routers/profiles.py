from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser
from app.models import GitConnection, ReportProfile
from app.schemas import ReportProfileCreate, ReportProfileOut, ReportProfileUpdate, TemplatePresetOut
from app.template_presets import BUILTIN_TEMPLATE_BY_PRESET, TEMPLATE_PRESET_CATALOG

router = APIRouter(prefix="/report-profiles", tags=["profiles"])


def _get_owned_connection(db: Session, user_id: int, conn_id: int) -> GitConnection | None:
    return (
        db.query(GitConnection)
        .filter(GitConnection.id == conn_id, GitConnection.user_id == user_id)
        .first()
    )


def _merge_nested(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge_nested(out[k], v)
        else:
            out[k] = v
    return out


def _validate_style_dict(style: dict[str, Any]) -> None:
    mt = style.get("markdown_template")
    if mt is not None and not isinstance(mt, str):
        raise HTTPException(status_code=422, detail="markdown_template must be a string")
    tp = style.get("template_preset")
    if tp is None:
        return
    if not isinstance(tp, str) or tp not in BUILTIN_TEMPLATE_BY_PRESET:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid template_preset; allowed: {sorted(BUILTIN_TEMPLATE_BY_PRESET)}",
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
    _validate_style_dict(payload.style or {})
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


@router.get("/template-presets", response_model=list[TemplatePresetOut])
def list_template_presets(_user: CurrentUser) -> list[dict[str, str]]:
    """Must be registered before `/{profile_id}` so the path is not parsed as an integer id."""
    return TEMPLATE_PRESET_CATALOG


@router.patch("/{profile_id}", response_model=ReportProfileOut)
def patch_profile(
    profile_id: int,
    payload: ReportProfileUpdate,
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

    data = payload.model_dump(exclude_unset=True)
    if "git_connection_id" in data and data["git_connection_id"] is not None:
        if not _get_owned_connection(db, user.id, data["git_connection_id"]):
            raise HTTPException(status_code=400, detail="Invalid git_connection_id")
        row.git_connection_id = data["git_connection_id"]
    if "name" in data and data["name"] is not None:
        row.name = data["name"]
    if "repo_full_names" in data and data["repo_full_names"] is not None:
        row.repo_full_names = data["repo_full_names"]
    if "window_days" in data and data["window_days"] is not None:
        row.window_days = data["window_days"]
    if "filters" in data:
        if data["filters"] is None:
            row.filters = {}
        else:
            row.filters = _merge_nested(row.filters or {}, data["filters"])
    if "style" in data:
        if data["style"] is None:
            row.style = {}
        else:
            row.style = _merge_nested(row.style or {}, data["style"])
        _validate_style_dict(row.style or {})

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
