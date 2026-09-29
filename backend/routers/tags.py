from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/tags", tags=["Теги"])

MAX_TAGS = 50


def get_own_tag(db: Session, user: models.User, tag_id: int) -> models.Tag:
    tag = db.get(models.Tag, tag_id)
    if tag is None or tag.user_id != user.id:
        raise HTTPException(status_code=404, detail="Тег не найден")
    return tag


def ensure_unique_name(db: Session, user: models.User, name: str, exclude_id: int | None = None):
    q = db.query(models.Tag).filter(models.Tag.user_id == user.id, models.Tag.name == name)
    if exclude_id is not None:
        q = q.filter(models.Tag.id != exclude_id)
    if q.first():
        raise HTTPException(status_code=400, detail=f"Тег «{name}» уже существует")


@router.get("", response_model=list[schemas.TagOut])
def list_tags(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Tag).filter(models.Tag.user_id == user.id).order_by(models.Tag.name).all()


@router.post("", response_model=schemas.TagOut, status_code=status.HTTP_201_CREATED)
def create_tag(data: schemas.TagIn, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(models.Tag).filter(models.Tag.user_id == user.id).count() >= MAX_TAGS:
        raise HTTPException(status_code=400, detail=f"Можно создать не больше {MAX_TAGS} тегов")
    ensure_unique_name(db, user, data.name)
    tag = models.Tag(user_id=user.id, **data.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=schemas.TagOut)
def update_tag(
    tag_id: int,
    data: schemas.TagIn,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tag = get_own_tag(db, user, tag_id)
    ensure_unique_name(db, user, data.name, exclude_id=tag.id)
    tag.name, tag.color = data.name, data.color
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(tag_id: int, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_own_tag(db, user, tag_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
