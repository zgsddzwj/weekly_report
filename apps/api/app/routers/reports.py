from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.deps import CurrentUser, OrgMember
from app.models import ReportProfile, ReportRun
from app.request_util import client_ip
from app.schemas import ReportRunCreate, ReportRunOut
from app.services.audit import record_audit_event
from app.services.object_storage import download_report_markdown
from app.tasks.report_tasks import generate_report

router = APIRouter(prefix="/reports", tags=["reports"])


def _materialize_markdown(row: ReportRun) -> str | None:
    if row.result_storage == "s3" and row.result_s3_bucket and row.result_s3_key:
        try:
            return download_report_markdown(bucket=row.result_s3_bucket, key=row.result_s3_key)
        except Exception:
            return None
    return row.result_markdown


def _to_run_out(row: ReportRun) -> ReportRunOut:
    base = ReportRunOut.model_validate(row, from_attributes=True)
    if row.result_storage == "s3":
        return base.model_copy(update={"result_markdown": _materialize_markdown(row)})
    return base


@router.get("", response_model=list[ReportRunOut])
def list_reports(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: OrgMember,
    limit: int = 50,
) -> list[ReportRunOut]:
    rows = (
        db.query(ReportRun)
        .join(ReportProfile, ReportProfile.id == ReportRun.profile_id)
        .filter(ReportRun.user_id == user.id, ReportProfile.organization_id == ctx.organization.id)
        .order_by(ReportRun.id.desc())
        .limit(min(limit, 200))
        .all()
    )
    return [_to_run_out(r) for r in rows]


@router.post("", response_model=ReportRunOut, status_code=status.HTTP_202_ACCEPTED)
def enqueue_report(
    request: Request,
    payload: ReportRunCreate,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: OrgMember,
) -> ReportRunOut:
    profile = (
        db.query(ReportProfile)
        .filter(
            ReportProfile.id == payload.profile_id,
            ReportProfile.user_id == user.id,
            ReportProfile.organization_id == ctx.organization.id,
        )
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    run = ReportRun(
        user_id=user.id,
        profile_id=profile.id,
        status="pending",
        trigger_source=payload.trigger_source,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    async_result = generate_report.delay(run.id)
    run.celery_task_id = async_result.id
    db.commit()
    db.refresh(run)
    record_audit_event(
        action="report_run.enqueued",
        user_id=user.id,
        entity_type="report_run",
        entity_id=run.id,
        meta={"profile_id": profile.id, "celery_task_id": async_result.id},
        client_ip=client_ip(request),
    )
    return _to_run_out(run)


@router.get("/{run_id}/events")
async def report_events(
    run_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: OrgMember,
) -> StreamingResponse:
    """Server-Sent Events stream for run status (architecture §5)."""

    async def gen() -> str:
        last = ""
        for _ in range(600):
            s = SessionLocal()
            try:
                row = (
                    s.query(ReportRun)
                    .join(ReportProfile, ReportProfile.id == ReportRun.profile_id)
                    .filter(
                        ReportRun.id == run_id,
                        ReportRun.user_id == user.id,
                        ReportProfile.organization_id == ctx.organization.id,
                    )
                    .first()
                )
            finally:
                s.close()
            if not row:
                yield "event: error\ndata: not found\n\n"
                return
            payload: dict[str, Any] = {"status": row.status, "id": row.id}
            if row.status == "success":
                payload["result_markdown"] = _materialize_markdown(row)
            elif row.status == "failed":
                payload["error_message"] = row.error_message
            blob = json.dumps(payload, ensure_ascii=False)
            if blob != last:
                yield f"data: {blob}\n\n"
                last = blob
            if row.status in ("success", "failed"):
                yield f"event: complete\ndata: {blob}\n\n"
                return
            await asyncio.sleep(1)

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/{run_id}", response_model=ReportRunOut)
def get_report(
    run_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: OrgMember,
) -> ReportRunOut:
    row = (
        db.query(ReportRun)
        .join(ReportProfile, ReportProfile.id == ReportRun.profile_id)
        .filter(
            ReportRun.id == run_id,
            ReportRun.user_id == user.id,
            ReportProfile.organization_id == ctx.organization.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return _to_run_out(row)
