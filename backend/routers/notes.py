from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/note", tags=["Заметка"])


def get_or_create_note(db: Session, user: models.User) -> models.Note:
    if user.note is None:
        user.note = models.Note(content="")
        db.commit()
    return user.note


@router.get("", response_model=schemas.NoteOut)
def get_note(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_or_create_note(db, user)


@router.put("", response_model=schemas.NoteOut)
def update_note(
    data: schemas.NoteUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = get_or_create_note(db, user)
    note.content = data.content
    db.commit()
    db.refresh(note)
    return note
