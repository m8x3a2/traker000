import datetime as dt
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
THEME_COLOR_KEYS = ("bg", "surface", "border", "text", "muted", "accent")


def _strip(v):
    return v.strip() if isinstance(v, str) else v


def _check_hex(v: str) -> str:
    if not HEX_COLOR_RE.match(v):
        raise ValueError("Цвет должен быть в формате #RRGGBB")
    return v.lower()


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Пользователи и авторизация ----------

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=6, max_length=40)

    @field_validator("username", mode="before")
    @classmethod
    def strip_username(cls, v):
        return _strip(v)

    @field_validator("username")
    @classmethod
    def no_inner_spaces(cls, v: str) -> str:
        if " " in v:
            raise ValueError("Имя пользователя не должно содержать пробелов")
        return v


class UserLogin(BaseModel):
    username: str = Field(max_length=40)
    password: str = Field(max_length=40)

    @field_validator("username", mode="before")
    @classmethod
    def strip_username(cls, v):
        return _strip(v)


class Token(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int = Field(default=0, description="Время жизни access-токена, секунд")

    model_config = ConfigDict(json_schema_extra={"example": {
        "access_token": "eyJhbGciOiJIUzI1NiIs...", "refresh_token": "kq3V...Zs", "token_type": "bearer", "expires_in": 1800,
    }})


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


class ErrorOut(BaseModel):
    """Формат ошибки API (как у FastAPI). Для ошибок валидации (422) detail — список."""

    detail: str

    model_config = ConfigDict(json_schema_extra={"example": {"detail": "Задача не найдена"}})


class UserOut(ORMModel):
    id: int
    username: str
    role: str
    created_at: dt.datetime | None = None


class AdminUserOut(UserOut):
    habits_count: int = 0
    tasks_count: int = 0
    diary_count: int = 0


class RoleUpdate(BaseModel):
    role: Literal["client", "admin"]


# ---------- Настройки (тема) ----------

class SettingsBase(BaseModel):
    theme: Literal["dark", "light", "custom"] = "dark"
    custom_colors: dict[str, str] | None = None

    @field_validator("custom_colors")
    @classmethod
    def check_colors(cls, v):
        if v is None:
            return v
        unknown = [k for k in v if k not in THEME_COLOR_KEYS]
        if unknown:
            raise ValueError(f"Неизвестные ключи цветов: {', '.join(unknown)}")
        missing = [k for k in THEME_COLOR_KEYS if k not in v]
        if missing:
            raise ValueError(f"Не заданы цвета: {', '.join(missing)}")
        return {k: _check_hex(v[k]) for k in THEME_COLOR_KEYS}

    @model_validator(mode="after")
    def custom_theme_needs_colors(self):
        if self.theme == "custom" and not self.custom_colors:
            raise ValueError("Для своей темы нужно задать цвета")
        return self


class SettingsUpdate(SettingsBase):
    pass


class SettingsOut(SettingsBase, ORMModel):
    pass


# ---------- Заметка ----------

class NoteUpdate(BaseModel):
    content: str = Field(default="", max_length=20000)


class NoteOut(ORMModel):
    content: str
    updated_at: dt.datetime | None = None


# ---------- Каталог привычек (админ) ----------

class HabitTemplateIn(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    icon: str = Field(default="✅", min_length=1, max_length=16)
    category: str = Field(default="", max_length=40)

    @field_validator("title", "description", "icon", "category", mode="before")
    @classmethod
    def strip_fields(cls, v):
        return _strip(v)


class HabitTemplateOut(HabitTemplateIn, ORMModel):
    id: int


# ---------- Привычки ----------

class HabitBase(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=300)
    icon: str = Field(default="✅", min_length=1, max_length=16)
    color: str = "#7c5cff"
    archived: bool = False

    @field_validator("title", "description", "icon", mode="before")
    @classmethod
    def strip_fields(cls, v):
        return _strip(v)

    @field_validator("color")
    @classmethod
    def check_color(cls, v):
        return _check_hex(v)


class HabitIn(HabitBase):
    template_id: int | None = None


class HabitOut(HabitBase, ORMModel):
    id: int
    template_id: int | None = None
    created_at: dt.datetime | None = None
    streak: int = 0  # текущая серия дней подряд
    total: int = 0   # всего отметок


class HabitLogIn(BaseModel):
    date: dt.date


class HabitLogOut(ORMModel):
    habit_id: int
    date: dt.date


# ---------- Теги ----------

class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    color: str = "#7c5cff"

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, v):
        v = _strip(v)
        return v.lower() if isinstance(v, str) else v

    @field_validator("color")
    @classmethod
    def check_color(cls, v):
        return _check_hex(v)


class TagOut(TagIn, ORMModel):
    id: int


# ---------- Задачи ----------

Priority = Literal["low", "medium", "high"]


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    due_date: dt.date | None = None
    priority: Priority = "medium"
    done: bool = False

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_fields(cls, v):
        return _strip(v)


class TaskIn(TaskBase):
    tag_ids: list[int] = Field(default_factory=list, max_length=20)


class TaskPatch(BaseModel):
    """Частичное обновление: передаются только изменяемые поля."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    due_date: dt.date | None = None
    priority: Priority | None = None
    done: bool | None = None
    tag_ids: list[int] | None = Field(default=None, max_length=20)

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_fields(cls, v):
        return _strip(v)


class TaskMove(BaseModel):
    """Перетаскивание: указать соседа — перед кем (before_id) или после кого (after_id) встать.
    Если передан `due_date` — задача переносится на этот день (null — убрать срок);
    если поле не передано, срок не меняется."""

    before_id: int | None = None
    after_id: int | None = None
    due_date: dt.date | None = None

    @model_validator(mode="after")
    def only_one_anchor(self):
        if self.before_id is not None and self.after_id is not None:
            raise ValueError("Укажите только before_id или только after_id")
        return self


class TaskOut(ORMModel):
    id: int
    title: str
    description: str
    due_date: dt.date | None
    priority: str
    position: int = 0
    done: bool
    done_at: dt.datetime | None = None
    created_at: dt.datetime | None = None
    tags: list[TagOut] = []


# ---------- Дневник ----------

class DiaryCardBase(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    text: str = Field(default="", max_length=5000)
    color: str = "#7c5cff"

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v):
        return _strip(v)

    @field_validator("color")
    @classmethod
    def check_color(cls, v):
        return _check_hex(v)


class DiaryCardIn(DiaryCardBase):
    date: dt.date


class DiaryCardUpdate(DiaryCardBase):
    pass


class DiaryCardMove(BaseModel):
    """Перенос карточки: в какой день и на какое место (0 — в начало)."""

    date: dt.date
    position: int = Field(ge=0)


class DiaryCardOut(DiaryCardBase, ORMModel):
    id: int
    date: dt.date
    position: int
    created_at: dt.datetime | None = None
    updated_at: dt.datetime | None = None


# ---------- Статистика ----------

class StatsOut(BaseModel):
    habits_active: int
    habits_done_today: int
    best_streak: int
    week_habit_rate: int  # % выполнения привычек за последние 7 дней
    tasks_active: int
    tasks_done: int
    tasks_overdue: int
    diary_cards: int       # всего карточек в дневнике
    diary_cards_week: int  # карточек за последние 7 дней


class AdminStatsOut(BaseModel):
    users: int
    admins: int
    habits: int
    habit_logs: int
    tasks: int
    diary_cards: int
    templates: int
    timer_presets: int = 0
    timer_sounds: int = 0


# ---------- Фокус-таймер ----------

BUILTIN_SOUNDS = {"bell": "Колокольчик", "beep": "Сигнал", "gong": "Гонг"}
SOUND_RE = re.compile(r"^(none|bell|beep|gong|custom:\d{1,9})$")
MAX_BLOCK_SECONDS = 600 * 60 + 59  # 600 мин 59 сек


def _check_sound(v: str) -> str:
    if not SOUND_RE.match(v):
        raise ValueError("Звук: bell, beep, gong, none или custom:<id>")
    return v


class TimerBlock(BaseModel):
    title: str = Field(min_length=1, max_length=30)
    seconds: int = Field(ge=1, le=MAX_BLOCK_SECONDS)
    color: str = "#30a46c"

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v):
        return _strip(v)

    @field_validator("color")
    @classmethod
    def check_color(cls, v):
        return _check_hex(v)


class TimerPresetIn(BaseModel):
    title: str = Field(min_length=1, max_length=40)
    blocks: list[TimerBlock] = Field(min_length=1, max_length=20)
    break_seconds: int = Field(default=0, ge=0, le=3600, description="Перерыв между кругами")
    rounds: int = Field(default=1, ge=1, le=99)
    sound_start: str = "bell"
    sound_end: str = "gong"
    auto_continue: bool = Field(default=True, description="false — после звукового сигнала ждать нажатия «ОК»")
    auto_delay: int = Field(default=5, ge=0, le=60, description="Пауза перед автозапуском следующего шага, сек")
    voice: bool = Field(default=False, description="Озвучивать шаги и круги голосом")

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, v):
        return _strip(v)

    @field_validator("sound_start", "sound_end")
    @classmethod
    def check_sound(cls, v):
        return _check_sound(v)

    model_config = ConfigDict(json_schema_extra={"example": {
        "title": "Учёба", "rounds": 4, "break_seconds": 0,
        "blocks": [{"title": "Учёба", "seconds": 2700, "color": "#30a46c"},
                   {"title": "Разминка", "seconds": 600, "color": "#3e7bfa"}],
        "sound_start": "bell", "sound_end": "gong", "auto_continue": False, "auto_delay": 5, "voice": True,
    }})


class TimerPresetOut(TimerPresetIn, ORMModel):
    id: int
    position: int = 0
    total_seconds: int = 0  # полная длительность: блоки × круги + перерывы между кругами


class TimerSoundOut(ORMModel):
    id: int
    name: str
    content_type: str
    size: int
    duration_ms: int
    created_at: dt.datetime | None = None


class SoundOption(BaseModel):
    id: str  # bell | beep | gong | custom:<id>
    name: str
    builtin: bool
    url: str | None = None


# ---------- Экспорт / импорт ----------

class ExportHabit(HabitBase):
    logs: list[dt.date] = Field(default_factory=list, max_length=20000)


class ExportTask(TaskBase):
    tags: list[str] = Field(default_factory=list, max_length=20)


class ExportDiary(DiaryCardBase):
    date: dt.date

    @model_validator(mode="before")
    @classmethod
    def from_v1(cls, v):
        # Файлы версии 1: запись дня без заголовка — заголовком становится первая строка текста
        if isinstance(v, dict) and not v.get("title"):
            text = (v.get("text") or "").strip()
            v = {**v, "title": text.splitlines()[0][:100] if text else "Запись"}
        return v


class ExportData(BaseModel):
    app: Literal["traker000"] = "traker000"
    version: int = 3
    exported_at: dt.datetime | None = None
    settings: SettingsBase | None = None
    note: str = Field(default="", max_length=20000)
    habits: list[ExportHabit] = Field(default_factory=list, max_length=500)
    tags: list[TagIn] = Field(default_factory=list, max_length=200)
    tasks: list[ExportTask] = Field(default_factory=list, max_length=10000)
    diary: list[ExportDiary] = Field(default_factory=list, max_length=10000)
    timers: list[TimerPresetIn] | None = Field(default=None, max_length=100)  # None — файл старой версии

    @model_validator(mode="before")
    @classmethod
    def skip_empty_v1_diary(cls, v):
        # В версии 1 бывали записи только с настроением — их пропускаем
        if isinstance(v, dict) and isinstance(v.get("diary"), list):
            v = {**v, "diary": [d for d in v["diary"] if not isinstance(d, dict) or d.get("title") or d.get("text")]}
        return v

    @model_validator(mode="after")
    def check_consistency(self):
        tag_names = [t.name for t in self.tags]
        if len(tag_names) != len(set(tag_names)):
            raise ValueError("В файле повторяются названия тегов")
        known = set(tag_names)
        for task in self.tasks:
            task.tags = [_strip(n).lower() for n in task.tags]
            missing = [n for n in task.tags if n not in known]
            if missing:
                raise ValueError(f"Задача «{task.title}» ссылается на несуществующий тег: {missing[0]}")
        return self


class ImportResult(BaseModel):
    detail: str
    habits: int
    tasks: int
    tags: int
    diary: int
    timers: int = 0


# ---------- Служебное ----------

class HealthOut(BaseModel):
    status: Literal["ok", "error"]
    database: Literal["ok", "error"] | None = None
    version: str
    uptime_seconds: int
