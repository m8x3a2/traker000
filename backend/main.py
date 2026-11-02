import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import Depends, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import models
import schemas
from config import AUTO_MIGRATE, CORS_ORIGINS, SECRET_KEY
from database import Base, SessionLocal, engine, get_db
from docs import DESCRIPTION, OPENAPI_TAGS
from metrics import TIMER_PRESETS_TOTAL, USERS_TOTAL
from observability import ObservabilityMiddleware, setup_logging
from routers import admin, data, diary, habits, notes, settings, sounds, stats, tags, tasks, templates, timers, users
from security import RateLimitMiddleware, SecurityHeadersMiddleware

VERSION = "2.0.0"
STARTED_AT = time.monotonic()

setup_logging()
log = logging.getLogger("traker")

DEFAULT_TEMPLATES = [
    ("Пить воду", "8 стаканов воды в течение дня", "💧", "Здоровье"),
    ("Зарядка", "10–15 минут упражнений утром", "🏃", "Здоровье"),
    ("Сон до 23:00", "Ложиться спать вовремя", "😴", "Здоровье"),
    ("Чтение", "Прочитать хотя бы 20 страниц", "📚", "Развитие"),
    ("Английский", "15 минут практики языка", "🗣️", "Развитие"),
    ("Медитация", "10 минут тишины и дыхания", "🧘", "Спокойствие"),
    ("Без соцсетей до обеда", "Не открывать ленту до 12:00", "📵", "Спокойствие"),
    ("Планирование дня", "Записать 3 главные задачи на день", "🎯", "Продуктивность"),
]


def run_migrations() -> None:
    """Применяет миграции Alembic (alembic upgrade head).

    База, созданная первой версией приложения через create_all, ещё не знает об Alembic:
    в ней нет таблицы alembic_version. Такую базу сначала приводим к схеме ревизии 0001
    (колонка tasks.position) и помечаем как 0001 (stamp), затем применяем остальные миграции."""
    cfg = Config(str(Path(__file__).with_name("alembic.ini")))
    cfg.attributes["embedded"] = True
    tables = inspect(engine).get_table_names()
    if "users" in tables and "alembic_version" not in tables:
        columns = {c["name"] for c in inspect(engine).get_columns("tasks")}
        if "position" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0"))
                conn.execute(text("UPDATE tasks SET position = -id"))
        log.info("legacy database detected, stamping revision 0001")
        command.stamp(cfg, "0001")
    command.upgrade(cfg, "head")


def seed_templates():
    """Заполняет каталог привычек при первом запуске."""
    db = SessionLocal()
    try:
        if db.query(models.HabitTemplate).count() == 0:
            db.add_all(
                models.HabitTemplate(title=t, description=d, icon=i, category=c)
                for t, d, i, c in DEFAULT_TEMPLATES
            )
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if AUTO_MIGRATE:
        run_migrations()
    else:
        Base.metadata.create_all(bind=engine)  # тесты и быстрый локальный запуск без Alembic
    seed_templates()
    if SECRET_KEY.startswith("traker000-change-me"):
        log.warning("SECRET_KEY is default — set it in .env for production")
    log.info("application started", extra={"version": VERSION})
    yield


app = FastAPI(
    title="Traker000 API",
    description=DESCRIPTION,
    version=VERSION,
    openapi_tags=OPENAPI_TAGS,
    contact={"name": "Команда Traker000, ЭФБО-17-24", "url": "https://github.com/m8x3a2/traker000"},
    lifespan=lifespan,
)

# Последний добавленный middleware — внешний: журнал запросов видит всё, CORS-заголовки
# получают и ответы 429 от ограничителя частоты.
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Cache", "ETag", "Retry-After"],
)
app.add_middleware(ObservabilityMiddleware)

for module in (users, settings, notes, templates, habits, tasks, tags, diary, timers, sounds, stats, data, admin):
    app.include_router(module.router)
app.include_router(sounds.admin_router)


@app.get("/", tags=["Служебное"], summary="О сервисе")
def root():
    return {"app": "traker000", "version": VERSION, "docs": "/docs"}


def health_payload(database: str | None = None) -> schemas.HealthOut:
    return schemas.HealthOut(
        status="ok" if database != "error" else "error",
        database=database,
        version=VERSION,
        uptime_seconds=int(time.monotonic() - STARTED_AT),
    )


@app.get("/health", response_model=schemas.HealthOut, tags=["Служебное"], summary="Проверка живости (liveness)")
def health():
    """Процесс жив и отвечает. Используется Docker healthcheck."""
    return health_payload()


@app.get(
    "/health/ready", response_model=schemas.HealthOut, tags=["Служебное"], summary="Готовность (readiness)",
    responses={503: {"model": schemas.HealthOut, "description": "База данных недоступна"}},
)
def ready(db: Session = Depends(get_db)):
    """Проверяет соединение с базой данных запросом SELECT 1."""
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        log.exception("database is not reachable")
        return JSONResponse(status_code=503, content=health_payload("error").model_dump())
    return health_payload("ok")


@app.get("/metrics", tags=["Служебное"], summary="Метрики Prometheus", response_class=Response)
def metrics(db: Session = Depends(get_db)):
    USERS_TOTAL.set(db.query(models.User).count())
    TIMER_PRESETS_TOTAL.set(db.query(models.TimerPreset).count())
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
