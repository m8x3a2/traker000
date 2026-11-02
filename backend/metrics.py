"""Метрики Prometheus. Отдаются по GET /metrics, собираются Prometheus, отображаются в Grafana."""
from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS = Counter(
    "traker_http_requests_total", "Количество HTTP-запросов", ["method", "route", "status"]
)
HTTP_LATENCY = Histogram(
    "traker_http_request_duration_seconds",
    "Время обработки HTTP-запроса",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
HTTP_IN_PROGRESS = Gauge("traker_http_requests_in_progress", "Запросы в обработке")
HTTP_ERRORS = Counter("traker_http_exceptions_total", "Необработанные исключения", ["route"])
RATE_LIMITED = Counter("traker_rate_limited_total", "Запросы, отклонённые ограничителем частоты", ["scope"])
CACHE_REQUESTS = Counter("traker_cache_requests_total", "Обращения к серверному кэшу", ["cache", "result"])
LOGINS = Counter("traker_logins_total", "Попытки входа", ["result"])
USERS_TOTAL = Gauge("traker_users_total", "Пользователей в системе")
TIMER_PRESETS_TOTAL = Gauge("traker_timer_presets_total", "Шаблонов таймера в системе")
