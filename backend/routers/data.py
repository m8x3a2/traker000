import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from docs import err

router = APIRouter(tags=["Экспорт и импорт"])


@router.get("/export", response_model=schemas.ExportData, summary="Экспорт в JSON", responses=err(401))
def export_data(user: models.User = Depends(get_current_user)):
    """Все данные пользователя одним JSON-файлом."""
    settings = user.settings
    return schemas.ExportData(
        exported_at=dt.datetime.now(dt.timezone.utc),
        settings=schemas.SettingsBase(theme=settings.theme, custom_colors=settings.custom_colors) if settings else None,
        note=user.note.content if user.note else "",
        habits=[
            schemas.ExportHabit(
                title=h.title,
                description=h.description,
                icon=h.icon,
                color=h.color,
                archived=h.archived,
                logs=sorted(log.date for log in h.logs),
            )
            for h in user.habits
        ],
        tags=[schemas.TagIn(name=t.name, color=t.color) for t in user.tags],
        tasks=[
            schemas.ExportTask(
                title=t.title,
                description=t.description,
                due_date=t.due_date,
                priority=t.priority,
                done=t.done,
                tags=[tag.name for tag in t.tags],
            )
            for t in sorted(user.tasks, key=lambda t: (t.position, -t.id))  # сохраняем «свой порядок»
        ],
        diary=[
            schemas.ExportDiary(date=c.date, title=c.title, text=c.text, color=c.color)
            for c in sorted(user.diary_cards, key=lambda c: (c.date, c.position, c.id))
        ],
        timers=[schemas.TimerPresetIn.model_validate(p, from_attributes=True) for p in user.timer_presets],
    )


@router.post("/import", response_model=schemas.ImportResult, summary="Импорт из JSON", responses=err(401, 422))
def import_data(
    data: schemas.ExportData,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Импорт из JSON. ВНИМАНИЕ: все текущие данные пользователя заменяются данными из файла."""
    # 1. Удаляем текущие данные (ORM-каскад удалит отметки привычек и связи задач с тегами)
    user.habits.clear()
    user.tasks.clear()
    user.tags.clear()
    user.diary_cards.clear()
    if data.timers is not None:  # в файлах старых версий таймеров нет — оставляем текущие
        user.timer_presets.clear()
    db.flush()

    # 2. Настройки и заметка
    if data.settings is not None:
        if user.settings is None:
            user.settings = models.UserSettings()
        user.settings.theme = data.settings.theme
        user.settings.custom_colors = data.settings.custom_colors
    if user.note is None:
        user.note = models.Note()
    user.note.content = data.note

    # 3. Новые данные
    for h in data.habits:
        habit = models.Habit(**h.model_dump(exclude={"logs"}))
        habit.logs = [models.HabitLog(date=d) for d in sorted(set(h.logs))]
        user.habits.append(habit)

    tags_by_name = {}
    for t in data.tags:
        tag = models.Tag(name=t.name, color=t.color)
        tags_by_name[t.name] = tag
        user.tags.append(tag)

    for position, t in enumerate(data.tasks):
        task = models.Task(position=position, **t.model_dump(exclude={"tags"}))
        if t.done:
            task.done_at = models.utcnow()
        task.tags = [tags_by_name[name] for name in dict.fromkeys(t.tags)]
        user.tasks.append(task)

    positions: dict = {}  # порядок карточек внутри каждого дня — как в файле
    for c in data.diary:
        positions[c.date] = positions.get(c.date, -1) + 1
        user.diary_cards.append(models.DiaryCard(position=positions[c.date], **c.model_dump()))

    custom_ids = {row.id for row in db.query(models.TimerSound.id)}
    for position, p in enumerate(data.timers or []):
        preset = models.TimerPreset(position=position, **p.model_dump(mode="json"))
        # Звук, загруженный на другом сервере, может отсутствовать — подставляем стандартный
        if preset.sound_start.startswith("custom:") and int(preset.sound_start[7:]) not in custom_ids:
            preset.sound_start = "bell"
        if preset.sound_end.startswith("custom:") and int(preset.sound_end[7:]) not in custom_ids:
            preset.sound_end = "gong"
        user.timer_presets.append(preset)
    if data.timers is not None and user.settings is not None:
        user.settings.timers_seeded = True

    db.commit()
    return schemas.ImportResult(
        detail="Импорт завершён",
        habits=len(data.habits),
        tasks=len(data.tasks),
        tags=len(data.tags),
        diary=len(data.diary),
        timers=len(data.timers or []),
    )
