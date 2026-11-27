import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { DAY_FULL, DAY_SHORT, addDays, formatDate, fromISO, startOfWeek, toISO, todayISO, weekDates, weekLabel } from '../dates'
import Modal, { ConfirmDialog } from '../components/Modal'
import TaskEditor, { PRIORITIES } from '../components/TaskEditor'
import Checkbox from '../components/Checkbox'
import { beginDrag, indexAt } from '../dnd'

export const CARD_COLORS = ['#7c5cff', '#3b82f6', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b93a7']

// Ключ колонки: дата или 'none' для колонки «Без даты»
const colKey = (date) => date ?? 'none'

const ITEM_SELECTOR = ':scope > [data-sort-id]'

// Режим просмотра (неделя / один день) запоминается в браузере
const VIEW_KEY = 'traker_diary_view'
const readView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'day' ? 'day' : 'week' } catch { return 'week' }
}

// Куда встанет перетаскиваемый элемент под курсором: { zone: 'task:2026-09-30' | 'card:none' | …, index }
function hitTest(type, id, x, y) {
  const el = document.elementFromPoint(x, y)
  const list = el?.closest(`[data-zone^="${type}:"]`)
  if (list) return { zone: list.dataset.zone, index: indexAt(list, y, ITEM_SELECTOR, id) }
  // Курсор над колонкой, но не над списком — элемент встаёт в конец нужного списка
  const colList = el?.closest('[data-col]')?.querySelector(`[data-zone^="${type}:"]`)
  if (!colList) return null
  return { zone: colList.dataset.zone, index: indexAt(colList, Infinity, ITEM_SELECTOR, id) }
}

// Вставляет item в массив рядом с соседом (before/after) — так же, как это делает сервер
function insertNear(list, item, { before_id, after_id }) {
  const result = list.filter((x) => x.id !== item.id)
  const anchor = before_id ?? after_id
  const i = anchor == null ? -1 : result.findIndex((x) => x.id === anchor)
  if (i === -1) result.push(item)
  else result.splice(before_id != null ? i : i + 1, 0, item)
  return result
}

