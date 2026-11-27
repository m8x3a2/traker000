import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from docs import err
from utils import check_range

router = APIRouter(prefix="/diary", tags=["Дневник"])

MAX_CARDS_PER_DAY = 50
MAX_UNDATED = 200  # заметок «Без даты»


def get_own_card(db: Session, user: models.User, card_id: int) -> models.DiaryCard:
    card = db.get(models.DiaryCard, card_id)
    if card is None or card.user_id != user.id:
        raise HTTPException(status_code=404, detail="Карточка не найдена")
    return card


def day_filter(day: dt.date | None):
    return models.DiaryCard.date.is_(None) if day is None else models.DiaryCard.date == day


def day_cards(db: Session, user: models.User, day: dt.date | None, exclude_id: int | None = None) -> list[models.DiaryCard]:
    """Карточки одного дня по порядку; day = None — заметки без даты."""
    q = db.query(models.DiaryCard).filter(models.DiaryCard.user_id == user.id, day_filter(day))
    if exclude_id is not None:
        q = q.filter(models.DiaryCard.id != exclude_id)
    return q.order_by(models.DiaryCard.position, models.DiaryCard.id).all()


def check_limit(cards: list[models.DiaryCard], day: dt.date | None) -> None:
    if day is None and len(cards) >= MAX_UNDATED:
        raise HTTPException(status_code=400, detail=f"Заметок без даты не больше {MAX_UNDATED}")
    if day is not None and len(cards) >= MAX_CARDS_PER_DAY:
        raise HTTPException(status_code=400, detail=f"В одном дне не больше {MAX_CARDS_PER_DAY} карточек")


def renumber(cards: list[models.DiaryCard]) -> None:
    for i, card in enumerate(cards):
        card.position = i


@router.get("", response_model=list[schemas.DiaryCardOut], summary="Карточки дневника", responses=err(400, 401, 422))
def list_cards(
    start: dt.date | None = None,
    end: dt.date | None = None,
    no_date: bool = False,
    search: str | None = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Карточки дневника за период [start; end] (например, за неделю), по дням и по порядку внутри дня.
    `no_date=true` — только заметки без даты (start и end тогда не нужны).
    При поиске (`search=`) заметки без даты тоже попадают в результат."""
    searching = bool(search and search.strip())
    q = db.query(models.DiaryCard).filter(models.DiaryCard.user_id == user.id)
    if no_date:
        q = q.filter(models.DiaryCard.date.is_(None))
    else:
        if start is None or end is None:
            raise HTTPException(status_code=400, detail="Укажите start и end или no_date=true")
        check_range(start, end)
        in_range = models.DiaryCard.date.between(start, end)
        q = q.filter(in_range | models.DiaryCard.date.is_(None) if searching else in_range)
    if searching:
        pattern = f"%{search.strip()}%"
        q = q.filter(models.DiaryCard.title.ilike(pattern) | models.DiaryCard.text.ilike(pattern))
    return q.order_by(models.DiaryCard.date.asc().nulls_last(), models.DiaryCard.position, models.DiaryCard.id).all()


@router.get("/{card_id}", response_model=schemas.DiaryCardOut)
def get_card(card_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_own_card(db, user, card_id)


@router.post("", response_model=schemas.DiaryCardOut, status_code=status.HTTP_201_CREATED)
def create_card(data: schemas.DiaryCardIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Новая карточка добавляется в конец дня (без `date` — в заметки «Без даты»)."""
    cards = day_cards(db, user, data.date)
    check_limit(cards, data.date)
    card = models.DiaryCard(user_id=user.id, position=len(cards), **data.model_dump())
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.put("/{card_id}", response_model=schemas.DiaryCardOut)
def update_card(
    card_id: int,
    data: schemas.DiaryCardUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    card = get_own_card(db, user, card_id)
    for key, value in data.model_dump().items():
        setattr(card, key, value)
    db.commit()
    db.refresh(card)
    return card


@router.put("/{card_id}/move", response_model=schemas.DiaryCardOut)
def move_card(
    card_id: int,
    data: schemas.DiaryCardMove,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Перетаскивание: переносит карточку в день `date` (null — в «Без даты») на место `position`
    и перенумеровывает карточки в старом и новом дне."""
    card = get_own_card(db, user, card_id)
    old_date = card.date
    target = day_cards(db, user, data.date, exclude_id=card.id)
    if old_date != data.date:
        check_limit(target, data.date)

    target.insert(min(data.position, len(target)), card)
    card.date = data.date
    renumber(target)
    if old_date != data.date:
        renumber(day_cards(db, user, old_date, exclude_id=card.id))
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    card = get_own_card(db, user, card_id)
    day = card.date
    db.delete(card)
    db.flush()
    renumber(day_cards(db, user, day))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
