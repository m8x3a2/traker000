from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

import models
from database import Base, SessionLocal, engine
from routers import admin, data, diary, habits, notes, settings, stats, tags, tasks, templates, users

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


def migrate():
    """Простейшая миграция для уже созданных БД: create_all не добавляет новые колонки
    в существующие таблицы. (В большом проекте для этого используют Alembic.)"""
    columns = {c["name"] for c in inspect(engine).get_columns("tasks")}
    if "position" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0"))
            # Начальный «свой порядок» = по дате добавления (новые сверху)
            conn.execute(text("UPDATE tasks SET position = -id"))


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
    Base.metadata.create_all(bind=engine)  # таблицы создаются автоматически
    migrate()
    seed_templates()
    yield


app = FastAPI(
    title="Traker000 API",
    description="Трекер привычек, задач, дневник по дням недели и заметка. REST API.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (users, settings, notes, templates, habits, tasks, tags, diary, stats, data, admin):
    app.include_router(module.router)


@app.get("/", tags=["Служебное"])
def root():
    return {"app": "traker000", "docs": "/docs"}
