import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { addDays, formatDate, fromISO, startOfWeek, toISO, todayISO } from '../dates'
import Modal from '../components/Modal'
import TaskEditor, { PRIORITIES, TaskFields } from '../components/TaskEditor'

const EMPTY_TASK = { title: '', description: '', due_date: '', priority: 'medium', tag_ids: [] }

const DATE_MODES = [
  ['any', 'Любой срок'],
  ['today', 'Сегодня'],
  ['week', 'Эта неделя'],
  ['overdue', 'Просрочено'],
  ['custom', 'Выбрать дату…'],
]

const SORT_KEY = 'traker_tasks_sort'
const readSort = () => {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    return ['due', 'manual'].includes(saved) ? saved : 'created'
  } catch { return 'created' }
}

// Превращает выбранный режим срока в параметры due_from / due_to
function dateRange(mode, from, to) {
  const now = new Date()
  const today = toISO(now)
  switch (mode) {
    case 'today': return { due_from: today, due_to: today }
    case 'week': {
      const start = startOfWeek(now)
      return { due_from: toISO(start), due_to: toISO(addDays(start, 6)) }
    }
    case 'overdue': return { due_to: toISO(addDays(now, -1)) }
    case 'custom': return { due_from: from || undefined, due_to: to || from || undefined }
    default: return {}
  }
}

