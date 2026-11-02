"""Механизмы защиты уровня HTTP: ограничение частоты запросов и заголовки безопасности."""
import threading
import time
from collections import deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config import RATE_LIMIT_API_PER_MINUTE, RATE_LIMIT_AUTH_PER_MINUTE, RATE_LIMIT_ENABLED
from metrics import RATE_LIMITED

AUTH_PATHS = {"/login", "/register", "/refresh"}


class SlidingWindowLimiter:
    """Скользящее окно: храним время последних запросов для каждого ключа (IP + группа)."""

    def __init__(self, window_seconds: int = 60):
        self.window = window_seconds
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int) -> int:
        """Регистрирует запрос. Возвращает 0, если можно, иначе — через сколько секунд повторить."""
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(q[0] + self.window - now) + 1)
            q.append(now)
            return 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    # За nginx реальный адрес клиента приходит в X-Forwarded-For (nginx перезаписывает заголовок)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if RATE_LIMIT_ENABLED and request.method != "OPTIONS" and not request.url.path.startswith(("/health", "/metrics")):
            scope = "auth" if request.url.path in AUTH_PATHS else "api"
            limit = RATE_LIMIT_AUTH_PER_MINUTE if scope == "auth" else RATE_LIMIT_API_PER_MINUTE
            retry = limiter.hit(f"{scope}:{client_ip(request)}", limit)
            if retry:
                RATE_LIMITED.labels(scope).inc()
                return JSONResponse(
                    status_code=429,
                    content={"detail": f"Слишком много запросов. Повторите через {retry} с"},
                    headers={"Retry-After": str(retry)},
                )
        return await call_next(request)


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        return response
