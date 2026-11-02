from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

import models
import schemas
from cache import cache, etag_response
from database import get_db
from docs import err

router = APIRouter(prefix="/templates", tags=["Каталог привычек"])


@router.get("", response_model=list[schemas.HabitTemplateOut], summary="Каталог привычек", responses=err(304))
def list_templates(
    request: Request,
    response: Response,
    search: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    """Публичный каталог готовых привычек (доступен и гостям).

    Ответ кэшируется на сервере (сбрасывается при изменении каталога администратором)
    и в браузере: при совпадении `If-None-Match` с `ETag` возвращается 304."""
    search = (search or "").strip()
    key = f"templates:{search.lower()}|{category or ''}"

    def load():
        q = db.query(models.HabitTemplate)
        if search:
            q = q.filter(models.HabitTemplate.title.ilike(f"%{search}%"))
        if category:
            q = q.filter(models.HabitTemplate.category == category)
        rows = q.order_by(models.HabitTemplate.category, models.HabitTemplate.title).all()
        return [schemas.HabitTemplateOut.model_validate(t).model_dump() for t in rows]

    data, hit = cache.get_or_set(key, load)
    return etag_response(request, response, data, max_age=60, hit=hit)
