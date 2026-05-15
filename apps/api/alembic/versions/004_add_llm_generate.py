"""add llm_generate to report_profiles

Revision ID: 004_llm_generate
Revises: 003_enterprise
Create Date: 2026-05-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "004_llm_generate"
down_revision: str | None = "003_enterprise"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "report_profiles",
        sa.Column("llm_generate", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("report_profiles", "llm_generate")
