from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/templates", tags=["Каталог привычек"])


@router.get("", response_model=list[schemas.HabitTemplateOut])
def list_templates(search: str | None = None, category: str | None = None, db: Session = Depends(get_db)):
    """Публичный каталог готовых привычек (доступен и гостям)."""
    q = db.query(models.HabitTemplate)
    if search and search.strip():
        q = q.filter(models.HabitTemplate.title.ilike(f"%{search.strip()}%"))
    if category:
        q = q.filter(models.HabitTemplate.category == category)
    return q.order_by(models.HabitTemplate.category, models.HabitTemplate.title).all()
