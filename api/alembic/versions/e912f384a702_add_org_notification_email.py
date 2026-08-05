"""add notification_email to organizations

Revision ID: e912f384a702
Revises: c823a4f89d12
Create Date: 2026-08-05 07:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e912f384a702"
down_revision: Union[str, None] = "c823a4f89d12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS notification_email VARCHAR;"))


def downgrade() -> None:
    op.drop_column("organizations", "notification_email")
