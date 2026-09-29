import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/tasks", tags=["Задачи"])


def get_own_task(db: Session, user: models.User, task_id: int) -> models.Task:
    task = db.get(models.Task, task_id)
    if task is None or task.user_id != user.id:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return task


def resolve_tags(db: Session, user: models.User, tag_ids: list[int]) -> list[models.Tag]:
    ids = set(tag_ids)
    if not ids:
        return []
    tags = db.query(models.Tag).filter(models.Tag.user_id == user.id, models.Tag.id.in_(ids)).all()
    if len(tags) != len(ids):
        raise HTTPException(status_code=400, detail="Один из тегов не найден")
    return tags


def set_done(task: models.Task, done: bool) -> None:
    if done and not task.done:
        task.done_at = models.utcnow()
    elif not done:
        task.done_at = None
    task.done = done


def sort_key_created(task: models.Task):
    # Невыполненные выше, внутри — сначала недавно добавленные
    return (task.done, -task.id)


def sort_key_due(task: models.Task):
    # Невыполненные выше, затем по сроку; задачи без срока — в конце, по дате добавления
    return (task.done, task.due_date is None, task.due_date or dt.date.max, -task.id)


def sort_key_manual(task: models.Task):
    # Свой порядок (перетаскиванием); невыполненные всё равно выше
    return (task.done, task.position, -task.id)


SORT_KEYS = {"created": sort_key_created, "due": sort_key_due, "manual": sort_key_manual}


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(
    status_filter: Literal["all", "active", "done"] = Query("all", alias="status"),
    tag_ids: list[int] = Query(default=[]),
    tag_mode: Literal["any", "all"] = "any",
    search: str | None = None,
    due_from: dt.date | None = None,
    due_to: dt.date | None = None,
    no_due: bool = False,
    sort: Literal["created", "due", "manual"] = "created",
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Фильтры: `tag_ids` можно передать несколько раз (`?tag_ids=1&tag_ids=2`),
    `tag_mode=any` — есть хотя бы один из тегов, `all` — есть все.
    `due_from` / `due_to` — срок в диапазоне (для одной даты передайте обе одинаковыми),
    `no_due=true` — только задачи без срока."""
    q = db.query(models.Task).filter(models.Task.user_id == user.id)
    if status_filter == "active":
        q = q.filter(models.Task.done.is_(False))
    elif status_filter == "done":
        q = q.filter(models.Task.done.is_(True))
    if tag_ids:
        if tag_mode == "all":
            for tag_id in set(tag_ids):
                q = q.filter(models.Task.tags.any(models.Tag.id == tag_id))
        else:
            q = q.filter(models.Task.tags.any(models.Tag.id.in_(tag_ids)))
    if search and search.strip():
        q = q.filter(models.Task.title.ilike(f"%{search.strip()}%"))
    if due_from is not None:
        q = q.filter(models.Task.due_date >= due_from)
    if due_to is not None:
        q = q.filter(models.Task.due_date <= due_to)
    if no_due:
        q = q.filter(models.Task.due_date.is_(None))
    return sorted(q.all(), key=SORT_KEYS[sort])


@router.get("/{task_id}", response_model=schemas.TaskOut)
def get_task(task_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_own_task(db, user, task_id)


@router.post("", response_model=schemas.TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(data: schemas.TaskIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Новая задача встаёт в начало «своего порядка»
    min_position = db.query(func.min(models.Task.position)).filter(models.Task.user_id == user.id).scalar()
    task = models.Task(user_id=user.id, **data.model_dump(exclude={"tag_ids", "done"}))
    task.position = (min_position or 0) - 1
    task.tags = resolve_tags(db, user, data.tag_ids)
    set_done(task, data.done)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}/move", response_model=schemas.TaskOut)
def move_task(
    task_id: int,
    data: schemas.TaskMove,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Перетаскивание: ставит задачу перед `before_id` или после `after_id`
    (если не указано ни то, ни другое — в конец) и перенумеровывает «свой порядок».
    Работает и в отфильтрованном списке: соседние скрытые задачи не мешают."""
    task = get_own_task(db, user, task_id)
    tasks = (
        db.query(models.Task)
        .filter(models.Task.user_id == user.id, models.Task.id != task.id)
        .order_by(models.Task.position, models.Task.id.desc())
        .all()
    )
    ids = [t.id for t in tasks]
    anchor = data.before_id if data.before_id is not None else data.after_id
    if anchor is None:
        index = len(tasks)
    elif anchor not in ids:
        raise HTTPException(status_code=404, detail="Соседняя задача не найдена")
    else:
        index = ids.index(anchor) + (0 if data.before_id is not None else 1)
    tasks.insert(index, task)
    for i, t in enumerate(tasks):
        t.position = i
    if "due_date" in data.model_fields_set:  # перенос в другой день (из дневника)
        task.due_date = data.due_date
    db.commit()
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=schemas.TaskOut)
def replace_task(
    task_id: int,
    data: schemas.TaskIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_own_task(db, user, task_id)
    for key, value in data.model_dump(exclude={"tag_ids", "done"}).items():
        setattr(task, key, value)
    task.tags = resolve_tags(db, user, data.tag_ids)
    set_done(task, data.done)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def patch_task(
    task_id: int,
    data: schemas.TaskPatch,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_own_task(db, user, task_id)
    changes = data.model_dump(exclude_unset=True)
    for field in ("title", "priority"):
        if field in changes and changes[field] is None:
            raise HTTPException(status_code=400, detail=f"Поле {field} не может быть пустым")
    if "tag_ids" in changes:
        task.tags = resolve_tags(db, user, changes.pop("tag_ids") or [])
    if "done" in changes:
        set_done(task, bool(changes.pop("done")))
    if "description" in changes and changes["description"] is None:
        changes["description"] = ""
    for key, value in changes.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_own_task(db, user, task_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
