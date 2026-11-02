"""Кэширование.

1. Серверный кэш в памяти процесса с временем жизни (TTL) — для данных, которые читают часто,
   а меняют редко: каталог привычек, список звуков таймера, статистика системы для админа.
   При изменении данных соответствующие ключи сбрасываются (invalidate), поэтому устаревших
   ответов после правки нет; TTL — страховка на случай изменений в обход API.
2. HTTP-кэширование: ETag + Cache-Control. Если у клиента уже есть актуальная версия
   (заголовок If-None-Match совпадает с ETag), сервер отвечает 304 без тела.
"""
import hashlib
import json
import threading
import time
from typing import Any, Callable

from fastapi import Request, Response
from fastapi.encoders import jsonable_encoder

from config import CACHE_ENABLED, CACHE_TTL_SECONDS
from metrics import CACHE_REQUESTS


class TTLCache:
    def __init__(self, ttl: int = CACHE_TTL_SECONDS, enabled: bool = CACHE_ENABLED):
        self.ttl = ttl
        self.enabled = enabled
        self._data: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        if not self.enabled:
            return None
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires, value = item
            if expires < time.monotonic():
                del self._data[key]
                return None
            return value

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        if not self.enabled:
            return
        with self._lock:
            self._data[key] = (time.monotonic() + (ttl or self.ttl), value)

    def get_or_set(self, key: str, factory: Callable[[], Any], ttl: int | None = None) -> tuple[Any, bool]:
        """Возвращает (значение, hit). factory вызывается только при промахе."""
        value = self.get(key)
        hit = value is not None
        if not hit:
            value = factory()
            self.set(key, value, ttl)
        CACHE_REQUESTS.labels(key.split(":")[0], "hit" if hit else "miss").inc()
        return value, hit

    def invalidate(self, prefix: str = "") -> None:
        with self._lock:
            for key in [k for k in self._data if k.startswith(prefix)]:
                del self._data[key]


cache = TTLCache()


def make_etag(payload: Any) -> str:
    raw = json.dumps(jsonable_encoder(payload), sort_keys=True, ensure_ascii=False).encode()
    return '"' + hashlib.sha256(raw).hexdigest()[:32] + '"'


def etag_response(request: Request, response: Response, payload: Any, max_age: int = 60, hit: bool = False):
    """Ставит ETag/Cache-Control. Если версия у клиента актуальна — 304 без тела."""
    etag = make_etag(payload)
    headers = {"ETag": etag, "Cache-Control": f"public, max-age={max_age}", "X-Cache": "HIT" if hit else "MISS"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return payload
