import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from utils import calc_streak

router = APIRouter(prefix="/stats", tags=["Статистика"])


@router.get("", response_model=schemas.StatsOut)
def my_stats(
    today: dt.date | None = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Личная статистика. `today` — дата клиента."""
    today = today or dt.date.today()
    week_ago = today - dt.timedelta(days=6)

    habits = [h for h in user.habits if not h.archived]
    best_streak = 0
    done_today = 0
    week_done = 0
    for habit in habits:
        dates = {log.date for log in habit.logs}
        best_streak = max(best_streak, calc_streak(dates, today))
        done_today += today in dates
        week_done += sum(1 for d in dates if week_ago <= d <= today)
    week_total = len(habits) * 7
    week_rate = round(week_done * 100 / week_total) if week_total else 0

    tasks_q = db.query(models.Task).filter(models.Task.user_id == user.id)
    tasks_active = tasks_q.filter(models.Task.done.is_(False)).count()
    tasks_done = tasks_q.filter(models.Task.done.is_(True)).count()
    tasks_overdue = tasks_q.filter(models.Task.done.is_(False), models.Task.due_date < today).count()

    diary_q = db.query(models.DiaryCard).filter(models.DiaryCard.user_id == user.id)

    return schemas.StatsOut(
        habits_active=len(habits),
        habits_done_today=done_today,
        best_streak=best_streak,
        week_habit_rate=week_rate,
        tasks_active=tasks_active,
        tasks_done=tasks_done,
        tasks_overdue=tasks_overdue,
        diary_cards=diary_q.count(),
        diary_cards_week=diary_q.filter(models.DiaryCard.date.between(week_ago, today)).count(),
    )
