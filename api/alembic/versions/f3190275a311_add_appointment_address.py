"""add_appointment_address

Revision ID: f3190275a311
Revises: e912f384a702
Create Date: 2026-08-05 12:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3190275a311'
down_revision: Union[str, None] = 'e912f384a702'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('appointments', sa.Column('address', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('appointments', 'address')
