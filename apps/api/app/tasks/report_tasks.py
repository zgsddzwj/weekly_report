from datetime import datetime

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models import GitConnection, ReportProfile, ReportRun
from app.services.audit import record_audit_event
from app.services.git_client import fetch_commits_for_window, parse_repo_list
from app.services.report_builder import render_report_markdown
from app.token_vault import decrypt_token


@celery_app.task(name="reports.generate")
def generate_report(run_id: int) -> None:
    db = SessionLocal()
    run: ReportRun | None = None
    try:
        run = db.query(ReportRun).filter(ReportRun.id == run_id).first()
        if not run:
            return
        run.status = "running"
        db.commit()

        profile = db.query(ReportProfile).filter(ReportProfile.id == run.profile_id).first()
        if not profile:
            raise RuntimeError("Profile not found")
        conn = db.query(GitConnection).filter(GitConnection.id == profile.git_connection_id).first()
        if not conn:
            raise RuntimeError("Git connection not found")

        token = decrypt_token(conn.token_encrypted)
        repos = parse_repo_list(profile.repo_full_names)
        commits = fetch_commits_for_window(
            conn,
            token,
            repos,
            profile.window_days,
            profile.filters or {},
        )
        md = render_report_markdown(
            commits,
            profile.name,
            profile.window_days,
            repos,
            profile.style or {},
        )
        run.result_markdown = md
        run.status = "success"
        run.finished_at = datetime.utcnow()
        db.commit()
        record_audit_event(
            action="report_run.finished",
            user_id=run.user_id,
            entity_type="report_run",
            entity_id=run.id,
            meta={"status": "success"},
        )
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run = db.query(ReportRun).filter(ReportRun.id == run_id).first()
        if run:
            run.status = "failed"
            run.error_message = str(exc)[:8000]
            run.finished_at = datetime.utcnow()
            db.commit()
            record_audit_event(
                action="report_run.finished",
                user_id=run.user_id,
                entity_type="report_run",
                entity_id=run.id,
                meta={"status": "failed", "error": run.error_message[:500] if run.error_message else ""},
            )
    finally:
        db.close()
