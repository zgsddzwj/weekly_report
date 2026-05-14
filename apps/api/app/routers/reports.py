from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser
from app.models import ReportProfile, ReportRun
from app.request_util import client_ip
from app.schemas import ReportRunCreate, ReportRunOut
from app.services.audit import record_audit_event
from app.tasks.report_tasks import generate_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("", response_model=list[ReportRunOut])
def list_reports(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    limit: int = 50,
) -> list[ReportRun]:
    return (
        db.query(ReportRun)
        .filter(ReportRun.user_id == user.id)
        .order_by(ReportRun.id.desc())
        .limit(min(limit, 200))
        .all()
    )


@router.post("", response_model=ReportRunOut, status_code=status.HTTP_202_ACCEPTED)
def enqueue_report(
    request: Request,
    payload: ReportRunCreate,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> ReportRun:
    profile = (
        db.query(ReportProfile)
        .filter(ReportProfile.id == payload.profile_id, ReportProfile.user_id == user.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    run = ReportRun(user_id=user.id, profile_id=profile.id, status="pending")
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
    return run


@router.get("/{run_id}", response_model=ReportRunOut)
def get_report(
    run_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> ReportRun:
    row = db.query(ReportRun).filter(ReportRun.id == run_id, ReportRun.user_id == user.id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row
