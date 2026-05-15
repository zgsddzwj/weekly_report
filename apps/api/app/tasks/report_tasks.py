import logging
from datetime import datetime
from typing import Any

from app.celery_app import celery_app
from app.config import get_settings
from app.database import SessionLocal
from app.models import GitConnection, ReportProfile, ReportRun
from app.plugins.pm import get_active_pm_plugin
from app.services.audit import record_audit_event
from app.services.git_client import fetch_commits_for_window, fetch_merged_prs_for_window, parse_repo_list
from app.services.integrations_notify import notify_from_style
from app.services.llm_generate import generate_report_with_llm
from app.services.llm_polish import polish_markdown_with_llm
from app.services.object_storage import upload_report_markdown
from app.services.report_builder import render_report_markdown
from app.token_vault import decrypt_token

log = logging.getLogger(__name__)


def _profile_snapshot(profile: ReportProfile, conn: GitConnection) -> dict[str, Any]:
    return {
        "profile_id": profile.id,
        "organization_id": profile.organization_id,
        "name": profile.name,
        "window_days": profile.window_days,
        "repo_full_names": profile.repo_full_names,
        "filters": profile.filters or {},
        "style": profile.style or {},
        "include_prs": profile.include_prs,
        "git_connection": {"id": conn.id, "provider": conn.provider, "base_url": conn.base_url, "label": conn.label},
    }


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

        run.profile_snapshot = _profile_snapshot(profile, conn)
        db.commit()

        token = decrypt_token(conn.token_encrypted)
        repos = parse_repo_list(profile.repo_full_names)
        commits = fetch_commits_for_window(
            conn,
            token,
            repos,
            profile.window_days,
            profile.filters or {},
        )
        prs: list[dict[str, Any]] = []
        if profile.include_prs:
            prs = fetch_merged_prs_for_window(conn, token, repos, profile.window_days, profile.filters or {})

        pm = get_active_pm_plugin()
        extra = pm.enrich_context(commits, profile.window_days)
        style = dict(profile.style or {})
        style["_pm_plugin"] = extra

        # Generation mode: LLM smart generate vs template render
        settings = get_settings()
        use_llm = profile.llm_generate and settings.feature_llm and settings.llm_base_url

        if use_llm:
            try:
                md = generate_report_with_llm(
                    commits=commits,
                    prs=prs,
                    profile_name=profile.name,
                    window_days=profile.window_days,
                    repos=repos,
                    style=style,
                )
                log.info("report.llm_generate_success run_id=%s", run.id)
                # LLM smart generate already produces high-quality output; skip polish
            except Exception as llm_exc:
                log.warning("report.llm_generate_failed_falling_back run_id=%s error=%s", run.id, llm_exc)
                md = render_report_markdown(
                    commits,
                    profile.name,
                    profile.window_days,
                    repos,
                    style,
                    prs=prs,
                )
                md = polish_markdown_with_llm(base_markdown=md, commits=commits)
        else:
            md = render_report_markdown(
                commits,
                profile.name,
                profile.window_days,
                repos,
                style,
                prs=prs,
            )
            md = polish_markdown_with_llm(base_markdown=md, commits=commits)

        settings = get_settings()
        storage = "inline"
        bucket: str | None = None
        key: str | None = None
        if (
            settings.s3_endpoint_url
            and settings.s3_bucket
            and settings.s3_access_key_id
            and settings.s3_secret_access_key
            and len(md.encode("utf-8")) >= settings.result_offload_min_bytes
        ):
            bucket, key = upload_report_markdown(run_id=run.id, markdown=md)
            storage = "s3"
            run.result_markdown = None
        else:
            run.result_markdown = md

        run.result_storage = storage
        run.result_s3_bucket = bucket
        run.result_s3_key = key
        run.status = "success"
        run.finished_at = datetime.utcnow()
        db.commit()

        notify_from_style(style, md if storage == "inline" else f"(stored in object storage {bucket}/{key})", run.id)

        record_audit_event(
            action="report_run.finished",
            user_id=run.user_id,
            entity_type="report_run",
            entity_id=run.id,
            meta={"status": "success", "storage": storage},
        )
        log.info("report.finished", extra={"run_id": run.id, "storage": storage})
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
        log.exception("report.failed", extra={"run_id": run_id})
    finally:
        db.close()
