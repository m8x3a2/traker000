import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

import models
import schemas
from auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    hash_refresh_token,
    use_refresh_token,
    verify_password,
)
from config import ACCESS_TOKEN_EXPIRE_MINUTES
from database import get_db
from docs import AUTH_ERRORS, err
from metrics import LOGINS

router = APIRouter(tags=["Аккаунт"])
log = logging.getLogger("traker.auth")


def issue_tokens(db: Session, user: models.User) -> schemas.Token:
    refresh = create_refresh_token(db, user)
    db.commit()
    return schemas.Token(
        access_token=create_access_token({"sub": user.username}),
        refresh_token=refresh,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/register",
    response_model=schemas.UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Регистрация",
    responses=err(400, 422, 429),
)
def register(data: schemas.UserCreate, db: Session = Depends(get_db)):
    """Создаёт пользователя с ролью `client`, пустой заметкой и тёмной темой."""
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Пользователь с таким именем уже существует")
    user = models.User(username=data.username, password=hash_password(data.password), role="client")
    user.settings = models.UserSettings(theme="dark")
    user.note = models.Note(content="")
    db.add(user)
    db.commit()
    db.refresh(user)
    log.info("user registered", extra={"user_id": user.id})
    return user


@router.post("/login", response_model=schemas.Token, summary="Вход", responses=err(401, 422, 429))
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    """Возвращает пару токенов: короткий **access** (JWT, передаётся в заголовке
    `Authorization: Bearer`) и долгий одноразовый **refresh** для `POST /refresh`."""
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not verify_password(data.password, user.password):
        LOGINS.labels("fail").inc()
        log.warning("login failed", extra={"username": data.username})
        raise HTTPException(status_code=401, detail="Неверное имя пользователя или пароль")
    LOGINS.labels("ok").inc()
    log.info("login ok", extra={"user_id": user.id})
    return issue_tokens(db, user)


@router.post("/refresh", response_model=schemas.Token, summary="Обновить токены", responses=err(401, 422, 429))
def refresh(data: schemas.RefreshIn, db: Session = Depends(get_db)):
    """Обменивает refresh-токен на новую пару токенов. Старый refresh-токен отзывается (ротация)."""
    user = use_refresh_token(db, data.refresh_token)
    return issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Выход", responses=err(422))
def logout(data: schemas.RefreshIn, db: Session = Depends(get_db)):
    """Отзывает refresh-токен. Access-токен истечёт сам (не дольше `ACCESS_TOKEN_EXPIRE_MINUTES`)."""
    db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == hash_refresh_token(data.refresh_token)
    ).update({"revoked": True})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=schemas.UserOut, summary="Текущий пользователь", responses=AUTH_ERRORS)
def me(user: models.User = Depends(get_current_user)):
    return user
