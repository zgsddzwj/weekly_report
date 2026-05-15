from __future__ import annotations

import secrets
from datetime import datetime
from typing import Annotated, Any

from croniter import croniter
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, OrgContext, OrgMember, org_requires_roles
from app.models import GitConnection, ReportProfile
from app.request_util import client_ip
from app.schemas import ReportProfileCreate, ReportProfileOut, ReportProfileUpdate, TemplatePresetOut
from app.services.audit import record_audit_event
from app.template_presets import BUILTIN_TEMPLATE_BY_PRESET, TEMPLATE_PRESET_CATALOG
from app.token_vault import encrypt_token

router = APIRouter(prefix="/report-profiles", tags=["profiles"])


def _get_owned_connection(db: Session, user_id: int, org_id: int, conn_id: int) -> GitConnection | None:
    return (
        db.query(GitConnection)
        .filter(
            GitConnection.id == conn_id,
            GitConnection.user_id == user_id,
            GitConnection.organization_id == org_id,
        )
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


def _validate_cron(expr: str | None) -> None:
    if expr is None or expr.strip() == "":
        return
    try:
        croniter(expr, datetime.utcnow())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Invalid schedule_cron: {exc}") from exc


@router.get("/template-presets", response_model=list[TemplatePresetOut])
def list_template_presets(_user: CurrentUser) -> list[dict[str, str]]:
    """Registered before `/{profile_id}` so the path is not parsed as an integer id."""
    return TEMPLATE_PRESET_CATALOG


@router.get("", response_model=list[ReportProfileOut])
def list_profiles(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: OrgMember,
) -> list[ReportProfile]:
    return (
        db.query(ReportProfile)
        .filter(
            ReportProfile.user_id == user.id,
            ReportProfile.organization_id == ctx.organization.id,
        )
        .order_by(ReportProfile.id.desc())
        .all()
    )


@router.post("", response_model=ReportProfileOut)
def create_profile(
    request: Request,
    payload: ReportProfileCreate,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: Annotated[OrgContext, Depends(org_requires_roles("admin", "member"))],
) -> ReportProfile:
    if not _get_owned_connection(db, user.id, ctx.organization.id, payload.git_connection_id):
        raise HTTPException(status_code=400, detail="Invalid git_connection_id")
    _validate_style_dict(payload.style or {})
    _validate_cron(payload.schedule_cron)
    hook = secrets.token_hex(24)
    wh = encrypt_token(secrets.token_hex(32))
    row = ReportProfile(
        user_id=user.id,
        organization_id=ctx.organization.id,
        git_connection_id=payload.git_connection_id,
        name=payload.name,
        repo_full_names=payload.repo_full_names,
        window_days=payload.window_days,
        filters=payload.filters,
        style=payload.style,
        schedule_cron=payload.schedule_cron,
        schedule_enabled=payload.schedule_enabled,
        schedule_timezone=payload.schedule_timezone,
        hook_public_token=hook,
        webhook_hmac_secret_encrypted=wh,
        include_prs=payload.include_prs,
        diff_analysis_consent=payload.diff_analysis_consent,
        llm_generate=payload.llm_generate,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    record_audit_event(
        action="report_profile.created",
        user_id=user.id,
        entity_type="report_profile",
        entity_id=row.id,
        meta={"name": row.name, "organization_id": ctx.organization.id},
        client_ip=client_ip(request),
    )
    return row


@router.patch("/{profile_id}", response_model=ReportProfileOut)
def patch_profile(
    request: Request,
    profile_id: int,
    payload: ReportProfileUpdate,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: Annotated[OrgContext, Depends(org_requires_roles("admin", "member"))],
) -> ReportProfile:
    row = (
        db.query(ReportProfile)
        .filter(
            ReportProfile.id == profile_id,
            ReportProfile.user_id == user.id,
            ReportProfile.organization_id == ctx.organization.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    data = payload.model_dump(exclude_unset=True)
    if "git_connection_id" in data and data["git_connection_id"] is not None:
        if not _get_owned_connection(db, user.id, ctx.organization.id, data["git_connection_id"]):
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
    if "schedule_cron" in data:
        _validate_cron(data["schedule_cron"])
        row.schedule_cron = data["schedule_cron"]
    if "schedule_enabled" in data and data["schedule_enabled"] is not None:
        row.schedule_enabled = data["schedule_enabled"]
    if "schedule_timezone" in data and data["schedule_timezone"] is not None:
        row.schedule_timezone = data["schedule_timezone"]
    if "include_prs" in data and data["include_prs"] is not None:
        row.include_prs = data["include_prs"]
    if "diff_analysis_consent" in data and data["diff_analysis_consent"] is not None:
        row.diff_analysis_consent = data["diff_analysis_consent"]
    if "llm_generate" in data and data["llm_generate"] is not None:
        row.llm_generate = data["llm_generate"]

    db.commit()
    db.refresh(row)
    record_audit_event(
        action="report_profile.updated",
        user_id=user.id,
        entity_type="report_profile",
        entity_id=row.id,
        client_ip=client_ip(request),
    )
    return row


@router.get("/{profile_id}", response_model=ReportProfileOut)
def get_profile(
    profile_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: OrgMember,
) -> ReportProfile:
    row = (
        db.query(ReportProfile)
        .filter(
            ReportProfile.id == profile_id,
            ReportProfile.user_id == user.id,
            ReportProfile.organization_id == ctx.organization.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_profile(
    request: Request,
    profile_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: Annotated[OrgContext, Depends(org_requires_roles("admin", "member"))],
) -> None:
    row = (
        db.query(ReportProfile)
        .filter(
            ReportProfile.id == profile_id,
            ReportProfile.user_id == user.id,
            ReportProfile.organization_id == ctx.organization.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    record_audit_event(
        action="report_profile.deleted",
        user_id=user.id,
        entity_type="report_profile",
        entity_id=profile_id,
        client_ip=client_ip(request),
    )
