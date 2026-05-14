"""Cron-driven report enqueue (architecture §2.2 Beat + §6.3)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from croniter import croniter
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import ReportProfile, ReportRun
from app.tasks.report_tasks import generate_report

log = logging.getLogger(__name__)


def _recent_schedule_run_exists(db: Session, profile_id: int, within_seconds: int = 120) -> bool:
    since = datetime.now(timezone.utc) - timedelta(seconds=within_seconds)
    q = (
        db.query(ReportRun)
        .filter(
            ReportRun.profile_id == profile_id,
            ReportRun.trigger_source == "schedule",
            ReportRun.created_at >= since,
        )
        .first()
    )
    return q is not None


@celery_app.task(name="reports.schedule_tick")
def tick_scheduled_reports() -> int:
    """Invoked every minute by Celery Beat; returns number of runs enqueued."""
    db = SessionLocal()
    enqueued = 0
    try:
        profiles = (
            db.query(ReportProfile)
            .filter(ReportProfile.schedule_enabled.is_(True), ReportProfile.schedule_cron.isnot(None))
            .all()
        )
        for profile in profiles:
            try:
                tz_name = profile.schedule_timezone or "UTC"
                try:
                    from zoneinfo import ZoneInfo

                    tz = ZoneInfo(tz_name)
                except Exception:
                    tz = timezone.utc
                local_now = datetime.now(tz)
                itr = croniter(profile.schedule_cron, local_now)
                prev_fire = itr.get_prev(datetime)
                delta = (local_now - prev_fire).total_seconds()
                if not (0 <= delta < 300):
                    continue
                if _recent_schedule_run_exists(db, profile.id):
                    continue
                run = ReportRun(
                    user_id=profile.user_id,
                    profile_id=profile.id,
                    status="pending",
                    trigger_source="schedule",
                )
                db.add(run)
                db.commit()
                db.refresh(run)
                generate_report.delay(run.id)
                enqueued += 1
                log.info("schedule.enqueued", profile_id=profile.id, run_id=run.id)
            except Exception as exc:  # noqa: BLE001
                log.warning("schedule.profile_skipped", profile_id=profile.id, error=str(exc))
                db.rollback()
        return enqueued
    finally:
        db.close()
