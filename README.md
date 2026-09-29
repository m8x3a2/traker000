# Traker000 — трекер привычек, задач и дневник

Веб-приложение для личной продуктивности:

- **Привычки** — отметки по дням недели и серии выполнения 🔥.
- **Задачи** — сроки, приоритеты, теги, фильтры, свой порядок перетаскиванием.
- **Дневник** — неделя (Пн–Вс), где в каждом дне видны задачи и записи-карточки с описанием; всё перетаскивается мышкой между днями, есть колонка «Без срока».
- **Заметки** — **одна** заметка-«плашка» вместо сотни разрозненных.
- Тёмная (по умолчанию), светлая и своя тема, экспорт и импорт данных, административная панель.

Архитектура: **монолитный бэкенд с REST API** (FastAPI) + **SPA-фронтенд** (React) + **PostgreSQL**.

---

## Стек технологий

| Слой | Технологии |
|------|------------|
| Backend | Python 3.10+ (проверено на 3.14), FastAPI, SQLAlchemy (ORM) |
| База данных | PostgreSQL |
| Frontend | React 18 + Vite, чистый CSS (без UI-библиотек) |
| Аутентификация | JWT-токены (python-jose, HS256, 60 минут), bcrypt (passlib) |
| Валидация | Pydantic v2 |

---

## Роли пользователей

| Роль | Возможности |
|------|-------------|
| **Гость** (`guest`, без входа) | Главная страница с описанием, просмотр каталога привычек, смена темы (сохраняется в браузере) |
| **Клиент** (`client`, по умолчанию) | Всё, что гостю + свои привычки, задачи, теги, дневник, заметка, статистика, тема в аккаунте, экспорт/импорт |
| **Администратор** (`admin`) | Всё, что клиенту + статистика системы, управление пользователями и их ролями, управление каталогом привычек |

Новый пользователь регистрируется как `client`. Стать `admin` можно через SQL (см. ниже) или если другой администратор повысит роль в админ-панели.

---

## Структура проекта

```
traker000/
├── backend/
│   ├── main.py              # Точка входа FastAPI, CORS, подключение роутеров, наполнение каталога
│   ├── database.py          # Подключение к PostgreSQL
│   ├── models.py            # SQLAlchemy модели (ORM)
│   ├── schemas.py           # Pydantic схемы валидации
│   ├── auth.py              # JWT, bcrypt, get_current_user / require_admin
│   ├── utils.py             # Расчёт серии привычки, проверка диапазона дат
│   ├── requirements.txt
│   └── routers/             # Эндпоинты, сгруппированные по ресурсам
│       ├── users.py         # /register, /login, /me
│       ├── settings.py      # /settings (тема)
│       ├── notes.py         # /note
│       ├── templates.py     # /templates (публичный каталог)
│       ├── habits.py        # /habits, /habits/{id}/logs
│       ├── tasks.py         # /tasks
│       ├── tags.py          # /tags
│       ├── diary.py         # /diary, /diary/{id}/move
│       ├── stats.py         # /stats
│       ├── data.py          # /export, /import
│       └── admin.py         # /admin/...
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx         # Точка входа React
        ├── App.jsx          # Боковое меню, навигация, состояние авторизации
        ├── api.js           # fetch-обёртка: токен, ошибки, 401 → выход
        ├── theme.js         # Тёмная/светлая/своя тема через CSS-переменные
        ├── dates.js         # Работа с датами и неделями
        ├── styles.css
        ├── components/
        │   ├── Modal.jsx    # Модальное окно и диалог подтверждения
        │   ├── TaskEditor.jsx # Окно задачи (общее для «Задач» и «Дневника»)
        │   └── IconPicker.jsx # Выбор иконки привычки
        └── pages/
            ├── Today.jsx    # «Сегодня»: статистика, привычки и задачи дня, быстрая запись в дневник
            ├── Habits.jsx   # Привычки: сетка по дням недели
            ├── Tasks.jsx    # Задачи, фильтры, теги
            ├── Week.jsx     # Дневник: неделя, задачи и записи по дням, «Без срока», drag & drop, поиск
            ├── Notes.jsx    # Одна заметка с автосохранением
            ├── Catalog.jsx  # Каталог привычек (+ приветствие для гостя)
            ├── Settings.jsx # Тема, экспорт/импорт
            ├── Admin.jsx    # Админ-панель
            ├── Login.jsx
            └── Register.jsx
```

---

## Установка и запуск

### Требования

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+ (pgAdmin 4 — по желанию)

### 1. Создать базу данных

В pgAdmin 4 (Query Tool) или psql:

```sql
CREATE DATABASE traker000;
```

### 2. Настроить подключение к БД

В `backend/database.py` укажите свой пароль:

```python
DATABASE_URL = "postgresql+psycopg2://postgres:ВАШ_ПАРОЛЬ@localhost:5432/traker000"
```

