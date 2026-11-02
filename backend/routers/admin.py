from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import require_admin
from cache import cache
from database import get_db
from docs import err

router = APIRouter(
    prefix="/admin", tags=["Администрирование"], dependencies=[Depends(require_admin)], responses=err(401, 403)
)


# ---------- Пользователи ----------

@router.get("/users", response_model=list[schemas.AdminUserOut], summary="Пользователи")
def list_users(db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(models.User.id).all()
    return [
        schemas.AdminUserOut(
            id=u.id,
            username=u.username,
            role=u.role,
            created_at=u.created_at,
            habits_count=len(u.habits),
            tasks_count=len(u.tasks),
            diary_count=len(u.diary_cards),
        )
        for u in users
    ]


def get_other_user(db: Session, admin: models.User, user_id: int) -> models.User:
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Нельзя изменить или удалить самого себя")
    return user


@router.put("/users/{user_id}/role", response_model=schemas.UserOut, summary="Изменить роль", responses=err(400, 404, 422))
def change_role(
    user_id: int,
    data: schemas.RoleUpdate,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = get_other_user(db, admin, user_id)
    user.role = data.role
    db.commit()
    cache.invalidate("admin:")
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить пользователя", responses=err(400, 404))
def delete_user(user_id: int, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    db.delete(get_other_user(db, admin, user_id))
    db.commit()
    cache.invalidate("admin:")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- Статистика системы ----------

@router.get("/stats", response_model=schemas.AdminStatsOut, summary="Статистика системы")
def system_stats(response: Response, db: Session = Depends(get_db)):
    """Девять COUNT-запросов по всем таблицам — результат кэшируется на 30 секунд."""
    def load():
        return schemas.AdminStatsOut(
            users=db.query(models.User).count(),
            admins=db.query(models.User).filter(models.User.role == "admin").count(),
            habits=db.query(models.Habit).count(),
            habit_logs=db.query(models.HabitLog).count(),
            tasks=db.query(models.Task).count(),
            diary_cards=db.query(models.DiaryCard).count(),
            templates=db.query(models.HabitTemplate).count(),
            timer_presets=db.query(models.TimerPreset).count(),
            timer_sounds=db.query(models.TimerSound).count(),
        )

    data, hit = cache.get_or_set("admin:stats", load, ttl=30)
    response.headers["X-Cache"] = "HIT" if hit else "MISS"
    return data


# ---------- Каталог привычек ----------

def get_template(db: Session, template_id: int) -> models.HabitTemplate:
    template = db.get(models.HabitTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    return template


@router.post("/templates", response_model=schemas.HabitTemplateOut, status_code=status.HTTP_201_CREATED, summary="Добавить шаблон", responses=err(422))
def create_template(data: schemas.HabitTemplateIn, db: Session = Depends(get_db)):
    template = models.HabitTemplate(**data.model_dump())
    db.add(template)
    db.commit()
    cache.invalidate("templates:")
    db.refresh(template)
    return template


@router.put("/templates/{template_id}", response_model=schemas.HabitTemplateOut, summary="Изменить шаблон", responses=err(404, 422))
def update_template(template_id: int, data: schemas.HabitTemplateIn, db: Session = Depends(get_db)):
    template = get_template(db, template_id)
    for key, value in data.model_dump().items():
        setattr(template, key, value)
    db.commit()
    cache.invalidate("templates:")
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить шаблон", responses=err(404))
def delete_template(template_id: int, db: Session = Depends(get_db)):
    db.delete(get_template(db, template_id))
    db.commit()
    cache.invalidate("templates:")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