export default function Tasks() {
  const today = todayISO()
  const [tasks, setTasks] = useState([])
  const [tags, setTags] = useState([])
  const [status, setStatus] = useState('active')
  const [tagIds, setTagIds] = useState([])
  const [tagMode, setTagMode] = useState('any')
  const [search, setSearch] = useState('')
  const [dateMode, setDateMode] = useState('any')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState(readSort)
  const [form, setForm] = useState(EMPTY_TASK)
  const [editing, setEditing] = useState(null)
  const [showTags, setShowTags] = useState(false)
  const [error, setError] = useState('')

  const loadTags = useCallback(() => api('/tags').then(setTags).catch((e) => setError(e.message)), [])

  const loadTasks = useCallback(async () => {
    try {
      const query = { status, tag_ids: tagIds, tag_mode: tagMode, search, sort, ...dateRange(dateMode, dateFrom, dateTo) }
      setTasks(await api('/tasks', { query }))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [status, tagIds, tagMode, search, sort, dateMode, dateFrom, dateTo])

  const changeSort = (value) => {
    setSort(value)
    try { localStorage.setItem(SORT_KEY, value) } catch { /* не критично */ }
  }

  const toggleTagFilter = (id) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const filtersActive = tagIds.length > 0 || dateMode !== 'any' || search.trim()
  const resetFilters = () => {
    setTagIds([])
    setDateMode('any')
    setDateFrom('')
    setDateTo('')
    setSearch('')
  }

  useEffect(() => { loadTags() }, [loadTags])
  useEffect(() => {
    const timer = setTimeout(loadTasks, 250) // небольшая задержка, чтобы не слать запрос на каждую букву
    return () => clearTimeout(timer)
  }, [loadTasks])

  const toBody = (t) => ({ ...t, due_date: t.due_date || null })

  const create = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    try {
      await api('/tasks', { method: 'POST', body: toBody(form) })
      setForm(EMPTY_TASK)
      loadTasks()
    } catch (err) { setError(err.message) }
  }

  const toggleDone = async (task) => {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: !task.done } })
      loadTasks()
    } catch (err) { setError(err.message) }
  }

  // Перетаскивание: dragged встаёт на место index в видимом списке (без неё самой)
  const moveTask = async (draggedId, index) => {
    const dragged = tasks.find((t) => t.id === draggedId)
    const rest = tasks.filter((t) => t.id !== draggedId)
    if (!dragged || rest.length === 0) return
    const body = index < rest.length ? { before_id: rest[index].id } : { after_id: rest[rest.length - 1].id }
    const reordered = [...rest]
    reordered.splice(index, 0, dragged)
    setTasks(reordered) // сразу показываем новый порядок
    try {
      await api(`/tasks/${draggedId}/move`, { method: 'PUT', body })
      if (sort !== 'manual') changeSort('manual') // список перезагрузится в «своём порядке»
      else loadTasks()
    } catch (err) {
      setError(err.message)
      loadTasks()
    }
  }

  const onTagsChanged = () => {
    setTagIds([]) // выбранный тег мог быть удалён
    loadTags()
    loadTasks()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Задачи</h1>
          <p className="subtitle">Фильтры по тегам и срокам, сортировка по дате добавления, по сроку или свой порядок</p>
        </div>
        <button className="btn" onClick={() => setShowTags(true)}>🏷️ Теги</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="card stack" onSubmit={create}>
        <TaskFields value={form} onChange={setForm} tags={tags} compact />
        <div className="row">
          <div className="spacer" />
          <button className="btn btn-primary" disabled={!form.title.trim()}>Добавить задачу</button>
        </div>
      </form>

      <div className="row">
        <div className="tabs">
          {[['active', 'Активные'], ['done', 'Выполненные'], ['all', 'Все']].map(([id, label]) => (
            <button key={id} className={`tab ${status === id ? 'active' : ''}`} onClick={() => setStatus(id)}>{label}</button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="🔍 Поиск по названию" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="spacer" />
        <label className="row small muted" style={{ flexWrap: 'nowrap' }}>
          Сортировка:
          <select className="select input-inline" value={sort} onChange={(e) => changeSort(e.target.value)}>
            <option value="created">по дате добавления</option>
            <option value="due">по сроку</option>
            <option value="manual">свой порядок</option>
          </select>
        </label>
      </div>

      <div className="card filter-panel">
        <div className="filter-row">
          <span className="filter-label">Срок</span>
          <div className="row">
            {DATE_MODES.map(([id, label]) => (
              <button key={id} className={`chip ${dateMode === id ? 'active' : ''}`} onClick={() => setDateMode(id)}>{label}</button>
            ))}
          </div>
        </div>
        {dateMode === 'custom' && (
          <div className="filter-row">
            <span className="filter-label" />
            <div className="row">
              <span className="small muted">с</span>
              <input className="input input-inline" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="small muted">по</span>
              <input className="input input-inline" type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
              <span className="small muted">— для одного дня заполните только «с»</span>
            </div>
          </div>
        )}
        {tags.length > 0 && (
          <div className="filter-row">
            <span className="filter-label">Теги</span>
            <div className="row">
              {tags.map((t) => (
                <button key={t.id} className={`chip ${tagIds.includes(t.id) ? 'active' : ''}`} onClick={() => toggleTagFilter(t.id)}>
                  <span className="dot" style={{ background: t.color }} />{t.name}
                </button>
              ))}
              {tagIds.length > 1 && (
                <select className="select input-inline" style={{ padding: '3px 8px' }} value={tagMode} onChange={(e) => setTagMode(e.target.value)}>
                  <option value="any">любой из выбранных</option>
                  <option value="all">все выбранные сразу</option>
                </select>
              )}
            </div>
          </div>
        )}
        <div className="row small muted">
          <span>Найдено: {tasks.length}</span>
          {filtersActive && <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Сбросить фильтры</button>}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="card empty">Задач не найдено</div>
      ) : (
        <TaskBoard
          tasks={tasks}
          today={today}
          onToggle={toggleDone}
          onOpen={setEditing}
          onMove={moveTask}
        />
      )}
      <p className="small muted">
        Клик по задаче — открыть описание и изменить. Задачи можно перетаскивать мышкой — порядок сохранится как «свой порядок».
      </p>

      {editing && (
        <TaskEditor key={editing.id} task={editing} tags={tags} onChanged={loadTasks} onClose={() => setEditing(null)} />
      )}

      {showTags && <TagManager tags={tags} onChanged={onTagsChanged} onClose={() => setShowTags(false)} />}
    </div>
  )
}

