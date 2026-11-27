import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

import models
import schemas
from auth import get_current_user
from database import get_db
from docs import err
from routers.diary import day_cards
from routers.habits import habit_out, habits_query
from routers.tasks import sort_key_due
from utils import calc_streak

router = APIRouter(prefix="/stats", tags=["Статистика"])


def stats_for_day(db: Session, user_id: int, today: dt.date, habit_dates: dict[int, set[dt.date]]) -> schemas.StatsOut:
    week_ago = today - dt.timedelta(days=min(6, (today - dt.date.min).days))

    best_streak = max((calc_streak(dates, today) for dates in habit_dates.values()), default=0)
    done_today = sum(today in dates for dates in habit_dates.values())
    week_done = sum(week_ago <= day <= today for dates in habit_dates.values() for day in dates)
    week_total = len(habit_dates) * 7
    week_rate = round(week_done * 100 / week_total) if week_total else 0

    task = models.Task
    tasks_active, tasks_done, tasks_overdue = db.query(
        func.count(task.id).filter(task.done.is_(False)),
        func.count(task.id).filter(task.done.is_(True)),
        func.count(task.id).filter(task.done.is_(False), task.due_date < today),
    ).filter(task.user_id == user_id).one()
    card = models.DiaryCard
    diary_total, diary_week = db.query(
        func.count(card.id), func.count(card.id).filter(card.date.between(week_ago, today)),
    ).filter(card.user_id == user_id).one()

    return schemas.StatsOut(
        habits_active=len(habit_dates),
        habits_done_today=done_today,
        best_streak=best_streak,
        week_habit_rate=week_rate,
        tasks_active=tasks_active,
        tasks_done=tasks_done,
        tasks_overdue=tasks_overdue,
        diary_cards=diary_total,
        diary_cards_week=diary_week,
    )


@router.get("", response_model=schemas.StatsOut, summary="Личная статистика", responses=err(401, 422, 429))
def my_stats(
    today: dt.date | None = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Личная статистика. `today` — дата клиента."""
    today = today or dt.date.today()
    dates = {habit.id: {log.date for log in habit.logs} for habit in habits_query(db, user.id)}
    return stats_for_day(db, user.id, today, dates)


@router.get("/dashboard", response_model=schemas.DashboardOut, summary="Сводка на день", responses=err(401, 422, 429))
def dashboard(
    today: dt.date | None = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Данные страницы «Сегодня»: активные привычки, их отметки, задачи со сроком до
    указанной даты включительно, дневник за этот день и личные счётчики."""
    today = today or dt.date.today()
    habits = habits_query(db, user.id).all()
    dates = {habit.id: {log.date for log in habit.logs} for habit in habits}
    task = models.Task
    tasks = db.query(task).options(selectinload(task.tags)).filter(
        task.user_id == user.id, task.done.is_(False), task.due_date <= today,
    ).all()
    return schemas.DashboardOut(
        date=today,
        stats=stats_for_day(db, user.id, today, dates),
        habits=[habit_out(h, today, dates[h.id]) for h in habits],
        completed_habit_ids=[habit_id for habit_id, days in dates.items() if today in days],
        tasks=[schemas.TaskOut.model_validate(t) for t in sorted(tasks, key=sort_key_due)],
        diary=[schemas.DiaryCardOut.model_validate(c) for c in day_cards(db, user, today)],
    )