// Дневник: неделя (Пн–Вс) или один день. В каждом дне — задачи с этим сроком, записи-карточки и привычки.
// Колонка «Без даты» — задачи без срока и заметки, которые ещё не привязаны к дню.
// Всё перетаскивается мышкой: внутри дня, между днями и в колонку «Без даты».
export default function Week() {
  const today = todayISO()
  const [view, setView] = useState(readView)
  const [day, setDay] = useState(today) // выбранный день; неделя — та, в которую он входит
  const [cards, setCards] = useState([])     // записи недели + заметки без даты (date = null)
  const [tasks, setTasks] = useState([])     // задачи со сроком на этой неделе
  const [backlog, setBacklog] = useState([]) // активные задачи без срока
  const [tags, setTags] = useState([])
  const [habits, setHabits] = useState([])
  const [habitLogs, setHabitLogs] = useState(new Set()) // «habitId|YYYY-MM-DD»
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(null) // { type: 'card' | 'task', id }
  const [hint, setHint] = useState(null) // { zone: 'task:2026-09-30' | 'task:none' | 'card:…', index }
  const [openedCard, setOpenedCard] = useState(null)
  const [openedTask, setOpenedTask] = useState(null)

  const weekStart = useMemo(() => startOfWeek(fromISO(day)), [day])
  const start = toISO(weekStart)
  const end = toISO(addDays(weekStart, 6))

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view) } catch { /* не критично */ }
  }, [view])

  const shift = (days) => setDay(toISO(addDays(fromISO(day), days)))
  const openDay = (iso) => { setDay(iso); setView('day') }

  const load = useCallback(async () => {
    try {
      const [diary, undated, t, noDue, tg, habitList, logs] = await Promise.all([
        api('/diary', { query: { start, end } }),
        api('/diary', { query: { no_date: true } }),
        api('/tasks', { query: { due_from: start, due_to: end, sort: 'manual' } }),
        api('/tasks', { query: { status: 'active', no_due: true, sort: 'manual' } }),
        api('/tags'),
        api('/habits', { query: { today } }),
        api('/habits/logs', { query: { start, end } }),
      ])
      setCards([...diary, ...undated])
      setTasks(t)
      setBacklog(noDue)
      setTags(tg)
      setHabits(habitList)
      setHabitLogs(new Set(logs.map((l) => `${l.habit_id}|${l.date}`)))
      setLoaded(true)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [start, end, today])

  useEffect(() => { load() }, [load])

  const cardsByDay = useMemo(() => {
    const map = {}
    for (const c of cards) (map[colKey(c.date)] ||= []).push(c)
    for (const list of Object.values(map)) list.sort((a, b) => a.position - b.position)
    return map
  }, [cards])

  const tasksByDay = useMemo(() => {
    const map = {}
    for (const t of tasks) (map[t.due_date] ||= []).push(t)
    return map
  }, [tasks])

  const endDrag = () => { setDrag(null); setHint(null) }

  // ---------- Записи и заметки (карточки) ----------

  // date = null — колонка «Без даты»
  const moveCard = async (cardId, date, index) => {
    const card = cards.find((c) => c.id === cardId)
    if (!card) return
    const others = cards.filter((c) => c.id !== cardId)
    const target = others.filter((c) => c.date === date).sort((a, b) => a.position - b.position)
    target.splice(index, 0, { ...card, date })
    const updated = new Map(target.map((c, i) => [c.id, { ...c, position: i }]))
    others
      .filter((c) => c.date === card.date && card.date !== date)
      .sort((a, b) => a.position - b.position)
      .forEach((c, i) => updated.set(c.id, { ...c, position: i }))
    setCards([...others.map((c) => updated.get(c.id) || c), updated.get(cardId)])
    try {
      await api(`/diary/${cardId}/move`, { method: 'PUT', body: { date, position: index } })
    } catch (e) {
      setError(e.message)
      load()
    }
  }

  const addCard = async (date, title) => {
    try {
      const card = await api('/diary', { method: 'POST', body: { date, title } })
      setCards((prev) => [...prev, card])
    } catch (e) { setError(e.message) }
  }

  const saveCard = async (edited) => {
    const { id, title, text, color, date } = edited
    const original = cards.find((c) => c.id === id)
    try {
      const saved = await api(`/diary/${id}`, { method: 'PUT', body: { title, text, color } })
      if (original && date !== original.date) {
        await api(`/diary/${id}/move`, { method: 'PUT', body: { date, position: 9999 } })
        await load()
      } else {
        setCards((prev) => prev.map((c) => (c.id === id ? saved : c)))
      }
      setOpenedCard(null)
    } catch (e) { setError(e.message) }
  }

  const deleteCard = async (card) => {
    try {
      await api(`/diary/${card.id}`, { method: 'DELETE' })
      setOpenedCard(null)
      await load()
    } catch (e) { setError(e.message) }
  }

  // ---------- Задачи ----------

  // date = null — колонка «Без даты»
  const moveTask = async (taskId, date, index) => {
    const task = tasks.find((t) => t.id === taskId) || backlog.find((t) => t.id === taskId)
    if (!task) return
    const zone = (date ? tasksByDay[date] || [] : backlog).filter((t) => t.id !== taskId)
    const anchor = index < zone.length ? { before_id: zone[index].id } : zone.length ? { after_id: zone[zone.length - 1].id } : {}
    const moved = { ...task, due_date: date }

    // Сразу показываем результат, потом сохраняем
    const restTasks = tasks.filter((t) => t.id !== taskId)
    const restBacklog = backlog.filter((t) => t.id !== taskId)
    if (date) {
      setTasks(insertNear(restTasks, moved, anchor))
      setBacklog(restBacklog)
    } else {
      setTasks(restTasks)
      setBacklog(insertNear(restBacklog, moved, anchor))
    }
    try {
      await api(`/tasks/${taskId}/move`, { method: 'PUT', body: { ...anchor, due_date: date } })
    } catch (e) {
      setError(e.message)
      load()
    }
  }

  const addTask = async (date, title) => {
    try {
      const task = await api('/tasks', { method: 'POST', body: { title, due_date: date } })
      if (date) setTasks((prev) => [...prev, task])
      else setBacklog((prev) => [...prev, task])
    } catch (e) { setError(e.message) }
  }

  const toggleTask = async (task) => {
    try {
      const saved = await api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: !task.done } })
      setTasks((prev) => prev.map((t) => (t.id === task.id ? saved : t)))
      setBacklog((prev) => prev.map((t) => (t.id === task.id ? saved : t)))
    } catch (e) { setError(e.message) }
  }

  // ---------- Привычки ----------

  const toggleHabit = async (habit, date) => {
    const key = `${habit.id}|${date}`
    const wasDone = habitLogs.has(key)
    setHabitLogs((prev) => {
      const next = new Set(prev)
      wasDone ? next.delete(key) : next.add(key)
      return next
    })
    try {
      if (wasDone) await api(`/habits/${habit.id}/logs/${date}`, { method: 'DELETE' })
      else await api(`/habits/${habit.id}/logs`, { method: 'POST', body: { date } })
    } catch (e) {
      setError(e.message)
      load()
    }
  }

  const goToCard = (card) => {
    if (card.date) setDay(card.date)
    setOpenedCard(card)
  }

  // ---------- Перетаскивание ----------

  const startDrag = (e, type, id) => beginDrag(e, {
    onStart: () => setDrag({ type, id }),
    onMove: (x, y) => {
      const h = hitTest(type, id, x, y)
      setHint((prev) => (prev?.zone === h?.zone && prev?.index === h?.index ? prev : h))
    },
    onDrop: (x, y) => {
      const h = hitTest(type, id, x, y)
      endDrag()
      if (!h) return
      const key = h.zone.slice(type.length + 1)
      const date = key === 'none' ? null : key
      if (type === 'task') moveTask(id, date, h.index)
      else moveCard(id, date, h.index)
    },
    onCancel: endDrag,
  })

  const dnd = { drag, hint, startDrag }
  const handlers = {
    onOpenCard: setOpenedCard,
    onOpenTask: setOpenedTask,
    onAddCard: addCard,
    onAddTask: addTask,
    onToggleTask: toggleTask,
    onToggleHabit: toggleHabit,
    onOpenDay: openDay,
  }

  const backlogColumn = (
    <DayColumn
      date={null}
      title="📥 Без даты"
      subtitle={String(backlog.length + (cardsByDay.none?.length || 0))}
      today={today}
      cards={cardsByDay.none || []}
      tasks={backlog}
      dnd={dnd}
      {...handlers}
    />
  )

  const dayColumn = (iso, i, large) => (
    <DayColumn
      key={iso}
      date={iso}
      large={large}
      title={large ? formatDate(fromISO(iso), { weekday: 'long', day: 'numeric', month: 'long' }) : DAY_FULL[i]}
      subtitle={iso === today ? 'сегодня' : large ? '' : formatDate(fromISO(iso))}
      isToday={iso === today}
      today={today}
      cards={cardsByDay[iso] || []}
      tasks={tasksByDay[iso] || []}
      habits={habits}
      habitLogs={habitLogs}
      dnd={dnd}
      {...handlers}
    />
  )

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1>Дневник</h1>
          <p className="subtitle">Задачи, записи и привычки по дням. Перетаскивайте мышкой между днями — у задачи поменяется срок. Клик — открыть.</p>
        </div>
        <div className="week-nav">
          <div className="tabs">
            <button className={`tab ${view === 'day' ? 'active' : ''}`} onClick={() => setView('day')}>День</button>
            <button className={`tab ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>Неделя</button>
          </div>
          <button className="btn btn-icon" onClick={() => shift(view === 'day' ? -1 : -7)} title={view === 'day' ? 'Предыдущий день' : 'Предыдущая неделя'}>‹</button>
          <span className="small week-nav-label">
            {view === 'day' ? formatDate(fromISO(day), { day: 'numeric', month: 'long', year: 'numeric' }) : weekLabel(weekStart)}
          </span>
          <button className="btn btn-icon" onClick={() => shift(view === 'day' ? 1 : 7)} title={view === 'day' ? 'Следующий день' : 'Следующая неделя'}>›</button>
          <button className="btn btn-sm" onClick={() => setDay(today)}>Сегодня</button>
        </div>
      </div>

      <DiarySearch onPick={goToCard} />

      {error && <div className="alert alert-error">{error}</div>}

      {loaded && view === 'week' && (
        <div className="week-grid">
          {weekDates(weekStart).map((d, i) => dayColumn(toISO(d), i, false))}
          {backlogColumn}
        </div>
      )}

      {loaded && view === 'day' && (
        <>
          <WeekStrip
            weekStart={weekStart}
            day={day}
            today={today}
            counts={(iso) => (tasksByDay[iso]?.length || 0) + (cardsByDay[iso]?.length || 0)}
            onPick={setDay}
          />
          <div className="day-view">
            {dayColumn(day, 0, true)}
            {backlogColumn}
          </div>
        </>
      )}

      {openedCard && (
        <CardEditor key={openedCard.id} card={openedCard} onSave={saveCard} onDelete={deleteCard} onClose={() => setOpenedCard(null)} />
      )}
      {openedTask && (
        <TaskEditor key={openedTask.id} task={openedTask} tags={tags} onChanged={load} onClose={() => setOpenedTask(null)} />
      )}
    </div>
  )
}

// ---------- Колонка дня (date = null — колонка «Без даты») ----------

function DayColumn({
  date, title, subtitle, isToday, large, today, cards, tasks, habits = [], habitLogs, dnd,
  onOpenCard, onOpenTask, onAddCard, onAddTask, onToggleTask, onToggleHabit, onOpenDay,
}) {
  const key = colKey(date)
  const backlog = date === null
  const isTarget = dnd.hint?.zone?.endsWith(`:${key}`)

  return (
    <div
      data-col={key}
      className={`card day-card ${isToday ? 'today' : ''} ${backlog ? 'backlog' : ''} ${large ? 'large' : ''} ${isTarget ? 'drop-target' : ''}`}
    >
      <div className="day-card-head">
        {backlog || large ? (
          <h3>{title}</h3>
        ) : (
          <button className="day-title-btn" onClick={() => onOpenDay(date)} title="Открыть только этот день">
            <h3>{title}</h3>
          </button>
        )}
        <span className="small muted">{subtitle}</span>
      </div>

      <div className="day-section-title">Задачи</div>
      <SortableList
        type="task"
        zone={`task:${key}`}
        items={tasks}
        dnd={dnd}
        renderItem={(t) => <TaskChip task={t} today={today} onOpen={onOpenTask} onToggle={onToggleTask} />}
      />

      <div className="day-section-title">{backlog ? 'Заметки' : 'Записи'}</div>
      <SortableList
        type="card"
        zone={`card:${key}`}
        items={cards}
        dnd={dnd}
        renderItem={(c) => <DiaryCardView card={c} onOpen={onOpenCard} />}
      />

      <QuickAdd
        cardLabel={backlog ? 'Заметка' : 'Запись'}
        onAddTask={(text) => onAddTask(date, text)}
        onAddCard={(text) => onAddCard(date, text)}
      />

      {backlog ? (
        <span className="small muted">Перетащите задачу или заметку в день, чтобы назначить дату</span>
      ) : habits.length > 0 && (
        <DayHabits key={date} date={date} today={today} defaultOpen={isToday || large} habits={habits} habitLogs={habitLogs} onToggle={onToggleHabit} />
      )}
    </div>
  )
}

// Привычки дня: прогресс, по клику — список с отметками прямо из дневника
function DayHabits({ date, today, defaultOpen, habits, habitLogs, onToggle }) {
  const [open, setOpen] = useState(defaultOpen)
  const done = habits.filter((h) => habitLogs.has(`${h.id}|${date}`)).length
  const future = date > today

  return (
    <div className="day-extras">
      <button className="day-habits-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Привычки {open ? '▾' : '▸'}</span>
        <span>{done}/{habits.length}</span>
      </button>
      <div className="progress"><div style={{ width: `${Math.round((done / habits.length) * 100)}%` }} /></div>
      {open && (
        <div className="day-habits">
          {habits.map((h) => (
            <Checkbox
              key={h.id}
              size="sm"
              className="strike"
              color={h.color}
              checked={habitLogs.has(`${h.id}|${date}`)}
              disabled={future}
              title={future ? 'Этот день ещё не наступил' : undefined}
              onChange={() => onToggle(h, date)}
              label={`${h.icon} ${h.title}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Список с перетаскиванием: принимает только элементы своего типа (задачи или записи).
// Куда встанет элемент, считает hitTest по атрибутам data-zone / data-sort-id.
function SortableList({ type, zone, items, dnd, renderItem }) {
  const { drag, hint, startDrag } = dnd
  const accepts = drag?.type === type
  const dropIndex = accepts && hint?.zone === zone ? hint.index : null

  const rendered = []
  let visibleIndex = 0
  for (const item of items) {
    const isDragged = accepts && item.id === drag.id
    if (!isDragged) {
      if (dropIndex === visibleIndex) rendered.push(<div key="drop" className="drop-line" />)
      visibleIndex++
    }
    rendered.push(
      <div
        key={item.id}
        data-sort-id={item.id}
        className={isDragged ? 'is-dragging' : undefined}
        onPointerDown={(e) => startDrag(e, type, item.id)}
      >
        {renderItem(item)}
      </div>,
    )
  }
  if (dropIndex === visibleIndex) rendered.push(<div key="drop" className="drop-line" />)

  return (
    <div data-zone={zone} className={`sortable ${accepts ? 'accepting' : ''}`}>
      {rendered}
      {items.length === 0 && dropIndex == null && <div className="diary-empty">{accepts ? 'Перетащите сюда' : 'Пусто'}</div>}
    </div>
  )
}

// Полоска дней недели в режиме «День»: быстрый переход и число дел в каждом дне
function WeekStrip({ weekStart, day, today, counts, onPick }) {
  return (
    <div className="week-strip">
      {weekDates(weekStart).map((d, i) => {
        const iso = toISO(d)
        const n = counts(iso)
        return (
          <button
            key={iso}
            className={`week-strip-day ${iso === day ? 'active' : ''} ${iso === today ? 'today' : ''}`}
            onClick={() => onPick(iso)}
          >
            <span className="small">{DAY_SHORT[i]}</span>
            <b>{d.getDate()}</b>
            <span className="week-strip-count">{n > 0 ? n : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------- Элементы ----------

function TaskChip({ task, today, onOpen, onToggle }) {
  const overdue = !task.done && task.due_date && task.due_date < today
  return (
    <div
      className={`task-chip ${task.done ? 'done' : ''}`}
      style={{ borderLeftColor: task.tags[0]?.color || 'var(--border)' }}
      onClick={() => onOpen(task)}
      title="Клик — открыть, перетащите — перенести"
    >
      <Checkbox size="sm" checked={task.done} onChange={() => onToggle(task)} title="Выполнено" />
      <div className="content">
        <div className="task-chip-title">{task.title}</div>
        {(task.priority === 'high' || task.description || overdue || task.tags.length > 0) && (
          <div className="task-chip-meta">
            {overdue && <span className="badge badge-danger">просрочено</span>}
            {task.priority === 'high' && <span className={`badge ${PRIORITIES.high.badge}`}>важно</span>}
            {task.tags.map((tag) => <span key={tag.id} className="dot" style={{ background: tag.color }} title={tag.name} />)}
            {task.description && <span title="Есть описание">📝</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function DiaryCardView({ card, onOpen }) {
  return (
    <div className="diary-card" style={{ borderLeftColor: card.color }} onClick={() => onOpen(card)} title="Клик — открыть, перетащите — перенести">
      <div className="diary-card-title">{card.title}</div>
      {card.text && <div className="diary-card-text">{card.text}</div>}
    </div>
  )
}

// Быстрое добавление: «+ Задача» / «+ Запись», затем заголовок и Enter
function QuickAdd({ onAddTask, onAddCard, cardLabel = 'Запись' }) {
  const [mode, setMode] = useState(null) // 'task' | 'card'
  const [text, setText] = useState('')

  if (!mode) {
    return (
      <div className="row" style={{ gap: 4 }}>
        {onAddTask && <button className="btn btn-ghost btn-sm add-card-btn" onClick={() => setMode('task')}>+ Задача</button>}
        {onAddCard && <button className="btn btn-ghost btn-sm add-card-btn" onClick={() => setMode('card')}>+ {cardLabel}</button>}
      </div>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    if (mode === 'task') onAddTask(text.trim())
    else onAddCard(text.trim())
    setText('') // поле остаётся открытым — можно добавить ещё
  }

  return (
    <form onSubmit={submit}>
      <input
        className="input"
        autoFocus
        placeholder={mode === 'task' ? 'Новая задача и Enter' : `${cardLabel}: заголовок и Enter`}
        maxLength={mode === 'task' ? 200 : 100}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setMode(null); setText('') } }}
        onBlur={() => { if (!text.trim()) setMode(null) }}
      />
    </form>
  )
}

function CardEditor({ card, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({ ...card })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const canSave = Boolean(form.title.trim())

  if (confirmDelete) {
    return (
      <ConfirmDialog title="Удалить запись?" onConfirm={() => onDelete(card)} onCancel={() => setConfirmDelete(false)}>
        <p>Запись «{card.title}» будет удалена без возможности восстановления.</p>
      </ConfirmDialog>
    )
  }

  return (
    <Modal
      onClose={onClose}
      actions={<>
        <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Удалить</button>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" disabled={!canSave} onClick={() => onSave(form)} title="Ctrl + Enter">Сохранить</button>
      </>}
    >
      {/* Ctrl+Enter — сохранить, не отрывая рук от клавиатуры */}
      <div className="stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSave) onSave(form) }}>
        <input
          className="input card-editor-title"
          maxLength={100}
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Заголовок"
        />
        <div className="field">
          <label>Описание</label>
          <textarea
            className="textarea"
            style={{ minHeight: 180 }}
            maxLength={5000}
            placeholder="Подробности, мысли, выводы…"
            value={form.text}
            onChange={(e) => set({ text: e.target.value })}
            autoFocus
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label>День</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input input-inline" type="date" value={form.date || ''} onChange={(e) => set({ date: e.target.value || null })} />
              {form.date && <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ date: null })} title="Убрать в «Без даты»">без даты</button>}
            </div>
          </div>
          <div className="field">
            <label>Цвет</label>
            <div className="row" style={{ gap: 6 }}>
              {CARD_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-dot ${form.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => set({ color: c })}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        {card.updated_at && (
          <span className="small muted">Изменено: {new Date(card.updated_at).toLocaleString('ru-RU')} · Ctrl + Enter — сохранить</span>
        )}
      </div>
    </Modal>
  )
}

// Поиск по записям дневника за последние ~10 месяцев и 2 месяца вперёд (и по заметкам без даты)
function DiarySearch({ onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)

  useEffect(() => {
    if (!query.trim()) { setResults(null); return }
    const timer = setTimeout(async () => {
      const now = new Date()
      try {
        const found = await api('/diary', {
          query: { start: toISO(addDays(now, -300)), end: toISO(addDays(now, 60)), search: query },
        })
        setResults(found.reverse()) // сначала заметки без даты и свежие записи
      } catch { setResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input className="input" style={{ maxWidth: 360 }} placeholder="🔍 Поиск по записям и заметкам" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results && (
        <div className="card" style={{ padding: 8 }}>
          {results.length === 0 ? (
            <div className="muted small" style={{ padding: 8 }}>Ничего не найдено</div>
          ) : (
            <div className="list">
              {results.slice(0, 20).map((c) => (
                <button key={c.id} className="search-result" onClick={() => { onPick(c); setQuery('') }}>
                  <span className="dot" style={{ background: c.color }} />
                  <span className="content title">{c.title}</span>
                  <span className="small muted">
                    {c.date ? formatDate(fromISO(c.date), { day: 'numeric', month: 'short', year: 'numeric' }) : 'без даты'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
