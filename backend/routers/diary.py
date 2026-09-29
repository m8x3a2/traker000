import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db
from utils import check_range

router = APIRouter(prefix="/diary", tags=["Дневник"])

MAX_CARDS_PER_DAY = 50


def get_own_card(db: Session, user: models.User, card_id: int) -> models.DiaryCard:
    card = db.get(models.DiaryCard, card_id)
    if card is None or card.user_id != user.id:
        raise HTTPException(status_code=404, detail="Карточка не найдена")
    return card


def day_cards(db: Session, user: models.User, day: dt.date, exclude_id: int | None = None) -> list[models.DiaryCard]:
    q = db.query(models.DiaryCard).filter(models.DiaryCard.user_id == user.id, models.DiaryCard.date == day)
    if exclude_id is not None:
        q = q.filter(models.DiaryCard.id != exclude_id)
    return q.order_by(models.DiaryCard.position, models.DiaryCard.id).all()


def renumber(cards: list[models.DiaryCard]) -> None:
    for i, card in enumerate(cards):
        card.position = i


@router.get("", response_model=list[schemas.DiaryCardOut])
def list_cards(
    start: dt.date,
    end: dt.date,
    search: str | None = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Карточки дневника за период (например, за неделю), по дням и по порядку внутри дня."""
    check_range(start, end)
    q = db.query(models.DiaryCard).filter(
        models.DiaryCard.user_id == user.id, models.DiaryCard.date.between(start, end)
    )
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        q = q.filter(models.DiaryCard.title.ilike(pattern) | models.DiaryCard.text.ilike(pattern))
    return q.order_by(models.DiaryCard.date, models.DiaryCard.position, models.DiaryCard.id).all()


@router.get("/{card_id}", response_model=schemas.DiaryCardOut)
def get_card(card_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_own_card(db, user, card_id)


@router.post("", response_model=schemas.DiaryCardOut, status_code=status.HTTP_201_CREATED)
def create_card(data: schemas.DiaryCardIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Новая карточка добавляется в конец дня."""
    cards = day_cards(db, user, data.date)
    if len(cards) >= MAX_CARDS_PER_DAY:
        raise HTTPException(status_code=400, detail=f"В одном дне не больше {MAX_CARDS_PER_DAY} карточек")
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
    """Перетаскивание: переносит карточку в день `date` на место `position`
    и перенумеровывает карточки в старом и новом дне."""
    card = get_own_card(db, user, card_id)
    old_date = card.date
    target = day_cards(db, user, data.date, exclude_id=card.id)
    if old_date != data.date and len(target) >= MAX_CARDS_PER_DAY:
        raise HTTPException(status_code=400, detail=f"В одном дне не больше {MAX_CARDS_PER_DAY} карточек")

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
