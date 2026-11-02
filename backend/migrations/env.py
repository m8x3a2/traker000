"""Окружение Alembic: подключение берётся из database.py, метаданные — из models.py (для --autogenerate)."""
import logging.config

from alembic import context

import models  # noqa: F401 — регистрирует все таблицы в Base.metadata
from database import Base, engine

config = context.config
# При запуске из командной строки — логирование из alembic.ini; при запуске из приложения — его настройки
if config.config_file_name and not config.attributes.get("embedded"):
    logging.config.fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """alembic upgrade head --sql — вывести SQL без подключения к БД."""
    context.configure(url=str(engine.url), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=connection.dialect.name == "sqlite",  # ALTER TABLE в SQLite через пересоздание
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
