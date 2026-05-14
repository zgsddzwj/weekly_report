from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser, OrgContext, OrgMember, org_requires_roles
from app.models import GitConnection
from app.request_util import client_ip
from app.schemas import GitConnectionCreate, GitConnectionOut
from app.services.audit import record_audit_event
from app.token_vault import encrypt_token

router = APIRouter(prefix="/git-connections", tags=["git"])


@router.get("", response_model=list[GitConnectionOut])
def list_connections(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: OrgMember,
) -> list[GitConnection]:
    return (
        db.query(GitConnection)
        .filter(
            GitConnection.user_id == user.id,
            GitConnection.organization_id == ctx.organization.id,
        )
        .order_by(GitConnection.id.desc())
        .all()
    )


@router.post("", response_model=GitConnectionOut)
def create_connection(
    request: Request,
    payload: GitConnectionCreate,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: Annotated[OrgContext, Depends(org_requires_roles("admin", "member"))],
) -> GitConnection:
    row = GitConnection(
        user_id=user.id,
        organization_id=ctx.organization.id,
        provider=payload.provider,
        base_url=payload.base_url.rstrip("/"),
        label=payload.label,
        token_encrypted=encrypt_token(payload.token),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    record_audit_event(
        action="git_connection.created",
        user_id=user.id,
        entity_type="git_connection",
        entity_id=row.id,
        meta={"provider": row.provider, "label": row.label, "organization_id": ctx.organization.id},
        client_ip=client_ip(request),
    )
    return row


@router.delete("/{conn_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_connection(
    request: Request,
    conn_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    ctx: Annotated[OrgContext, Depends(org_requires_roles("admin", "member"))],
) -> None:
    row = (
        db.query(GitConnection)
        .filter(
            GitConnection.id == conn_id,
            GitConnection.user_id == user.id,
            GitConnection.organization_id == ctx.organization.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    record_audit_event(
        action="git_connection.deleted",
        user_id=user.id,
        entity_type="git_connection",
        entity_id=conn_id,
        client_ip=client_ip(request),
    )
