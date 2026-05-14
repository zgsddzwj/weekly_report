from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256))
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_org_membership_org_user"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    organization: Mapped["Organization"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    auth_provider: Mapped[str] = mapped_column(String(32), default="local")
    oidc_sub: Mapped[str | None] = mapped_column(String(255), nullable=True)
    oidc_issuer: Mapped[str | None] = mapped_column(String(512), nullable=True)

    git_connections: Mapped[list["GitConnection"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    report_profiles: Mapped[list["ReportProfile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(128))
    entity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    client_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class GitConnection(Base):
    __tablename__ = "git_connections"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(32))
    base_url: Mapped[str] = mapped_column(String(512))
    label: Mapped[str] = mapped_column(String(128))
    token_encrypted: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="git_connections")
    organization: Mapped["Organization"] = relationship()


class ReportProfile(Base):
    __tablename__ = "report_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"))
    git_connection_id: Mapped[int] = mapped_column(ForeignKey("git_connections.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(128))
    repo_full_names: Mapped[str] = mapped_column(Text)
    window_days: Mapped[int] = mapped_column(default=7)
    filters: Mapped[dict] = mapped_column(JSONB, default=dict)
    style: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    schedule_cron: Mapped[str | None] = mapped_column(String(128), nullable=True)
    schedule_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    schedule_timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    webhook_hmac_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    hook_public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    include_prs: Mapped[bool] = mapped_column(Boolean, default=False)
    diff_analysis_consent: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="report_profiles")
    git_connection: Mapped["GitConnection"] = relationship()
    organization: Mapped["Organization"] = relationship()


class ReportRun(Base):
    __tablename__ = "report_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    profile_id: Mapped[int] = mapped_column(ForeignKey("report_profiles.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    celery_task_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    result_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    profile_snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)
    trigger_source: Mapped[str] = mapped_column(String(32), default="manual")
    result_storage: Mapped[str] = mapped_column(String(16), default="inline")
    result_s3_bucket: Mapped[str | None] = mapped_column(String(256), nullable=True)
    result_s3_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
