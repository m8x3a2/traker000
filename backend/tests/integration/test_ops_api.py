"""Кэширование, мониторинг, логирование, заголовки безопасности, документация, миграции."""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

from database import Base, engine
from main import run_migrations


def test_templates_etag_and_server_cache(client, admin_headers):
    r1 = client.get("/templates")
    assert r1.status_code == 200 and len(r1.json()) == 8
    assert r1.headers["x-cache"] == "MISS" and "max-age" in r1.headers["cache-control"]

    r2 = client.get("/templates")
    assert r2.headers["x-cache"] == "HIT" and r2.headers["etag"] == r1.headers["etag"]

    r3 = client.get("/templates", headers={"If-None-Match": r1.headers["etag"]})
    assert r3.status_code == 304 and r3.content == b""

    # Изменение каталога сбрасывает кэш — новые данные видны сразу
    client.post("/admin/templates", json={"title": "Растяжка", "category": "Здоровье"}, headers=admin_headers)
    r4 = client.get("/templates")
    assert r4.headers["x-cache"] == "MISS" and len(r4.json()) == 9 and r4.headers["etag"] != r1.headers["etag"]


def test_admin_stats_cached(client, admin_headers):
    assert client.get("/admin/stats", headers=admin_headers).headers["x-cache"] == "MISS"
    r = client.get("/admin/stats", headers=admin_headers)
    assert r.headers["x-cache"] == "HIT" and r.json()["users"] == 1


def test_health_ready_metrics(client):
    assert client.get("/health").json()["status"] == "ok"
    ready = client.get("/health/ready").json()
    assert ready["database"] == "ok" and ready["version"] == "2.0.0"

    client.get("/templates")
    text = client.get("/metrics").text
    assert 'traker_http_requests_total{method="GET",route="/templates",status="200"}' in text
    assert "traker_http_request_duration_seconds_bucket" in text
    assert "traker_users_total" in text


def test_request_id_and_security_headers(client):
    r = client.get("/health", headers={"X-Request-ID": "abc123"})
    assert r.headers["x-request-id"] == "abc123"
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert len(client.get("/health").headers["x-request-id"]) == 12  # сгенерирован сервером


def test_request_is_logged_with_request_id(client, caplog):
    caplog.set_level(logging.INFO, logger="traker.http")
    client.get("/templates", headers={"X-Request-ID": "req-42"})
    record = next(r for r in caplog.records if r.name == "traker.http")
    assert record.status == 200 and record.path == "/templates" and record.request_id == "req-42"


def test_openapi_documents_errors_and_tags(client):
    spec = client.get("/openapi.json").json()
    assert spec["info"]["version"] == "2.0.0"
    assert {"Фокус-таймер", "Звуки таймера", "Служебное"} <= {t["name"] for t in spec["tags"]}
    login = spec["paths"]["/login"]["post"]
    assert {"401", "422", "429"} <= set(login["responses"])
    assert spec["paths"]["/timers"]["get"]["summary"] == "Мои шаблоны таймера"


def test_alembic_migrations_up_and_down(client):
    """Миграции создают ту же схему, что и модели, и корректно откатываются."""
    Base.metadata.drop_all(engine)
    run_migrations()
    from sqlalchemy import inspect
    tables = set(inspect(engine).get_table_names())
    assert {"timer_presets", "timer_sounds", "refresh_tokens", "alembic_version"} <= tables

    cfg = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    cfg.attributes["embedded"] = True
    command.check(cfg)  # модели совпадают с миграциями
    command.downgrade(cfg, "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    Base.metadata.create_all(engine)
