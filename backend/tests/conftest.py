"""Общие фикстуры. По умолчанию тесты работают на временной SQLite-базе;
в CI интеграционные тесты запускаются на PostgreSQL (переменная TEST_DATABASE_URL)."""
import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

_tmp = Path(tempfile.gettempdir()) / f"traker_test_{os.getpid()}.db"
os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", f"sqlite:///{_tmp.as_posix()}")
os.environ["AUTO_MIGRATE"] = "0"
os.environ.setdefault("LOG_LEVEL", "WARNING")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

import models  # noqa: E402
from cache import cache  # noqa: E402
from database import Base, SessionLocal, engine  # noqa: E402
from main import app  # noqa: E402
from security import limiter  # noqa: E402

if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _sqlite_fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")  # в SQLite внешние ключи по умолчанию выключены


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    cache.invalidate()
    limiter.reset()
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(engine)


@pytest.fixture()
def db():
    session = SessionLocal()
    yield session
    session.close()


def register(client, username="alice", password="secret123"):
    r = client.post("/register", json={"username": username, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def login(client, username="alice", password="secret123") -> dict:
    r = client.post("/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def auth_headers(client, username="alice", role="client") -> dict:
    register(client, username)
    if role == "admin":
        session = SessionLocal()
        session.query(models.User).filter_by(username=username).update({"role": "admin"})
        session.commit()
        session.close()
    return {"Authorization": f"Bearer {login(client, username)['access_token']}"}


@pytest.fixture()
def user_headers(client):
    return auth_headers(client, "alice")


@pytest.fixture()
def admin_headers(client):
    return auth_headers(client, "root", role="admin")
