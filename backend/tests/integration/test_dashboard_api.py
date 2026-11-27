import datetime as dt

from tests.conftest import auth_headers


def test_dashboard_uses_only_my_active_data(client, user_headers):
    today = dt.date.today()
    date = today.isoformat()
    yesterday = (today - dt.timedelta(days=1)).isoformat()
    tomorrow = (today + dt.timedelta(days=1)).isoformat()
    bob = auth_headers(client, "bob")

    def post(path, payload, headers=user_headers):
        response = client.post(path, json=payload, headers=headers)
        assert response.status_code == 201, response.text
        return response.json()

    habit = post("/habits", {"title": "Чтение"})
    archived = post("/habits", {"title": "Архив", "archived": True})
    first = post(f"/habits/{habit['id']}/logs", {"date": date})
    assert post(f"/habits/{habit['id']}/logs", {"date": date}) == first
    post(f"/habits/{habit['id']}/logs", {"date": yesterday})
    post(f"/habits/{archived['id']}/logs", {"date": date})
    overdue = post("/tasks", {"title": "Просрочено", "due_date": yesterday})
    due = post("/tasks", {"title": "Сегодня", "due_date": date})
    post("/tasks", {"title": "Без срока"})
    post("/tasks", {"title": "Завтра", "due_date": tomorrow})
    post("/tasks", {"title": "Готово", "due_date": yesterday, "done": True})
    post("/tasks", {"title": "Чужое", "due_date": date}, bob)
    card = post("/diary", {"title": "Дневник", "date": date})
    undated = post("/diary", {"title": "Без даты"})

    response = client.get("/stats/dashboard", params={"today": date}, headers=user_headers)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    result = response.json()
    assert [h["id"] for h in result["habits"]] == result["completed_habit_ids"] == [habit["id"]]
    assert [t["id"] for t in result["tasks"]] == [overdue["id"], due["id"]]
    assert [c["id"] for c in result["diary"]] == [card["id"]]
    assert result["stats"] == {
        "habits_active": 1, "habits_done_today": 1, "best_streak": 2, "week_habit_rate": 29,
        "tasks_active": 4, "tasks_done": 1, "tasks_overdue": 1, "diary_cards": 2, "diary_cards_week": 1,
    }
    assert client.get("/stats", params={"today": date}, headers=user_headers).json() == result["stats"]
    assert client.get("/stats/dashboard").status_code == 401
    assert client.get("/stats/dashboard", params={"today": "tomorrow"}, headers=user_headers).status_code == 422
    assert client.get(f"/diary/{undated['id']}", headers=bob).status_code == 404

    exported = client.get("/export", headers=user_headers).json()
    assert [(c["title"], c["date"]) for c in exported["diary"]] == [("Дневник", date), ("Без даты", None)]
    assert client.post("/import", headers=bob, json=exported).status_code == 200
    cards = client.get("/diary", params={"no_date": True}, headers=bob).json()
    assert [c["title"] for c in cards] == ["Без даты"]
