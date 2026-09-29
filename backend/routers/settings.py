from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_user
from database import get_db

router = APIRouter(prefix="/settings", tags=["Настройки"])


def get_or_create_settings(db: Session, user: models.User) -> models.UserSettings:
    if user.settings is None:
        user.settings = models.UserSettings(theme="dark")
        db.commit()
    return user.settings


@router.get("", response_model=schemas.SettingsOut)
def get_settings(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_or_create_settings(db, user)


@router.put("", response_model=schemas.SettingsOut)
def update_settings(
    data: schemas.SettingsUpdate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    settings = get_or_create_settings(db, user)
    settings.theme = data.theme
    # Свои цвета сохраняем, даже если сейчас выбрана тёмная/светлая тема
    if data.custom_colors is not None:
        settings.custom_colors = data.custom_colors
    db.commit()
    db.refresh(settings)
    return settings
