FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    LOG_FORMAT=json

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Приложение работает от непривилегированного пользователя
RUN useradd --create-home --uid 1000 app && chown -R app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"

# Миграции Alembic применяются при старте приложения (AUTO_MIGRATE=1)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