(или задайте переменную окружения `DATABASE_URL`).

> Приписка `+psycopg2` обязательна: SQLAlchemy 2.1+ для `postgresql://` по умолчанию ищет другой драйвер (psycopg 3) и падает с ошибкой `No module named 'psycopg'`.

### 3. Запуск бэкенда

```bash
cd backend

python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate

pip install -r requirements.txt

uvicorn main:app --reload
```

- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs` (кнопка **Authorize** — вставьте токен из `/login`)
- ReDoc: `http://localhost:8000/redoc`

> Таблицы создаются автоматически при первом запуске (`Base.metadata.create_all`), каталог привычек заполняется 8 стандартными шаблонами.

> Если PowerShell не даёт активировать venv: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### 4. Запуск фронтенда

Во втором терминале:

```bash
cd frontend
npm install
npm run dev
```

- Фронтенд: `http://localhost:5173`

---

## Создание первого администратора

1. Зарегистрируйтесь на сайте.
2. В pgAdmin (Query Tool, открытый на базе `traker000`) или в psql выполните:

```sql
UPDATE users SET role = 'admin' WHERE username = 'ваш_логин';
```

3. Выйдите и войдите снова — в меню появится пункт «🛡️ Админ».

---

## Схема базы данных

```
users
  id, username (unique), password (bcrypt), role (client | admin), created_at

user_settings          (one-to-one с users)
  user_id → users.id (PK), theme (dark | light | custom), custom_colors (JSON)

notes                  (one-to-one с users — одна заметка на пользователя)
  user_id → users.id (PK), content, updated_at

habit_templates        (каталог, создаёт admin)
  id, title, description, icon, category, created_at

habits                 (one-to-many: users → habits)
  id, user_id → users.id, template_id → habit_templates.id (nullable, SET NULL),
  title, description, icon, color, archived, created_at

habit_logs             (one-to-many: habits → habit_logs)
  id, habit_id → habits.id, date          UNIQUE(habit_id, date)

tasks                  (one-to-many: users → tasks)
  id, user_id → users.id, title, description, due_date, priority (low | medium | high),
  position, done, done_at, created_at

tags                   (one-to-many: users → tags)
  id, user_id → users.id, name, color     UNIQUE(user_id, name)

task_tags              (many-to-many: tasks ↔ tags)
  task_id → tasks.id, tag_id → tags.id

diary_cards            (one-to-many: users → diary_cards)
  id, user_id → users.id, date, position, title, text, color, created_at, updated_at
```

### Важные детали

- **Каскадное удаление**: при удалении пользователя удаляются все его данные; при удалении привычки — её отметки; при удалении задачи или тега — связи в `task_tags`.
- **Серия (streak)** — количество дней подряд с отметкой. Если сегодня ещё не отмечено, считается от вчера, чтобы серия не «сгорала» с утра.
- **Карточки дневника** — в одном дне может быть до 50 карточек, порядок внутри дня хранится в `position`. `PUT /diary/{id}/move` переносит карточку в другой день/на другое место и перенумеровывает карточки обоих дней.
- **Сортировка задач**: по дате добавления (новые сверху, по умолчанию), по сроку (задачи без срока — в конце, по дате добавления) или «свой порядок» (поле `position`, меняется перетаскиванием; новые задачи встают в начало). Выполненные всегда ниже невыполненных.
- **Задачи в дневнике** — показываются в дне, на который назначен срок. Перетаскивание в другой день меняет срок, в колонку «Без срока» — убирает его.
- **Архив привычек** — привычка скрывается из списка, но история отметок сохраняется.
- **Миграция**: при запуске `main.py` проверяет, есть ли в `tasks` колонка `position`, и добавляет её в уже существующую БД (`create_all` новые колонки в существующие таблицы не добавляет).
- Даты передаются в формате `YYYY-MM-DD` по локальному времени пользователя (параметр `today` в `/habits` и `/stats`).

---

## API — справочник эндпоинтов

### Публичные (гость)

| Метод | URL | Описание |
|-------|-----|----------|
| `POST` | `/register` | Регистрация (роль `client`) |
| `POST` | `/login` | Вход, возвращает JWT-токен |
| `GET` | `/templates` | Каталог привычек (`search=`, `category=`) |

### Клиент (требуется токен)

