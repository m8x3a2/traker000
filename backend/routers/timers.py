from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from docs import AUTH_ERRORS, OWNER_ERRORS, err

router = APIRouter(prefix="/timers", tags=["Фокус-таймер"])

MAX_PRESETS = 50
GREEN, BLUE, ORANGE = "#30a46c", "#3e7bfa", "#f5a524"

# Стандартные шаблоны: копируются в аккаунт при первом обращении и дальше редактируются как обычные
DEFAULT_PRESETS = [
    {
        "title": "Помодоро", "rounds": 4, "break_seconds": 15 * 60,
        "blocks": [{"title": "Работа", "seconds": 25 * 60, "color": GREEN},
                   {"title": "Перерыв", "seconds": 5 * 60, "color": BLUE}],
        "sound_start": "bell", "sound_end": "gong", "auto_continue": True, "auto_delay": 5, "voice": False,
    },
    {
        "title": "52/17", "rounds": 3, "break_seconds": 0,
        "blocks": [{"title": "Фокус", "seconds": 52 * 60, "color": ORANGE},
                   {"title": "Отдых", "seconds": 17 * 60, "color": BLUE}],
        "sound_start": "beep", "sound_end": "gong", "auto_continue": False, "auto_delay": 5, "voice": False,
    },
    {
        "title": "Учёба", "rounds": 4, "break_seconds": 0,
        "blocks": [{"title": "Учёба", "seconds": 45 * 60, "color": GREEN},
                   {"title": "Разминка тела", "seconds": 10 * 60, "color": BLUE}],
        "sound_start": "bell", "sound_end": "bell", "auto_continue": False, "auto_delay": 5, "voice": True,
    },
]


def total_seconds(blocks: list[dict], rounds: int, break_seconds: int) -> int:
    return sum(b["seconds"] for b in blocks) * rounds + break_seconds * (rounds - 1)


def to_out(p: models.TimerPreset) -> schemas.TimerPresetOut:
    out = schemas.TimerPresetOut.model_validate(p)
    out.total_seconds = total_seconds(p.blocks, p.rounds, p.break_seconds)
    return out


def check_custom_sounds(db: Session, data: schemas.TimerPresetIn) -> None:
    for sound in (data.sound_start, data.sound_end):
        if sound.startswith("custom:") and db.get(models.TimerSound, int(sound.split(":")[1])) is None:
            raise HTTPException(status_code=400, detail="Выбранный звук не найден, выберите другой")


def seed_defaults(db: Session, user: models.User) -> None:
    for i, preset in enumerate(DEFAULT_PRESETS):
        user.timer_presets.append(models.TimerPreset(position=i, **preset))


def get_own_preset(db: Session, user: models.User, preset_id: int) -> models.TimerPreset:
    preset = db.get(models.TimerPreset, preset_id)
    if preset is None or preset.user_id != user.id:
        raise HTTPException(status_code=404, detail="Шаблон таймера не найден")
    return preset


@router.get("", response_model=list[schemas.TimerPresetOut], summary="Мои шаблоны таймера", responses=AUTH_ERRORS)
def list_presets(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """При первом обращении в аккаунт копируются стандартные шаблоны «Помодоро», «52/17», «Учёба»."""
    if user.settings is None:
        user.settings = models.UserSettings(theme="dark")
    if not user.settings.timers_seeded:
        user.settings.timers_seeded = True
        if not user.timer_presets:
            seed_defaults(db, user)
        db.commit()
    return [to_out(p) for p in user.timer_presets]


@router.post(
    "", response_model=schemas.TimerPresetOut, status_code=status.HTTP_201_CREATED,
    summary="Создать шаблон", responses=err(400, 401, 422),
)
def create_preset(data: schemas.TimerPresetIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(user.timer_presets) >= MAX_PRESETS:
        raise HTTPException(status_code=400, detail=f"Можно сохранить не больше {MAX_PRESETS} шаблонов")
    check_custom_sounds(db, data)
    position = max((p.position for p in user.timer_presets), default=-1) + 1
    preset = models.TimerPreset(position=position, **data.model_dump(mode="json"))
    user.timer_presets.append(preset)
    db.commit()
    db.refresh(preset)
    return to_out(preset)


@router.put("/{preset_id}", response_model=schemas.TimerPresetOut, summary="Изменить шаблон", responses=OWNER_ERRORS)
def update_preset(
    preset_id: int,
    data: schemas.TimerPresetIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preset = get_own_preset(db, user, preset_id)
    check_custom_sounds(db, data)
    for key, value in data.model_dump(mode="json").items():
        setattr(preset, key, value)
    db.commit()
    db.refresh(preset)
    return to_out(preset)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить шаблон", responses=OWNER_ERRORS)
def delete_preset(preset_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_own_preset(db, user, preset_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/defaults", response_model=list[schemas.TimerPresetOut], summary="Вернуть стандартные шаблоны", responses=AUTH_ERRORS)
def restore_defaults(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Добавляет стандартные шаблоны, которых нет в аккаунте (по названию)."""
    titles = {p.title for p in user.timer_presets}
    position = max((p.position for p in user.timer_presets), default=-1) + 1
    for preset in DEFAULT_PRESETS:
        if preset["title"] not in titles and len(user.timer_presets) < MAX_PRESETS:
            user.timer_presets.append(models.TimerPreset(position=position, **preset))
            position += 1
    db.commit()
    return [to_out(p) for p in user.timer_presets]
