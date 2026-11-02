import security
from tests.conftest import auth_headers, login, register


def test_register_login_me(client):
    register(client)
    tokens = login(client)
    assert tokens["token_type"] == "bearer" and tokens["refresh_token"] and tokens["expires_in"] == 1800
    r = client.get("/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.status_code == 200 and r.json()["role"] == "client"


def test_duplicate_and_invalid_registration(client):
    register(client)
    assert client.post("/register", json={"username": "alice", "password": "secret123"}).status_code == 400
    assert client.post("/register", json={"username": "al", "password": "secret123"}).status_code == 422


def test_wrong_password_and_missing_token(client):
    register(client)
    r = client.post("/login", json={"username": "alice", "password": "nope-nope"})
    assert r.status_code == 401 and r.json()["detail"] == "Неверное имя пользователя или пароль"
    assert client.get("/tasks").status_code == 401
    assert client.get("/tasks", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_refresh_rotation_and_reuse_detection(client):
    register(client)
    first = login(client)["refresh_token"]

    r = client.post("/refresh", json={"refresh_token": first})
    assert r.status_code == 200
    second = r.json()["refresh_token"]
    assert second != first
    assert client.get("/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).status_code == 200

    # Повторное использование старого токена — признак кражи: отзываются все токены пользователя
    assert client.post("/refresh", json={"refresh_token": first}).status_code == 401
    assert client.post("/refresh", json={"refresh_token": second}).status_code == 401


def test_logout_revokes_refresh_token(client):
    register(client)
    refresh = login(client)["refresh_token"]
    assert client.post("/logout", json={"refresh_token": refresh}).status_code == 204
    assert client.post("/refresh", json={"refresh_token": refresh}).status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(client):
    register(client)
    refresh = login(client)["refresh_token"]
    assert client.get("/me", headers={"Authorization": f"Bearer {refresh}"}).status_code == 401


def test_login_rate_limit(client, monkeypatch):
    monkeypatch.setattr(security, "RATE_LIMIT_AUTH_PER_MINUTE", 3)
    codes = [client.post("/login", json={"username": "x" * 3, "password": "y" * 6}).status_code for _ in range(4)]
    assert codes == [401, 401, 401, 429]
    r = client.post("/login", json={"username": "xxx", "password": "yyyyyy"})
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0


def test_ownership_and_roles(client):
    alice = auth_headers(client, "alice")
    bob = auth_headers(client, "bob")
    task = client.post("/tasks", json={"title": "secret"}, headers=alice).json()
    assert client.get(f"/tasks/{task['id']}", headers=bob).status_code == 404
    assert client.get("/admin/users", headers=alice).status_code == 403


def test_admin_cannot_demote_self(client, admin_headers):
    me = client.get("/me", headers=admin_headers).json()
    r = client.put(f"/admin/users/{me['id']}/role", json={"role": "client"}, headers=admin_headers)
    assert r.status_code == 400
