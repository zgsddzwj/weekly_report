from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    git_connections: Mapped[list["GitConnection"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    report_profiles: Mapped[list["ReportProfile"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class GitConnection(Base):
    __tablename__ = "git_connections"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(32))
    base_url: Mapped[str] = mapped_column(String(512))
    label: Mapped[str] = mapped_column(String(128))
    token_encrypted: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="git_connections")


class ReportProfile(Base):
    __tablename__ = "report_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    git_connection_id: Mapped[int] = mapped_column(ForeignKey("git_connections.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(128))
    repo_full_names: Mapped[str] = mapped_column(Text)
    window_days: Mapped[int] = mapped_column(default=7)
    filters: Mapped[dict] = mapped_column(JSONB, default=dict)
    style: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="report_profiles")
    git_connection: Mapped["GitConnection"] = relationship()


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
