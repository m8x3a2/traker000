import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from utils import calc_streak, check_range

router = APIRouter(prefix="/habits", tags=["Привычки"])


def get_own_habit(db: Session, user: models.User, habit_id: int) -> models.Habit:
    habit = db.get(models.Habit, habit_id)
    if habit is None or habit.user_id != user.id:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    return habit


def habit_out(habit: models.Habit, today: dt.date) -> schemas.HabitOut:
    out = schemas.HabitOut.model_validate(habit)
    dates = {log.date for log in habit.logs}
    out.streak = calc_streak(dates, today)
    out.total = len(dates)
    return out


@router.get("", response_model=list[schemas.HabitOut])
def list_habits(
    include_archived: bool = False,
    today: dt.date | None = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Список привычек. `today` — дата клиента (для правильного расчёта серии)."""
    q = db.query(models.Habit).filter(models.Habit.user_id == user.id)
    if not include_archived:
        q = q.filter(models.Habit.archived.is_(False))
    today = today or dt.date.today()
    return [habit_out(h, today) for h in q.order_by(models.Habit.id).all()]


@router.get("/logs", response_model=list[schemas.HabitLogOut])
def list_logs(
    start: dt.date,
    end: dt.date,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Все отметки привычек пользователя за период [start; end]."""
    check_range(start, end)
    return (
        db.query(models.HabitLog)
        .join(models.Habit)
        .filter(models.Habit.user_id == user.id, models.HabitLog.date.between(start, end))
        .all()
    )


@router.post("", response_model=schemas.HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(
    data: schemas.HabitIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.template_id is not None and db.get(models.HabitTemplate, data.template_id) is None:
        raise HTTPException(status_code=404, detail="Шаблон привычки не найден")
    habit = models.Habit(user_id=user.id, **data.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit_out(habit, dt.date.today())


@router.put("/{habit_id}", response_model=schemas.HabitOut)
def update_habit(
    habit_id: int,
    data: schemas.HabitBase,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habit = get_own_habit(db, user, habit_id)
    for key, value in data.model_dump().items():
        setattr(habit, key, value)
    db.commit()
    db.refresh(habit)
    return habit_out(habit, dt.date.today())


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(
    habit_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.delete(get_own_habit(db, user, habit_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{habit_id}/logs", response_model=schemas.HabitLogOut, status_code=status.HTTP_201_CREATED)
def add_log(
    habit_id: int,
    data: schemas.HabitLogIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Отметить привычку выполненной в указанный день (повторная отметка не создаёт дубликат)."""
    habit = get_own_habit(db, user, habit_id)
    if data.date > dt.date.today() + dt.timedelta(days=1):
        raise HTTPException(status_code=400, detail="Нельзя отмечать привычку в будущем")
    log = (
        db.query(models.HabitLog)
        .filter(models.HabitLog.habit_id == habit.id, models.HabitLog.date == data.date)
        .first()
    )
    if log is None:
        log = models.HabitLog(habit_id=habit.id, date=data.date)
        db.add(log)
        db.commit()
        db.refresh(log)
    return log


@router.delete("/{habit_id}/logs/{log_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    habit_id: int,
    log_date: dt.date,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habit = get_own_habit(db, user, habit_id)
    db.query(models.HabitLog).filter(
        models.HabitLog.habit_id == habit.id, models.HabitLog.date == log_date
    ).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
