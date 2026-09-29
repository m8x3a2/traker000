from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


def utcnow():
    return datetime.now(timezone.utc)


# many-to-many: tasks <-> tags
task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(40), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)  # bcrypt-хэш
    role = Column(String(20), nullable=False, default="client")  # client | admin
    created_at = Column(DateTime(timezone=True), default=utcnow)

    settings = relationship("UserSettings", uselist=False, back_populates="user", cascade="all, delete-orphan")
    note = relationship("Note", uselist=False, back_populates="user", cascade="all, delete-orphan")
    habits = relationship("Habit", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")
    diary_cards = relationship("DiaryCard", back_populates="user", cascade="all, delete-orphan")


class UserSettings(Base):
    """Настройки пользователя (one-to-one с users)."""

    __tablename__ = "user_settings"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme = Column(String(10), nullable=False, default="dark")  # dark | light | custom
    custom_colors = Column(JSON, nullable=True)  # {"bg": "#...", "surface": "#...", ...}

    user = relationship("User", back_populates="settings")


class Note(Base):
    """Единственная заметка-«плашка» пользователя (one-to-one с users)."""

    __tablename__ = "notes"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    content = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="note")


class HabitTemplate(Base):
    """Каталог готовых привычек — создаёт администратор, видят все."""

    __tablename__ = "habit_templates"

    id = Column(Integer, primary_key=True)
    title = Column(String(60), nullable=False)
    description = Column(String(300), nullable=False, default="")
    icon = Column(String(16), nullable=False, default="✅")
    category = Column(String(40), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Habit(Base):
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id = Column(Integer, ForeignKey("habit_templates.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(60), nullable=False)
    description = Column(String(300), nullable=False, default="")
    icon = Column(String(16), nullable=False, default="✅")
    color = Column(String(7), nullable=False, default="#7c5cff")
    archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="habits")
    logs = relationship("HabitLog", back_populates="habit", cascade="all, delete-orphan")


class HabitLog(Base):
    """Отметка «привычка выполнена в этот день»."""

    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "date", name="uq_habit_log_day"),)

    id = Column(Integer, primary_key=True)
    habit_id = Column(Integer, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False)

    habit = relationship("Habit", back_populates="logs")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tag_user_name"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(30), nullable=False)
    color = Column(String(7), nullable=False, default="#7c5cff")

    user = relationship("User", back_populates="tags")
    tasks = relationship("Task", secondary=task_tags, back_populates="tags")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    due_date = Column(Date, nullable=True)
    priority = Column(String(10), nullable=False, default="medium")  # low | medium | high
    position = Column(Integer, nullable=False, default=0)  # «свой порядок», меняется перетаскиванием
    done = Column(Boolean, nullable=False, default=False)
    done_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="tasks")
    tags = relationship("Tag", secondary=task_tags, back_populates="tasks")


class DiaryCard(Base):
    """Карточка («плашка») дневника: заголовок + описание. В одном дне может быть несколько,
    порядок внутри дня задаёт position (меняется перетаскиванием)."""

    __tablename__ = "diary_cards"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    position = Column(Integer, nullable=False, default=0)
    title = Column(String(100), nullable=False)
    text = Column(Text, nullable=False, default="")
    color = Column(String(7), nullable=False, default="#7c5cff")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="diary_cards")
