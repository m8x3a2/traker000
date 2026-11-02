import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

import models
from config import ACCESS_TOKEN_EXPIRE_MINUTES, ALGORITHM, REFRESH_TOKEN_EXPIRE_DAYS, SECRET_KEY
from database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(data: dict, minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    to_encode["type"] = "access"
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_refresh_token(db: Session, user: models.User) -> str:
    """Случайный непрозрачный refresh-токен. В БД сохраняется только его хеш."""
    token = secrets.token_urlsafe(48)
    db.add(models.RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(token),
        expires_at=datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    return token


def use_refresh_token(db: Session, token: str) -> models.User:
    """Проверяет refresh-токен и отзывает его (ротация: каждый токен одноразовый).
    Повторное предъявление отозванного токена — признак кражи: отзываются все токены пользователя."""
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия истекла, войдите заново")
    row = db.query(models.RefreshToken).filter(models.RefreshToken.token_hash == hash_refresh_token(token)).first()
    if row is None:
        raise invalid
    if row.revoked:
        revoke_all_refresh_tokens(db, row.user_id)
        db.commit()
        raise invalid
    expires_at = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise invalid
    row.revoked = True
    return row.user


def revoke_all_refresh_tokens(db: Session, user_id: int) -> None:
    db.query(models.RefreshToken).filter(
        models.RefreshToken.user_id == user_id, models.RefreshToken.revoked.is_(False)
    ).update({"revoked": True})


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Требуется авторизация",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен недействителен или истёк, войдите заново",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = payload.get("sub")
    if not username or payload.get("type", "access") != "access":
        raise unauthorized
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise unauthorized
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ только для администраторов")
    return user
