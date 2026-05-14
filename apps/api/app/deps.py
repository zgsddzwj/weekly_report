from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Organization, OrganizationMembership, User
from app.security import decode_token

security = HTTPBearer(auto_error=False)


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
) -> User:
    if cred is None or cred.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    email = decode_token(cred.credentials)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


@dataclass(frozen=True)
class OrgContext:
    organization: Organization
    role: str


def get_org_context(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
    x_organization_id: Annotated[int | None, Header(alias="X-Organization-Id")] = None,
) -> OrgContext:
    q = (
        db.query(OrganizationMembership, Organization)
        .join(Organization, Organization.id == OrganizationMembership.organization_id)
        .filter(OrganizationMembership.user_id == user.id)
        .order_by(Organization.id.asc())
    )
    rows = q.all()
    if not rows:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No organization membership")
    if x_organization_id is not None:
        for m, org in rows:
            if org.id == x_organization_id:
                return OrgContext(organization=org, role=m.role)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of requested organization")
    m, org = rows[0]
    return OrgContext(organization=org, role=m.role)


OrgMember = Annotated[OrgContext, Depends(get_org_context)]


def org_requires_roles(*roles: str):
    """Usage: `ctx: Annotated[OrgContext, Depends(org_requires_roles("admin", "member"))]`."""

    def _dep(ctx: OrgContext = Depends(get_org_context)) -> OrgContext:
        if ctx.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient organization role")
        return ctx

    return _dep
