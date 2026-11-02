"""Настройки приложения из переменных окружения (12-factor). Значения по умолчанию — для локальной разработки."""
import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# В продакшене обязательно задайте длинный случайный SECRET_KEY в файле .env
SECRET_KEY = os.getenv("SECRET_KEY", "traker000-change-me-to-a-long-random-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = _int("ACCESS_TOKEN_EXPIRE_MINUTES", 30)
REFRESH_TOKEN_EXPIRE_DAYS = _int("REFRESH_TOKEN_EXPIRE_DAYS", 14)

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Ограничение частоты запросов (запросов в минуту с одного IP)
RATE_LIMIT_ENABLED = _bool("RATE_LIMIT_ENABLED", True)
RATE_LIMIT_AUTH_PER_MINUTE = _int("RATE_LIMIT_AUTH_PER_MINUTE", 10)   # /login, /register, /refresh
RATE_LIMIT_API_PER_MINUTE = _int("RATE_LIMIT_API_PER_MINUTE", 600)    # все остальные запросы

# Кэширование
CACHE_ENABLED = _bool("CACHE_ENABLED", True)
CACHE_TTL_SECONDS = _int("CACHE_TTL_SECONDS", 300)

# Миграции: при запуске применять Alembic (alembic upgrade head)
AUTO_MIGRATE = _bool("AUTO_MIGRATE", True)

# Логирование: LOG_FORMAT=json (для Docker/сборщиков логов) или text (для разработки)
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv("LOG_FORMAT", "text")

# Звуки таймера, загружаемые администратором
SOUND_MAX_SECONDS = _int("SOUND_MAX_SECONDS", 10)
SOUND_MAX_BYTES = _int("SOUND_MAX_BYTES", 1024 * 1024)
