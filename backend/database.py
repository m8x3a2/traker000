import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Формат: postgresql+psycopg2://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@ХОСТ:ПОРТ/ИМЯ_БД
# Драйвер psycopg2 указан явно: SQLAlchemy 2.1+ для "postgresql://" по умолчанию ищет psycopg 3.
# Можно также задать переменную окружения DATABASE_URL — она имеет приоритет.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:password@localhost:5432/traker000",
)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


def get_db():
    """Зависимость FastAPI: открывает сессию БД на время запроса."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
