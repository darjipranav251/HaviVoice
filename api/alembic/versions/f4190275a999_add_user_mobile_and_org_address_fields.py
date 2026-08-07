"""Add mobile_number to users and business profile/address fields to organizations

Revision ID: f4190275a999
Revises: f3190275a111
Create Date: 2026-08-07 05:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector


# revision identifiers, used by Alembic.
revision: str = 'f4190275a999'
down_revision: Union[str, None] = 'f3190275a311'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    
    # Update users table
    users_cols = [col["name"] for col in inspector.get_columns("users")]
    if "mobile_number" not in users_cols:
        op.add_column("users", sa.Column("mobile_number", sa.String(), nullable=True))

    # Update organizations table
    org_cols = [col["name"] for col in inspector.get_columns("organizations")]
    if "name" not in org_cols:
        op.add_column("organizations", sa.Column("name", sa.String(), nullable=True))
    if "business_type" not in org_cols:
        op.add_column("organizations", sa.Column("business_type", sa.String(), nullable=True))
    if "address_street" not in org_cols:
        op.add_column("organizations", sa.Column("address_street", sa.String(), nullable=True))
    if "address_city" not in org_cols:
        op.add_column("organizations", sa.Column("address_city", sa.String(), nullable=True))
    if "address_state" not in org_cols:
        op.add_column("organizations", sa.Column("address_state", sa.String(), nullable=True))
    if "address_zip" not in org_cols:
        op.add_column("organizations", sa.Column("address_zip", sa.String(), nullable=True))
    if "address_country" not in org_cols:
        op.add_column("organizations", sa.Column("address_country", sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    
    users_cols = [col["name"] for col in inspector.get_columns("users")]
    if "mobile_number" in users_cols:
        op.drop_column("users", "mobile_number")

    org_cols = [col["name"] for col in inspector.get_columns("organizations")]
    for col_name in ["name", "business_type", "address_street", "address_city", "address_state", "address_zip", "address_country"]:
        if col_name in org_cols:
            op.drop_column("organizations", col_name)
