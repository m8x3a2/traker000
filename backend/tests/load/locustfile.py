"""Нагрузочное тестирование (Locust).

Запуск с веб-интерфейсом:   locust -f tests/load/locustfile.py --host http://localhost:8000
Без интерфейса (как в отчёте):
    locust -f tests/load/locustfile.py --host http://localhost:8000 --headless -u 50 -r 10 -t 60s --csv load_report

Перед запуском отключите ограничение частоты (RATE_LIMIT_ENABLED=0), иначе все пользователи
с одного IP быстро получат 429 — это проверяет отдельный сценарий BruteForceUser.
"""
import datetime as dt
import random
import uuid

from locust import HttpUser, between, task


class ClientUser(HttpUser):
    """Типичный клиент: открывает «Сегодня», задачи, дневник, таймер; создаёт задачи и отмечает привычки."""

    wait_time = between(0.5, 2)
    weight = 10

    def on_start(self):
        self.username = f"load_{uuid.uuid4().hex[:10]}"
        self.client.post("/register", json={"username": self.username, "password": "secret123"}, name="/register")
        tokens = self.client.post("/login", json={"username": self.username, "password": "secret123"}, name="/login").json()
        self.client.headers["Authorization"] = f"Bearer {tokens['access_token']}"
        habit = self.client.post("/habits", json={"title": "Нагрузка", "icon": "🏋️"}, name="/habits [POST]").json()
        self.habit_id = habit["id"]
        self.today = dt.date.today().isoformat()

    @task(5)
    def today_page(self):
        self.client.get("/stats", params={"today": self.today}, name="/stats")
        self.client.get("/habits", params={"today": self.today}, name="/habits")
        self.client.get("/tasks", params={"status": "active"}, name="/tasks")

    @task(3)
    def create_task(self):
        self.client.post("/tasks", json={"title": f"Задача {random.randint(1, 10_000)}", "priority": "high"}, name="/tasks [POST]")

    @task(2)
    def toggle_habit(self):
        day = (dt.date.today() - dt.timedelta(days=random.randint(0, 6))).isoformat()
        self.client.post(f"/habits/{self.habit_id}/logs", json={"date": day}, name="/habits/{id}/logs [POST]")

    @task(2)
    def diary_week(self):
        start = dt.date.today() - dt.timedelta(days=dt.date.today().weekday())
        self.client.get("/diary", params={"start": start.isoformat(), "end": (start + dt.timedelta(days=6)).isoformat()}, name="/diary")

    @task(2)
    def focus_page(self):
        self.client.get("/timers", name="/timers")
        self.client.get("/sounds", name="/sounds")

    @task(1)
    def catalog(self):
        self.client.get("/templates", name="/templates")


class GuestUser(HttpUser):
    """Гость: каталог (кэшируется) и список звуков."""

    wait_time = between(1, 3)
    weight = 3

    @task
    def catalog(self):
        self.client.get("/templates", name="/templates")
        self.client.get("/sounds", name="/sounds")