// Список задач-карточек с перетаскиванием (как в дневнике). Описание видно только в открытой задаче.
function TaskBoard({ tasks, today, onToggle, onOpen, onMove }) {
  const listRef = useRef(null)
  const [dragId, setDragId] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)

  const indexAt = (clientY) => {
    const els = [...listRef.current.querySelectorAll('[data-task-id]')]
      .filter((el) => Number(el.dataset.taskId) !== dragId)
    let index = 0
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (clientY > r.top + r.height / 2) index++
      else break
    }
    return index
  }

  const endDrag = () => { setDragId(null); setDropIndex(null) }

  const items = []
  let visibleIndex = 0
  for (const t of tasks) {
    if (t.id !== dragId) {
      if (dropIndex === visibleIndex) items.push(<div key="drop" className="drop-line" />)
      visibleIndex++
    }
    const overdue = !t.done && t.due_date && t.due_date < today
    items.push(
      <div
        key={t.id}
        data-task-id={t.id}
        className={`task-card ${t.done ? 'done' : ''} ${t.id === dragId ? 'dragging' : ''}`}
        style={{ borderLeftColor: t.tags[0]?.color || 'var(--border)' }}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', String(t.id))
          setDragId(t.id)
        }}
        onDragEnd={endDrag}
        onClick={() => onOpen(t)}
      >
        <button
          className={`checkbox ${t.done ? 'checked' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggle(t) }}
          aria-label="Выполнено"
        >
          {t.done && '✓'}
        </button>
        <div className="content">
          <div className="title">{t.title}</div>
          <div className="row" style={{ marginTop: 4, gap: 6 }}>
            {t.due_date && (
              <span className={`badge ${overdue ? 'badge-danger' : t.due_date === today ? 'badge-accent' : ''}`}>
                📅 {t.due_date === today ? 'сегодня' : formatDate(fromISO(t.due_date))}
              </span>
            )}
            <span className={`badge ${PRIORITIES[t.priority].badge}`}>{PRIORITIES[t.priority].label}</span>
            {t.tags.map((tag) => (
              <span key={tag.id} className="badge"><span className="dot" style={{ background: tag.color }} />{tag.name}</span>
            ))}
            {t.description && <span className="badge" title="Есть описание">📝</span>}
          </div>
        </div>
        <span className="drag-handle" aria-hidden="true">⋮⋮</span>
      </div>,
    )
  }
  if (dropIndex === visibleIndex) items.push(<div key="drop" className="drop-line" />)

  return (
    <div
      className="task-list"
      ref={listRef}
      onDragOver={(e) => {
        if (dragId == null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const index = indexAt(e.clientY)
        if (index !== dropIndex) setDropIndex(index)
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (dragId != null) onMove(dragId, indexAt(e.clientY))
        endDrag()
      }}
    >
      {items}
    </div>
  )
}

function TagManager({ tags, onChanged, onClose }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#7c5cff')
  const [error, setError] = useState('')

  const create = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      await api('/tags', { method: 'POST', body: { name, color } })
      setName('')
      setError('')
      onChanged()
    } catch (err) { setError(err.message) }
  }

  const remove = async (tag) => {
    if (!window.confirm(`Удалить тег «${tag.name}»? С задач он тоже снимется.`)) return
    try {
      await api(`/tags/${tag.id}`, { method: 'DELETE' })
      onChanged()
    } catch (err) { setError(err.message) }
  }

  return (
    <Modal title="Теги" onClose={onClose} actions={<button className="btn" onClick={onClose}>Готово</button>}>
      {error && <div className="alert alert-error">{error}</div>}
      <form className="form-row" onSubmit={create}>
        <input className="input grow" placeholder="Название тега" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="color" className="input input-inline" style={{ width: 52, padding: 4, height: 40 }} value={color} onChange={(e) => setColor(e.target.value)} />
        <button className="btn btn-primary" disabled={!name.trim()}>Создать</button>
      </form>
      {tags.length === 0 ? (
        <p className="muted small">Тегов пока нет. Например: учёба, дом, работа.</p>
      ) : (
        <div className="list">
          {tags.map((t) => (
            <div key={t.id} className="list-item">
              <span className="dot" style={{ background: t.color, width: 12, height: 12 }} />
              <span className="content">{t.name}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => remove(t)} title="Удалить">🗑️</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
