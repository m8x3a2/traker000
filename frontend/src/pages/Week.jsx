import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { DAY_FULL, addDays, formatDate, fromISO, startOfWeek, toISO, todayISO, weekDates, weekLabel } from '../dates'
import Modal, { ConfirmDialog } from '../components/Modal'
import TaskEditor, { PRIORITIES } from '../components/TaskEditor'

export const CARD_COLORS = ['#7c5cff', '#3b82f6', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b93a7']

// Вставляет item в массив рядом с соседом (before/after) — так же, как это делает сервер
function insertNear(list, item, { before_id, after_id }) {
  const result = list.filter((x) => x.id !== item.id)
  const anchor = before_id ?? after_id
  const i = anchor == null ? -1 : result.findIndex((x) => x.id === anchor)
  if (i === -1) result.push(item)
  else result.splice(before_id != null ? i : i + 1, 0, item)
  return result
}

// Дневник: неделя (Пн–Вс). В каждом дне — задачи с этим сроком и записи-карточки.
// Всё перетаскивается мышкой: внутри дня, между днями и в колонку «Без срока».
export default function Week() {
  const today = todayISO()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [cards, setCards] = useState([])
  const [tasks, setTasks] = useState([])     // задачи со сроком на этой неделе
  const [backlog, setBacklog] = useState([]) // активные задачи без срока
  const [tags, setTags] = useState([])
  const [habitsCount, setHabitsCount] = useState(0)
  const [logsByDay, setLogsByDay] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(null) // { type: 'card' | 'task', id }
  const [hint, setHint] = useState(null) // { zone: 'task:2026-09-30' | 'task:none' | 'card:…', index }
  const [openedCard, setOpenedCard] = useState(null)
  const [openedTask, setOpenedTask] = useState(null)

  const start = toISO(weekStart)
  const end = toISO(addDays(weekStart, 6))

  const load = useCallback(async () => {
    try {
      const [diary, t, noDue, tg, habits, logs] = await Promise.all([
        api('/diary', { query: { start, end } }),
        api('/tasks', { query: { due_from: start, due_to: end, sort: 'manual' } }),
        api('/tasks', { query: { status: 'active', no_due: true, sort: 'manual' } }),
        api('/tags'),
        api('/habits', { query: { today } }),
        api('/habits/logs', { query: { start, end } }),
      ])
      setCards(diary)
      setTasks(t)
      setBacklog(noDue)
      setTags(tg)
      setHabitsCount(habits.length)
      const activeIds = new Set(habits.map((h) => h.id))
      const byDay = {}
      for (const l of logs) if (activeIds.has(l.habit_id)) byDay[l.date] = (byDay[l.date] || 0) + 1
      setLogsByDay(byDay)
      setLoaded(true)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [start, end, today])

  useEffect(() => { load() }, [load])

  const cardsByDay = useMemo(() => {
    const map = {}
    for (const c of cards) (map[c.date] ||= []).push(c)
    for (const list of Object.values(map)) list.sort((a, b) => a.position - b.position)
    return map
  }, [cards])

  const tasksByDay = useMemo(() => {
    const map = {}
    for (const t of tasks) (map[t.due_date] ||= []).push(t)
    return map
  }, [tasks])

  const endDrag = () => { setDrag(null); setHint(null) }

  // ---------- Записи (карточки) ----------

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

  // date = null — колонка «Без срока»
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

  const goToCard = (card) => {
    setWeekStart(startOfWeek(fromISO(card.date)))
    setOpenedCard(card)
  }

  const dnd = { drag, setDrag, hint, setHint, endDrag }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <div>
          <h1>Дневник недели</h1>
          <p className="subtitle">Задачи и записи по дням. Перетаскивайте мышкой между днями — у задачи поменяется срок. Клик — открыть.</p>
        </div>
        <div className="week-nav">
          <button className="btn btn-icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <span className="small">{weekLabel(weekStart)}</span>
          <button className="btn btn-icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
          <button className="btn btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Эта неделя</button>
        </div>
      </div>

      <DiarySearch onPick={goToCard} />

      {error && <div className="alert alert-error">{error}</div>}

      {loaded && (
        <div className="week-grid">
          {weekDates(weekStart).map((d, i) => {
            const iso = toISO(d)
            return (
              <DayColumn
                key={iso}
                date={iso}
                title={DAY_FULL[i]}
                subtitle={formatDate(d)}
                isToday={iso === today}
                today={today}
                cards={cardsByDay[iso] || []}
                tasks={tasksByDay[iso] || []}
                habitsDone={logsByDay[iso] || 0}
                habitsCount={habitsCount}
                dnd={dnd}
                onMoveCard={moveCard}
                onMoveTask={moveTask}
                onOpenCard={setOpenedCard}
                onOpenTask={setOpenedTask}
                onAddCard={addCard}
                onAddTask={addTask}
                onToggleTask={toggleTask}
              />
            )
          })}
          <BacklogColumn
            tasks={backlog}
            today={today}
            dnd={dnd}
            onMoveTask={moveTask}
            onOpenTask={setOpenedTask}
            onAddTask={addTask}
            onToggleTask={toggleTask}
          />
        </div>
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

// ---------- Колонки ----------

function DayColumn({
  date, title, subtitle, isToday, today, cards, tasks, habitsDone, habitsCount, dnd,
  onMoveCard, onMoveTask, onOpenCard, onOpenTask, onAddCard, onAddTask, onToggleTask,
}) {
  const { drag, hint, setHint, endDrag } = dnd
  const count = (list) => list.filter((x) => x.id !== drag?.id).length

  // Если отпустить не над списком, а просто над днём — элемент встаёт в конец нужного списка
  const onDragOver = (e) => {
    if (!drag) return
    e.preventDefault()
    const zone = `${drag.type}:${date}`
    const index = count(drag.type === 'task' ? tasks : cards)
    if (hint?.zone !== zone || hint.index !== index) setHint({ zone, index })
  }
  const onDrop = (e) => {
    if (!drag) return
    e.preventDefault()
    if (drag.type === 'task') onMoveTask(drag.id, date, count(tasks))
    else onMoveCard(drag.id, date, count(cards))
    endDrag()
  }

  const isTarget = hint?.zone?.endsWith(`:${date}`)

  return (
    <div className={`card day-card ${isToday ? 'today' : ''} ${isTarget ? 'drop-target' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="day-card-head">
        <h3>{title}</h3>
        <span className="small muted">{isToday ? 'сегодня' : subtitle}</span>
      </div>

      <div className="day-section-title">Задачи</div>
      <SortableList
        type="task"
        zone={`task:${date}`}
        items={tasks}
        dnd={dnd}
        onDrop={(id, index) => onMoveTask(id, date, index)}
        renderItem={(t) => <TaskChip task={t} today={today} onOpen={onOpenTask} onToggle={onToggleTask} />}
      />

      <div className="day-section-title">Записи</div>
      <SortableList
        type="card"
        zone={`card:${date}`}
        items={cards}
        dnd={dnd}
        onDrop={(id, index) => onMoveCard(id, date, index)}
        renderItem={(c) => <DiaryCardView card={c} onOpen={onOpenCard} />}
      />

      <QuickAdd onAddTask={(text) => onAddTask(date, text)} onAddCard={(text) => onAddCard(date, text)} />

      {habitsCount > 0 && (
        <div className="day-extras">
          <div className="row small muted" style={{ justifyContent: 'space-between' }}>
            <span>Привычки</span><span>{habitsDone}/{habitsCount}</span>
          </div>
          <div className="progress"><div style={{ width: `${Math.round((habitsDone / habitsCount) * 100)}%` }} /></div>
        </div>
      )}
    </div>
  )
}

function BacklogColumn({ tasks, today, dnd, onMoveTask, onOpenTask, onAddTask, onToggleTask }) {
  const { drag, hint, setHint, endDrag } = dnd
  const count = tasks.filter((x) => x.id !== drag?.id).length

  const onDragOver = (e) => {
    if (drag?.type !== 'task') return
    e.preventDefault()
    if (hint?.zone !== 'task:none' || hint.index !== count) setHint({ zone: 'task:none', index: count })
  }
  const onDrop = (e) => {
    if (drag?.type !== 'task') return
    e.preventDefault()
    onMoveTask(drag.id, null, count)
    endDrag()
  }

  return (
    <div className={`card day-card backlog ${hint?.zone === 'task:none' ? 'drop-target' : ''}`} onDragOver={onDragOver} onDrop={onDrop}>
      <div className="day-card-head">
        <h3>📥 Без срока</h3>
        <span className="small muted">{tasks.length}</span>
      </div>
      <SortableList
        type="task"
        zone="task:none"
        items={tasks}
        dnd={dnd}
        onDrop={(id, index) => onMoveTask(id, null, index)}
        renderItem={(t) => <TaskChip task={t} today={today} onOpen={onOpenTask} onToggle={onToggleTask} />}
      />
      <QuickAdd onAddTask={(text) => onAddTask(null, text)} />
      <span className="small muted">Перетащите задачу в день, чтобы назначить срок</span>
    </div>
  )
}

// Список с перетаскиванием: принимает только элементы своего типа (задачи или записи)
function SortableList({ type, zone, items, dnd, onDrop, renderItem }) {
  const { drag, setDrag, hint, setHint, endDrag } = dnd
  const ref = useRef(null)
  const accepts = drag?.type === type
  const dropIndex = accepts && hint?.zone === zone ? hint.index : null

  // На какое место встанет элемент: сколько элементов выше курсора
  const indexAt = (clientY) => {
    const els = [...ref.current.querySelectorAll(':scope > [data-sort-id]')]
      .filter((el) => Number(el.dataset.sortId) !== drag.id)
    let index = 0
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (clientY > r.top + r.height / 2) index++
      else break
    }
    return index
  }

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
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', `${type}:${item.id}`)
          setDrag({ type, id: item.id })
        }}
        onDragEnd={endDrag}
      >
        {renderItem(item)}
      </div>,
    )
  }
  if (dropIndex === visibleIndex) rendered.push(<div key="drop" className="drop-line" />)

  return (
    <div
      ref={ref}
      className={`sortable ${accepts ? 'accepting' : ''}`}
      onDragOver={(e) => {
        if (!accepts) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        const index = indexAt(e.clientY)
        if (hint?.zone !== zone || hint.index !== index) setHint({ zone, index })
      }}
      onDrop={(e) => {
        if (!accepts) return
        e.preventDefault()
        e.stopPropagation()
        onDrop(drag.id, indexAt(e.clientY))
        endDrag()
      }}
    >
      {rendered}
      {items.length === 0 && dropIndex == null && <div className="diary-empty">{accepts ? 'Перетащите сюда' : 'Пусто'}</div>}
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
      <button className={`checkbox ${task.done ? 'checked' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(task) }} aria-label="Выполнено">
        {task.done && '✓'}
      </button>
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
function QuickAdd({ onAddTask, onAddCard }) {
  const [mode, setMode] = useState(null) // 'task' | 'card'
  const [text, setText] = useState('')

  if (!mode) {
    return (
      <div className="row" style={{ gap: 4 }}>
        {onAddTask && <button className="btn btn-ghost btn-sm add-card-btn" onClick={() => setMode('task')}>+ Задача</button>}
        {onAddCard && <button className="btn btn-ghost btn-sm add-card-btn" onClick={() => setMode('card')}>+ Запись</button>}
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
        placeholder={mode === 'task' ? 'Новая задача и Enter' : 'Заголовок записи и Enter'}
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
        <button className="btn btn-primary" disabled={!form.title.trim()} onClick={() => onSave(form)}>Сохранить</button>
      </>}
    >
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
          <input className="input input-inline" type="date" value={form.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
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
        <span className="small muted">Изменено: {new Date(card.updated_at).toLocaleString('ru-RU')}</span>
      )}
    </Modal>
  )
}

// Поиск по записям дневника за последние ~10 месяцев и 2 месяца вперёд
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
        setResults(found.reverse())
      } catch { setResults([]) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input className="input" style={{ maxWidth: 360 }} placeholder="🔍 Поиск по записям дневника" value={query} onChange={(e) => setQuery(e.target.value)} />
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
                  <span className="small muted">{formatDate(fromISO(c.date), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
