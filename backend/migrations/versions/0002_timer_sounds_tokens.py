"""Фокус-таймер (шаблоны и звуки) и refresh-токены

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "timer_presets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(40), nullable=False),
        sa.Column("blocks", sa.JSON(), nullable=False),
        sa.Column("break_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rounds", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("sound_start", sa.String(40), nullable=False, server_default="bell"),
        sa.Column("sound_end", sa.String(40), nullable=False, server_default="gong"),
        sa.Column("auto_continue", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("auto_delay", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("voice", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_timer_presets_user_id", "timer_presets", ["user_id"])

    op.create_table(
        "timer_sounds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("content_type", sa.String(40), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    with op.batch_alter_table("user_settings") as batch:
        batch.add_column(sa.Column("timers_seeded", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table("user_settings") as batch:
        batch.drop_column("timers_seeded")
    op.drop_table("refresh_tokens")
    op.drop_table("timer_sounds")
    op.drop_table("timer_presets")
