import io
import wave

from tests.conftest import auth_headers

PRESET = {
    "title": "Учёба 45/10",
    "rounds": 4,
    "blocks": [{"title": "учёба", "seconds": 2700, "color": "#30a46c"},
               {"title": "ОТДЫХ-разминка", "seconds": 600, "color": "#3e7bfa"}],
    "auto_continue": False,
    "auto_delay": 5,
    "voice": True,
}


def make_wav(seconds: float, rate: int = 8000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(1)
        w.setframerate(rate)
        w.writeframes(b"\x80" * int(rate * seconds))
    return buf.getvalue()


def upload(client, headers, seconds=1.0, name="Мой сигнал"):
    return client.post(
        "/admin/sounds",
        headers=headers,
        data={"name": name, "duration_ms": "1"},
        files={"file": ("beep.wav", make_wav(seconds), "audio/wav")},
    )


def test_defaults_are_seeded_once(client, user_headers):
    first = client.get("/timers", headers=user_headers).json()
    assert [p["title"] for p in first] == ["Помодоро", "52/17", "Учёба"]
    # Удалённый стандартный шаблон не возвращается сам при следующем запросе
    client.delete(f"/timers/{first[0]['id']}", headers=user_headers)
    assert len(client.get("/timers", headers=user_headers).json()) == 2
    # …но его можно вернуть кнопкой «Стандартные шаблоны»
    restored = client.post("/timers/defaults", headers=user_headers).json()
    assert sorted(p["title"] for p in restored) == ["52/17", "Помодоро", "Учёба"]


def test_preset_crud(client, user_headers):
    r = client.post("/timers", json=PRESET, headers=user_headers)
    assert r.status_code == 201
    preset = r.json()
    assert preset["total_seconds"] == 4 * 3300 and preset["auto_continue"] is False

    r = client.put(f"/timers/{preset['id']}", json={**PRESET, "rounds": 2, "auto_continue": True, "auto_delay": 10},
                   headers=user_headers)
    assert r.status_code == 200 and r.json()["rounds"] == 2 and r.json()["auto_delay"] == 10

    assert client.delete(f"/timers/{preset['id']}", headers=user_headers).status_code == 204
    assert client.delete(f"/timers/{preset['id']}", headers=user_headers).status_code == 404


def test_preset_validation_and_ownership(client, user_headers):
    assert client.post("/timers", json={**PRESET, "blocks": []}, headers=user_headers).status_code == 422
    assert client.post("/timers", json={**PRESET, "sound_end": "custom:999"}, headers=user_headers).status_code == 400
    preset = client.post("/timers", json=PRESET, headers=user_headers).json()
    bob = auth_headers(client, "bob")
    assert client.put(f"/timers/{preset['id']}", json=PRESET, headers=bob).status_code == 404
    assert client.get("/timers").status_code == 401


def test_sounds_list_has_three_builtin(client):
    r = client.get("/sounds")
    assert r.status_code == 200
    assert [s["id"] for s in r.json()] == ["bell", "beep", "gong"]


def test_admin_uploads_sound_and_user_selects_it(client, admin_headers, user_headers):
    r = upload(client, admin_headers, seconds=1.5)
    assert r.status_code == 201, r.text
    sound = r.json()
    assert sound["duration_ms"] == 1500  # для WAV длительность проверяет сервер, а не браузер

    ids = [s["id"] for s in client.get("/sounds").json()]
    assert f"custom:{sound['id']}" in ids  # кэш списка сброшен после загрузки

    preset = client.post("/timers", json={**PRESET, "sound_end": f"custom:{sound['id']}"}, headers=user_headers)
    assert preset.status_code == 201

    f = client.get(f"/sounds/{sound['id']}/file")
    assert f.status_code == 200 and f.headers["content-type"] == "audio/wav"
    assert client.get(f"/sounds/{sound['id']}/file", headers={"If-None-Match": f.headers["etag"]}).status_code == 304

    # Удаление звука: шаблоны переключаются на стандартный
    assert client.delete(f"/admin/sounds/{sound['id']}", headers=admin_headers).status_code == 204
    p = client.get("/timers", headers=user_headers).json()
    assert all(not x["sound_end"].startswith("custom:") for x in p)


def test_sound_upload_limits(client, admin_headers, user_headers):
    assert upload(client, admin_headers, seconds=11).status_code == 400  # длиннее 10 секунд
    assert upload(client, user_headers).status_code == 403
    r = client.post("/admin/sounds", headers=admin_headers, data={"name": "x", "duration_ms": "100"},
                    files={"file": ("a.txt", b"hello", "text/plain")})
    assert r.status_code == 415


def test_export_import_with_timers(client, user_headers):
    client.get("/timers", headers=user_headers)  # стандартные шаблоны появляются при первом открытии
    client.post("/timers", json=PRESET, headers=user_headers)
    exported = client.get("/export", headers=user_headers).json()
    assert exported["version"] == 3 and len(exported["timers"]) == 4  # 3 стандартных + свой

    bob = auth_headers(client, "bob")
    r = client.post("/import", json=exported, headers=bob)
    assert r.status_code == 200 and r.json()["timers"] == 4
    assert [p["title"] for p in client.get("/timers", headers=bob).json()][-1] == PRESET["title"]


def test_import_of_old_file_keeps_timers(client, user_headers):
    client.post("/timers", json=PRESET, headers=user_headers)
    r = client.post("/import", json={"app": "traker000", "version": 2, "tasks": [{"title": "old"}]}, headers=user_headers)
    assert r.status_code == 200
    assert any(p["title"] == PRESET["title"] for p in client.get("/timers", headers=user_headers).json())
