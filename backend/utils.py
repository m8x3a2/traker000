import datetime as dt

from fastapi import HTTPException

MAX_RANGE_DAYS = 366


def calc_streak(dates: set[dt.date], today: dt.date) -> int:
    """Сколько дней подряд выполнена привычка.

    Если сегодня ещё не отмечено, серия считается от вчерашнего дня —
    чтобы утром она не «сгорала» раньше времени.
    """
    day = today if today in dates else today - dt.timedelta(days=1)
    streak = 0
    while day in dates:
        streak += 1
        day -= dt.timedelta(days=1)
    return streak


def check_range(start: dt.date, end: dt.date) -> None:
    if end < start:
        raise HTTPException(status_code=400, detail="Дата окончания раньше даты начала")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"Диапазон не может превышать {MAX_RANGE_DAYS} дней")
