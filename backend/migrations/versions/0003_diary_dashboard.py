"""Записи дневника без даты и индексы выборок по пользователю."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("diary_cards") as batch:
        batch.alter_column("date", existing_type=sa.Date(), nullable=True)
        batch.create_index("ix_diary_cards_user_date", ["user_id", "date"])
    op.create_index("ix_tasks_user_done_due", "tasks", ["user_id", "done", "due_date"])


def downgrade() -> None:
    diary = sa.table("diary_cards", sa.column("date", sa.Date()))
    if op.get_bind().execute(sa.select(diary.c.date).where(diary.c.date.is_(None)).limit(1)).first():
        raise RuntimeError("Для отката сначала назначьте даты всем карточкам дневника")
    op.drop_index("ix_tasks_user_done_due", table_name="tasks")
    with op.batch_alter_table("diary_cards") as batch:
        batch.drop_index("ix_diary_cards_user_date")
        batch.alter_column("date", existing_type=sa.Date(), nullable=False)
