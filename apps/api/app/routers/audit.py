from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser
from app.models import AuditEvent
from app.schemas import AuditEventOut

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("", response_model=list[AuditEventOut])
def list_my_audit_events(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    limit: int = 100,
) -> list[AuditEvent]:
    return (
        db.query(AuditEvent)
        .filter(AuditEvent.user_id == user.id)
        .order_by(AuditEvent.id.desc())
        .limit(min(limit, 500))
        .all()
    )
