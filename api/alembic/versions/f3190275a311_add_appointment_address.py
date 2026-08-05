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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "appointments" not in tables:
        op.create_table(
            "appointments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("organization_id", sa.Integer(), nullable=False),
            sa.Column("client_name", sa.String(length=255), nullable=False),
            sa.Column("client_email", sa.String(length=255), nullable=True),
            sa.Column("client_phone", sa.String(length=100), nullable=True),
            sa.Column("title", sa.String(length=255), nullable=False, server_default="Appointment"),
            sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
            sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(length=50), nullable=False, server_default="upcoming"),
            sa.Column("is_emergency", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("booking_uid", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(
                ["organization_id"], ["organizations.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_appointments_id", "appointments", ["id"], unique=False)
        op.create_index("ix_appointments_org_id", "appointments", ["organization_id"], unique=False)
        op.create_index("ix_appointments_start_time", "appointments", ["start_time"], unique=False)
        op.create_index("ix_appointments_status", "appointments", ["status"], unique=False)
        op.create_index("ix_appointments_booking_uid", "appointments", ["booking_uid"], unique=False)
        op.create_index("ix_appointments_org_start", "appointments", ["organization_id", "start_time"], unique=False)
        op.create_index("ix_appointments_org_status", "appointments", ["organization_id", "status"], unique=False)
    else:
        columns = [c["name"] for c in inspector.get_columns("appointments")]
        if "address" not in columns:
            op.add_column("appointments", sa.Column("address", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if "appointments" in tables:
        columns = [c["name"] for c in inspector.get_columns("appointments")]
        if "address" in columns:
            op.drop_column("appointments", "address")
