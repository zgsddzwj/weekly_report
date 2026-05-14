"""Unsigned-safe webhook path uses hook token + HMAC (architecture §6.3)."""

from __future__ import annotations

import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ReportProfile, ReportRun
from app.request_util import client_ip
from app.services.audit import record_audit_event
from app.tasks.report_tasks import generate_report
from app.token_vault import decrypt_token

router = APIRouter(prefix="/public", tags=["public"])


def _verify_hmac(body: bytes, secret: str, sig_header: str | None) -> bool:
    if not sig_header:
        return False
    expected = "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig_header.strip(), expected)


@router.post("/hooks/report-profiles/{hook_token}/runs", status_code=status.HTTP_202_ACCEPTED)
async def webhook_enqueue_report(
    request: Request,
    hook_token: str,
    db: Session = Depends(get_db),
) -> dict[str, int]:
    body = await request.body()
    profile = db.query(ReportProfile).filter(ReportProfile.hook_public_token == hook_token).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Unknown hook token")

    if profile.webhook_hmac_secret_encrypted:
        secret = decrypt_token(profile.webhook_hmac_secret_encrypted)
        sig = request.headers.get("X-WeekReport-Signature") or request.headers.get("X-Hub-Signature-256")
        if not _verify_hmac(body, secret, sig):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    run = ReportRun(
        user_id=profile.user_id,
        profile_id=profile.id,
        status="pending",
        trigger_source="webhook",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    async_result = generate_report.delay(run.id)
    run.celery_task_id = async_result.id
    db.commit()
    record_audit_event(
        action="report_run.enqueued",
        user_id=profile.user_id,
        entity_type="report_run",
        entity_id=run.id,
        meta={"profile_id": profile.id, "via": "webhook"},
        client_ip=client_ip(request),
    )
    return {"report_run_id": run.id}
