from typing import Any

from app.database import SessionLocal
from app.models import AuditEvent


def record_audit_event(
    *,
    action: str,
    user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
    meta: dict[str, Any] | None = None,
    client_ip: str | None = None,
) -> None:
    """Append-only audit row in its own DB session (safe from caller transaction state)."""
    db = SessionLocal()
    try:
        db.add(
            AuditEvent(
                user_id=user_id,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                meta=meta or {},
                client_ip=(client_ip[:64] if client_ip else None),
            )
        )
        db.commit()
    finally:
        db.close()
