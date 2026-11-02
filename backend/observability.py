"""Логирование и мониторинг: структурированные логи (JSON), идентификатор запроса, метрики."""
import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from config import LOG_FORMAT, LOG_LEVEL
from metrics import HTTP_ERRORS, HTTP_IN_PROGRESS, HTTP_LATENCY, HTTP_REQUESTS

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Стандартные поля LogRecord — всё остальное из extra={...} попадает в JSON
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime", "request_id"}


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + f".{int(record.msecs):03d}",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        data.update({k: v for k, v in record.__dict__.items() if k not in _RESERVED})
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        extra = " ".join(f"{k}={v}" for k, v in record.__dict__.items() if k not in _RESERVED)
        base = f"{self.formatTime(record, '%H:%M:%S')} {record.levelname:<7} [{getattr(record, 'request_id', '-')}] {record.name}: {record.getMessage()}"
        text = f"{base} {extra}".rstrip()
        if record.exc_info:
            text += "\n" + self.formatException(record.exc_info)
        return text


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(JsonFormatter() if LOG_FORMAT == "json" else TextFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(LOG_LEVEL)
    # Свой журнал запросов ведёт middleware — стандартный access-лог uvicorn дублировал бы его
    logging.getLogger("uvicorn.access").disabled = True


access_log = logging.getLogger("traker.http")


def route_template(request: Request) -> str:
    """Шаблон маршрута (/tasks/{task_id}), а не конкретный путь — иначе метрики «взорвутся» по меткам."""
    route = request.scope.get("route")
    return getattr(route, "path", None) or "unmatched"


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        token = request_id_var.set(rid)
        start = time.perf_counter()
        HTTP_IN_PROGRESS.inc()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            HTTP_ERRORS.labels(route_template(request)).inc()
            access_log.exception("unhandled error", extra={"method": request.method, "path": request.url.path})
            raise
        finally:
            HTTP_IN_PROGRESS.dec()
            duration = time.perf_counter() - start
            route = route_template(request)
            if route != "/metrics":
                HTTP_REQUESTS.labels(request.method, route, str(status)).inc()
                HTTP_LATENCY.labels(request.method, route).observe(duration)
                level = logging.WARNING if status >= 500 or duration > 1 else logging.INFO
                access_log.log(level, "request", extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": status,
                    "duration_ms": round(duration * 1000, 1),
                    "client": request.client.host if request.client else "-",
                })
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        return response
