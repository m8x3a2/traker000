import time

from jose import jwt

import auth
from cache import TTLCache, make_etag
from config import ALGORITHM, SECRET_KEY
from security import SlidingWindowLimiter


def test_password_hash_is_salted():
    h1, h2 = auth.hash_password("secret123"), auth.hash_password("secret123")
    assert h1 != h2 and h1.startswith("$2b$")
    assert auth.verify_password("secret123", h1)
    assert not auth.verify_password("wrong", h1)


def test_access_token_has_type_and_expiry():
    payload = jwt.decode(auth.create_access_token({"sub": "bob"}), SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "bob" and payload["type"] == "access" and payload["exp"] > time.time()


def test_refresh_token_stored_as_hash():
    assert len(auth.hash_refresh_token("abc")) == 64
    assert auth.hash_refresh_token("abc") != auth.hash_refresh_token("abd")


def test_sliding_window_limiter():
    limiter = SlidingWindowLimiter(window_seconds=60)
    assert [limiter.hit("ip", 3) for _ in range(3)] == [0, 0, 0]
    assert limiter.hit("ip", 3) > 0      # четвёртый запрос — отказ, Retry-After > 0
    assert limiter.hit("other-ip", 3) == 0  # лимит считается отдельно для каждого клиента
    limiter.reset()
    assert limiter.hit("ip", 3) == 0


def test_ttl_cache_get_set_expire_invalidate():
    cache = TTLCache(ttl=60, enabled=True)
    calls = []
    value, hit = cache.get_or_set("templates:a", lambda: calls.append(1) or [1, 2])
    assert (value, hit) == ([1, 2], False)
    value, hit = cache.get_or_set("templates:a", lambda: calls.append(1) or [3])
    assert (value, hit) == ([1, 2], True) and len(calls) == 1

    cache.set("sounds:list", "x", ttl=-1)  # уже истёк
    assert cache.get("sounds:list") is None

    cache.set("templates:b", 1)
    cache.set("admin:stats", 2)
    cache.invalidate("templates:")
    assert cache.get("templates:a") is None and cache.get("templates:b") is None
    assert cache.get("admin:stats") == 2


def test_disabled_cache_never_hits():
    cache = TTLCache(enabled=False)
    cache.set("k", 1)
    assert cache.get("k") is None


def test_etag_is_stable_and_content_dependent():
    assert make_etag({"a": 1, "b": 2}) == make_etag({"b": 2, "a": 1})
    assert make_etag([1]) != make_etag([2])
