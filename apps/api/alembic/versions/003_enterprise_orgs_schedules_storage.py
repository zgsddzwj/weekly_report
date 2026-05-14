"""enterprise: organizations, schedules, run snapshots, object storage keys, OIDC fields

Revision ID: 003_enterprise
Revises: 002_audit
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision: str = "003_enterprise"
down_revision: str | None = "002_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=256), nullable=False),
        sa.Column("slug", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_organizations_slug"), "organizations", ["slug"], unique=True)

    op.create_table(
        "organization_memberships",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default=sa.text("'member'")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_membership_org_user"),
    )
    op.create_index("ix_org_memberships_user_id", "organization_memberships", ["user_id"], unique=False)

    op.add_column("users", sa.Column("auth_provider", sa.String(length=32), server_default=sa.text("'local'"), nullable=False))
    op.add_column("users", sa.Column("oidc_sub", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("oidc_issuer", sa.String(length=512), nullable=True))
    op.create_index("ix_users_oidc_issuer_sub", "users", ["oidc_issuer", "oidc_sub"], unique=True)

    op.add_column("git_connections", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_git_connections_organization_id",
        "git_connections",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.add_column("report_profiles", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("report_profiles", sa.Column("schedule_cron", sa.String(length=128), nullable=True))
    op.add_column("report_profiles", sa.Column("schedule_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column(
        "report_profiles",
        sa.Column("schedule_timezone", sa.String(length=64), server_default=sa.text("'UTC'"), nullable=False),
    )
    op.add_column("report_profiles", sa.Column("webhook_hmac_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("report_profiles", sa.Column("include_prs", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("report_profiles", sa.Column("diff_analysis_consent", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("report_profiles", sa.Column("hook_public_token", sa.String(length=64), nullable=True))
    op.create_foreign_key(
        "fk_report_profiles_organization_id",
        "report_profiles",
        "organizations",
        ["organization_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_report_profiles_schedule", "report_profiles", ["schedule_enabled"], unique=False)

    op.add_column(
        "report_runs",
        sa.Column("profile_snapshot", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )
    op.add_column(
        "report_runs",
        sa.Column("trigger_source", sa.String(length=32), server_default=sa.text("'manual'"), nullable=False),
    )
    op.add_column(
        "report_runs",
        sa.Column("result_storage", sa.String(length=16), server_default=sa.text("'inline'"), nullable=False),
    )
    op.add_column("report_runs", sa.Column("result_s3_bucket", sa.String(length=256), nullable=True))
    op.add_column("report_runs", sa.Column("result_s3_key", sa.String(length=512), nullable=True))

    # Backfill: one organization per existing user
    conn = op.get_bind()
    users = conn.execute(text("SELECT id, email FROM users ORDER BY id")).fetchall()
    for uid, email in users:
        safe = "".join(c if c.isalnum() else "-" for c in email)[:64].strip("-") or f"user-{uid}"
        slug = f"org-{uid}-{safe}"[:120]
        org_id = conn.execute(
            text("INSERT INTO organizations (name, slug) VALUES (:name, :slug) RETURNING id"),
            {"name": f"{email} — workspace", "slug": slug},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO organization_memberships (organization_id, user_id, role) "
                "VALUES (:oid, :uid, 'admin')"
            ),
            {"oid": org_id, "uid": uid},
        )
        conn.execute(
            text("UPDATE git_connections SET organization_id = :oid WHERE user_id = :uid"),
            {"oid": org_id, "uid": uid},
        )
        conn.execute(
            text("UPDATE report_profiles SET organization_id = :oid WHERE user_id = :uid"),
            {"oid": org_id, "uid": uid},
        )

    import secrets

    from app.config import get_settings
    from app.crypto_util import fernet_from_key

    prof_rows = conn.execute(text("SELECT id FROM report_profiles")).fetchall()
    settings = get_settings()
    fernet = fernet_from_key(settings.encryption_key) if settings.encryption_key else None
    for (pid,) in prof_rows:
        tok = secrets.token_hex(24)
        wh_enc: str | None = None
        if fernet:
            wh_enc = fernet.encrypt(secrets.token_hex(32).encode()).decode()
        conn.execute(
            text(
                "UPDATE report_profiles SET hook_public_token = :t, "
                "webhook_hmac_secret_encrypted = COALESCE(:wh, webhook_hmac_secret_encrypted) "
                "WHERE id = :id"
            ),
            {"t": tok, "wh": wh_enc, "id": pid},
        )

    op.alter_column("report_profiles", "hook_public_token", nullable=False)
    op.create_index("ix_report_profiles_hook_public_token", "report_profiles", ["hook_public_token"], unique=True)
    op.alter_column("git_connections", "organization_id", nullable=False)
    op.alter_column("report_profiles", "organization_id", nullable=False)


def downgrade() -> None:
    op.drop_constraint("fk_report_profiles_organization_id", "report_profiles", type_="foreignkey")
    op.drop_index("ix_report_profiles_hook_public_token", table_name="report_profiles")
    op.drop_index("ix_report_profiles_schedule", table_name="report_profiles")
    op.drop_column("report_profiles", "hook_public_token")
    op.drop_column("report_profiles", "diff_analysis_consent")
    op.drop_column("report_profiles", "include_prs")
    op.drop_column("report_profiles", "webhook_hmac_secret_encrypted")
    op.drop_column("report_profiles", "schedule_timezone")
    op.drop_column("report_profiles", "schedule_enabled")
    op.drop_column("report_profiles", "schedule_cron")
    op.drop_column("report_profiles", "organization_id")

    op.drop_constraint("fk_git_connections_organization_id", "git_connections", type_="foreignkey")
    op.drop_column("git_connections", "organization_id")

    op.drop_column("report_runs", "result_s3_key")
    op.drop_column("report_runs", "result_s3_bucket")
    op.drop_column("report_runs", "result_storage")
    op.drop_column("report_runs", "trigger_source")
    op.drop_column("report_runs", "profile_snapshot")

    op.drop_index("ix_users_oidc_issuer_sub", table_name="users")
    op.drop_column("users", "oidc_issuer")
    op.drop_column("users", "oidc_sub")
    op.drop_column("users", "auth_provider")

    op.drop_index("ix_org_memberships_user_id", table_name="organization_memberships")
    op.drop_table("organization_memberships")
    op.drop_index(op.f("ix_organizations_slug"), table_name="organizations")
    op.drop_table("organizations")