| Метод | URL | Описание |
|-------|-----|----------|
| `GET` | `/me` | Текущий пользователь |
| `GET` / `PUT` | `/settings` | Тема оформления |
| `GET` / `PUT` | `/note` | Единственная заметка |
| `GET` | `/habits` | Список привычек со стриками (`include_archived=`, `today=`) |
| `POST` | `/habits` | Создать привычку (можно с `template_id`) |
| `PUT` / `DELETE` | `/habits/{id}` | Изменить / удалить привычку |
| `GET` | `/habits/logs` | Отметки за период (`start=`, `end=`) |
| `POST` | `/habits/{id}/logs` | Отметить день `{ "date": "2026-09-29" }` |
| `DELETE` | `/habits/{id}/logs/{date}` | Снять отметку |
| `GET` | `/tasks` | Задачи (`status=all\|active\|done`, `tag_ids=1&tag_ids=2`, `tag_mode=any\|all`, `search=`, `due_from=`, `due_to=`, `no_due=true`, `sort=created\|due\|manual`) |
| `POST` | `/tasks` | Создать задачу |
| `GET` / `PUT` / `PATCH` / `DELETE` | `/tasks/{id}` | Получить / заменить / частично изменить / удалить |
| `PUT` | `/tasks/{id}/move` | Перетаскивание: `{ "before_id": 5 }` или `{ "after_id": 7 }`; с `"due_date"` — перенос на другой день (`null` — убрать срок) |
| `GET` / `POST` | `/tags` | Теги пользователя |
| `PUT` / `DELETE` | `/tags/{id}` | Изменить / удалить тег |
| `GET` | `/diary` | Карточки дневника за период (`start=`, `end=`, `search=`) |
| `POST` | `/diary` | Новая карточка `{ "date", "title", "text", "color" }` (в конец дня) |
| `GET` / `PUT` / `DELETE` | `/diary/{id}` | Получить / изменить / удалить карточку |
| `PUT` | `/diary/{id}/move` | Перетаскивание: `{ "date": "2026-09-30", "position": 0 }` |
| `GET` | `/stats` | Личная статистика (`today=`) |
| `GET` | `/export` | Все данные пользователя в JSON |
| `POST` | `/import` | Импорт из JSON — **заменяет** все текущие данные |

### Администратор

| Метод | URL | Описание |
|-------|-----|----------|
| `GET` | `/admin/stats` | Статистика системы |
| `GET` | `/admin/users` | Пользователи с количеством данных |
| `PUT` | `/admin/users/{id}/role` | Изменить роль (`client` / `admin`), себе — нельзя |
| `DELETE` | `/admin/users/{id}` | Удалить пользователя со всеми данными, себя — нельзя |
| `POST` | `/admin/templates` | Добавить шаблон в каталог |
| `PUT` / `DELETE` | `/admin/templates/{id}` | Изменить / удалить шаблон |

Коды ответов: `200` / `201` — успех, `204` — удалено, `400` — ошибка бизнес-логики, `401` — нет или истёк токен, `403` — нет прав, `404` — не найдено, `422` — ошибка валидации.

---

## Правила валидации

| Поле | Ограничение |
|------|-------------|
| Имя пользователя | 3–40 символов, без пробелов |
| Пароль | 6–40 символов |
| Название привычки / шаблона | 1–60 символов |
| Описание привычки / шаблона | до 300 символов |
| Цвет | формат `#RRGGBB` |
| Название задачи | 1–200 символов |
| Описание задачи | до 2000 символов |
| Приоритет | `low`, `medium`, `high` |
| Тег | 1–30 символов, приводится к нижнему регистру, уникален у пользователя, до 50 тегов |
| Заголовок карточки дневника | 1–100 символов |
| Описание карточки дневника | до 5000 символов |
| Карточек в одном дне | до 50 |
| Заметка | до 20 000 символов |
| Своя тема | обязательны все 6 цветов: `bg, surface, border, text, muted, accent` |
| Период запросов (`start`–`end`) | не больше 366 дней |

---

## Экспорт и импорт

- **Настройки → Экспорт в JSON** скачивает файл `traker000-ГГГГ-ММ-ДД.json`: привычки с отметками, задачи, теги, дневник, заметку и тему.
- **Импорт** показывает предупреждение и количество записей в файле. После подтверждения все текущие данные пользователя **заменяются** данными из файла. Файл сначала проверяется целиком (Pydantic), поэтому при ошибке данные не меняются.
- Принимаются и файлы старой версии: записи дневника без заголовка превращаются в карточки.

---

## Полезные SQL-команды

```sql
-- Назначить администратора
UPDATE users SET role = 'admin' WHERE username = 'логин';

-- Снять права администратора
UPDATE users SET role = 'client' WHERE username = 'логин';

-- Все пользователи
SELECT id, username, role, created_at FROM users;

-- Очистить ВСЕ данные
TRUNCATE task_tags, tasks, tags, habit_logs, habits, diary_cards, notes, user_settings, users, habit_templates RESTART IDENTITY CASCADE;

-- Удалить все данные пользователей, но оставить аккаунты и каталог
TRUNCATE task_tags, tasks, tags, habit_logs, habits, diary_cards RESTART IDENTITY CASCADE;

-- Таблица дневника из первой версии (больше не используется, можно удалить)
DROP TABLE IF EXISTS diary_entries;
```
