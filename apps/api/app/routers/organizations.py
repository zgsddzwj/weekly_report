from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import CurrentUser
from app.models import Organization, OrganizationMembership
from app.schemas import OrganizationMemberOut

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("", response_model=list[OrganizationMemberOut])
def list_my_organizations(
    db: Annotated[Session, Depends(get_db)],
    user: CurrentUser,
) -> list[OrganizationMemberOut]:
    rows = (
        db.query(Organization, OrganizationMembership)
        .join(OrganizationMembership, OrganizationMembership.organization_id == Organization.id)
        .filter(OrganizationMembership.user_id == user.id)
        .order_by(Organization.id.asc())
        .all()
    )
    out: list[OrganizationMemberOut] = []
    for org, m in rows:
        out.append(
            OrganizationMemberOut(id=org.id, name=org.name, slug=org.slug, role=m.role),
        )
    return out
