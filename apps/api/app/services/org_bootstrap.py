from sqlalchemy.orm import Session

from app.models import Organization, OrganizationMembership, User


def create_default_organization_for_user(db: Session, user: User) -> Organization:
    safe = "".join(c if c.isalnum() else "-" for c in user.email)[:64].strip("-") or f"user-{user.id}"
    slug = f"org-{user.id}-{safe}"[:120]
    org = Organization(name=f"{user.email} — workspace", slug=slug)
    db.add(org)
    db.flush()
    db.add(OrganizationMembership(organization_id=org.id, user_id=user.id, role="admin"))
    return org
