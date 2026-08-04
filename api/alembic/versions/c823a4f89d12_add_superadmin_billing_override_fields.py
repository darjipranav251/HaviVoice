"""add superadmin billing override fields to organizations

Revision ID: c823a4f89d12
Revises: b41f7c9d2e05
Create Date: 2026-08-04 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c823a4f89d12"
down_revision: Union[str, None] = "b41f7c9d2e05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_monthly_minutes DOUBLE PRECISION;"))
    conn.execute(sa.text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_max_concurrency INTEGER;"))
    conn.execute(sa.text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle_start TIMESTAMP WITH TIME ZONE;"))
    conn.execute(sa.text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle_end TIMESTAMP WITH TIME ZONE;"))


def downgrade() -> None:
    op.drop_column("organizations", "billing_cycle_end")
    op.drop_column("organizations", "billing_cycle_start")
    op.drop_column("organizations", "custom_max_concurrency")
    op.drop_column("organizations", "custom_monthly_minutes")
