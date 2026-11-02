import datetime as dt

import pytest
from fastapi import HTTPException

from routers.timers import DEFAULT_PRESETS, total_seconds
from utils import calc_streak, check_range

TODAY = dt.date(2026, 10, 20)


def days(*offsets):
    return {TODAY - dt.timedelta(days=o) for o in offsets}


@pytest.mark.parametrize(
    ("dates", "expected"),
    [
        (set(), 0),
        (days(0), 1),
        (days(0, 1, 2), 3),
        (days(1, 2, 3), 3),  # сегодня ещё не отмечено — серия считается от вчера
        (days(0, 2, 3), 1),  # пропуск вчера обнуляет серию
        (days(2, 3), 0),
    ],
)
def test_calc_streak(dates, expected):
    assert calc_streak(dates, TODAY) == expected


def test_check_range_ok():
    check_range(TODAY, TODAY + dt.timedelta(days=366))


@pytest.mark.parametrize("end", [TODAY - dt.timedelta(days=1), TODAY + dt.timedelta(days=367)])
def test_check_range_errors(end):
    with pytest.raises(HTTPException) as e:
        check_range(TODAY, end)
    assert e.value.status_code == 400


def test_total_seconds_counts_breaks_between_rounds_only():
    blocks = [{"seconds": 25 * 60}, {"seconds": 5 * 60}]
    assert total_seconds(blocks, rounds=4, break_seconds=15 * 60) == 4 * 30 * 60 + 3 * 15 * 60
    assert total_seconds(blocks, rounds=1, break_seconds=600) == 30 * 60


def test_default_study_preset_matches_reference_app():
    study = next(p for p in DEFAULT_PRESETS if p["title"] == "Учёба")
    # 4 × (45 + 10) мин = 3:40:00
    assert total_seconds(study["blocks"], study["rounds"], study["break_seconds"]) == 3 * 3600 + 40 * 60
