import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { DAY_SHORT, addDays, startOfWeek, toISO, todayISO, weekDates, weekLabel } from '../dates'
import Modal, { ConfirmDialog } from '../components/Modal'
import IconPicker from '../components/IconPicker'

const EMPTY_FORM = { title: '', description: '', icon: '✅', color: '#7c5cff', archived: false }

export default function Habits() {
  const today = todayISO()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [habits, setHabits] = useState([])
  const [logs, setLogs] = useState(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  const days = weekDates(weekStart).map(toISO)

  const load = useCallback(async () => {
    try {
      const start = toISO(weekStart)
      const end = toISO(addDays(weekStart, 6))
      const [h, l] = await Promise.all([
        api('/habits', { query: { include_archived: showArchived, today } }),
        api('/habits/logs', { query: { start, end } }),
      ])
      setHabits(h)
      setLogs(new Set(l.map((x) => `${x.habit_id}|${x.date}`)))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [weekStart, showArchived, today])

  useEffect(() => { load() }, [load])

  const create = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    try {
      await api('/habits', { method: 'POST', body: form })
      setForm(EMPTY_FORM)
      load()
    } catch (err) { setError(err.message) }
  }

  const toggle = async (habit, date) => {
    const key = `${habit.id}|${date}`
    const wasDone = logs.has(key)
    // Оптимистичное обновление: сразу меняем клетку, потом синхронизируем
    setLogs((prev) => {
      const next = new Set(prev)
      wasDone ? next.delete(key) : next.add(key)
      return next
    })
    try {
      if (wasDone) await api(`/habits/${habit.id}/logs/${date}`, { method: 'DELETE' })
      else await api(`/habits/${habit.id}/logs`, { method: 'POST', body: { date } })
    } catch (err) { setError(err.message) }
    load()
  }

  const saveEdit = async () => {
    try {
      const { id, title, description, icon, color, archived } = editing
      await api(`/habits/${id}`, { method: 'PUT', body: { title, description, icon, color, archived } })
      setEditing(null)
      load()
    } catch (err) { setError(err.message) }
  }

  const remove = async () => {
    try {
      await api(`/habits/${deleting.id}`, { method: 'DELETE' })
      setDeleting(null)
      load()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Привычки</h1>
          <p className="subtitle">Отмечайте выполнение по дням — серия 🔥 растёт, пока вы не пропускаете</p>
        </div>
        <div className="week-nav">
          <button className="btn btn-icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <span className="small">{weekLabel(weekStart)}</span>
          <button className="btn btn-icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
          <button className="btn btn-sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Сегодня</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="card form-row" onSubmit={create}>
        <div className="field">
          <label>Иконка</label>
          <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
        </div>
        <div className="field grow">
          <label>Новая привычка</label>
          <input className="input" placeholder="Например: пить воду" maxLength={60} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="field">
          <label>Цвет</label>
          <input type="color" className="input input-inline" style={{ width: 52, padding: 4, height: 40 }} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </div>
        <button className="btn btn-primary" disabled={!form.title.trim()}>Добавить</button>
      </form>

      <label className="row small muted" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Показывать архивные
      </label>

      {habits.length === 0 ? (
        <div className="card empty">Пока нет привычек. Добавьте первую или загляните в каталог.</div>
      ) : (
        <div className="habit-table">
          <div className="habit-row header">
            <div className="habit-info" />
            {days.map((d, i) => (
              <div key={d} className={`day-head ${d === today ? 'today' : ''}`}>
                {DAY_SHORT[i]}<br />{Number(d.slice(8))}
              </div>
            ))}
            <div className="habit-actions" />
          </div>
          {habits.map((h) => (
            <div key={h.id} className={`habit-row ${h.archived ? 'archived' : ''}`}>
              <div className="habit-info">
                <span className="habit-icon" style={{ background: h.color + '33' }}>{h.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="habit-title" title={h.title}>{h.title}</div>
                  <div className="small muted">🔥 {h.streak} подряд · всего {h.total}</div>
                </div>
              </div>
              {days.map((d, i) => {
                const done = logs.has(`${h.id}|${d}`)
                return (
                  <button
                    key={d}
                    className={`day-cell ${d === today ? 'today' : ''}`}
                    style={done ? { background: h.color, borderColor: h.color } : undefined}
                    disabled={d > today || h.archived}
                    onClick={() => toggle(h, d)}
                    title={`${DAY_SHORT[i]}, ${d}`}
                  >
                    {done && '✓'}
                  </button>
                )
              })}
              <div className="row habit-actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
                <button className="btn btn-ghost btn-icon" title="Изменить" onClick={() => setEditing({ ...h })}>✏️</button>
                <button className="btn btn-ghost btn-icon" title="Удалить" onClick={() => setDeleting(h)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal
          title="Редактировать привычку"
          onClose={() => setEditing(null)}
          actions={<>
            <button className="btn" onClick={() => setEditing(null)}>Отмена</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={!editing.title.trim()}>Сохранить</button>
          </>}
        >
          <div className="form-row">
            <div className="field">
              <label>Иконка</label>
              <IconPicker value={editing.icon} onChange={(icon) => setEditing({ ...editing, icon })} />
            </div>
            <div className="field grow">
              <label>Название</label>
              <input className="input" maxLength={60} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Цвет</label>
              <input type="color" className="input input-inline" style={{ width: 52, padding: 4, height: 40 }} value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Описание</label>
            <textarea className="textarea" maxLength={300} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={editing.archived} onChange={(e) => setEditing({ ...editing, archived: e.target.checked })} />
            В архиве (скрыта из списка, история сохраняется)
          </label>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog title="Удалить привычку?" onConfirm={remove} onCancel={() => setDeleting(null)}>
          <p>Привычка «{deleting.title}» и вся история отметок ({deleting.total}) будут удалены без возможности восстановления. Если хотите сохранить историю — отправьте её в архив.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
