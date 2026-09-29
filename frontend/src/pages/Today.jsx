import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { formatDate, fromISO, todayISO } from '../dates'

export default function Today({ user, navigate }) {
  const today = todayISO()
  const [stats, setStats] = useState(null)
  const [habits, setHabits] = useState([])
  const [doneIds, setDoneIds] = useState(new Set())
  const [tasks, setTasks] = useState([])
  const [cards, setCards] = useState([])
  const [newCard, setNewCard] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, h, logs, t, diary] = await Promise.all([
        api('/stats', { query: { today } }),
        api('/habits', { query: { today } }),
        api('/habits/logs', { query: { start: today, end: today } }),
        api('/tasks', { query: { status: 'active', due_to: today, sort: 'due' } }),
        api('/diary', { query: { start: today, end: today } }),
      ])
      setStats(s)
      setHabits(h)
      setDoneIds(new Set(logs.map((l) => l.habit_id)))
      setTasks(t)
      setCards(diary)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  const toggleHabit = async (habit) => {
    try {
      if (doneIds.has(habit.id)) await api(`/habits/${habit.id}/logs/${today}`, { method: 'DELETE' })
      else await api(`/habits/${habit.id}/logs`, { method: 'POST', body: { date: today } })
      load()
    } catch (e) { setError(e.message) }
  }

  const completeTask = async (task) => {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { done: true } })
      load()
    } catch (e) { setError(e.message) }
  }

  const addCard = async (e) => {
    e.preventDefault()
    if (!newCard.trim()) return
    try {
      const card = await api('/diary', { method: 'POST', body: { date: today, title: newCard } })
      setCards((prev) => [...prev, card])
      setNewCard('')
    } catch (err) { setError(err.message) }
  }

  const hour = new Date().getHours()
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер'
  const habitPercent = habits.length ? Math.round((doneIds.size / habits.length) * 100) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{greeting}, {user.username}!</h1>
          <p className="subtitle">{formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {stats && (
        <div className="grid grid-stats">
          <Stat value={`${stats.habits_done_today}/${stats.habits_active}`} label="Привычек сегодня" />
          <Stat value={`🔥 ${stats.best_streak}`} label="Лучшая серия, дней" />
          <Stat value={`${stats.week_habit_rate}%`} label="Привычки за 7 дней" />
          <Stat value={stats.tasks_active} label="Активных задач" />
          <Stat value={stats.tasks_overdue} label="Просрочено" danger={stats.tasks_overdue > 0} />
          <Stat value={stats.diary_cards_week} label="Записей в дневнике за 7 дней" />
        </div>
      )}

      <div className="grid grid-2">
        <section className="card">
          <div className="card-title">
            <h2>Привычки на сегодня</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('habits')}>Все →</button>
          </div>
          {habits.length > 0 && <div className="progress" style={{ marginBottom: 8 }}><div style={{ width: `${habitPercent}%` }} /></div>}
          {habits.length === 0 ? (
            <div className="empty">
              Привычек пока нет.{' '}
              <a href="#/catalog" onClick={(e) => { e.preventDefault(); navigate('catalog') }}>Выбрать из каталога</a>
            </div>
          ) : (
            <div className="list">
              {habits.map((h) => {
                const done = doneIds.has(h.id)
                return (
                  <div key={h.id} className={`list-item ${done ? 'done' : ''}`}>
                    <button className={`checkbox ${done ? 'checked' : ''}`} onClick={() => toggleHabit(h)} aria-label="Отметить">
                      {done && '✓'}
                    </button>
                    <span>{h.icon}</span>
                    <span className="content title">{h.title}</span>
                    {h.streak > 0 && <span className="badge badge-warning">🔥 {h.streak}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Задачи на сегодня</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('tasks')}>Все →</button>
          </div>
          {tasks.length === 0 ? (
            <div className="empty">На сегодня задач нет 🎉</div>
          ) : (
            <div className="list">
              {tasks.map((t) => {
                const overdue = t.due_date < today
                return (
                  <div key={t.id} className="list-item">
                    <button className="checkbox" onClick={() => completeTask(t)} aria-label="Выполнить" />
                    <span className="content title">{t.title}</span>
                    {overdue && <span className="badge badge-danger">просрочено {formatDate(fromISO(t.due_date))}</span>}
                    {t.priority === 'high' && <span className="badge badge-danger">важно</span>}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <section className="card stack">
        <div className="card-title" style={{ marginBottom: 0 }}>
          <h2>Дневник на сегодня</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('week')}>Открыть неделю →</button>
        </div>
        {cards.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            {cards.map((c) => (
              <div key={c.id} className="diary-card static" style={{ borderLeftColor: c.color }}>
                <div className="diary-card-title">{c.title}</div>
                {c.text && <div className="diary-card-text">{c.text}</div>}
              </div>
            ))}
          </div>
        )}
        <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={addCard}>
          <input className="input" placeholder="Быстрая запись: что сегодня произошло?" maxLength={100} value={newCard} onChange={(e) => setNewCard(e.target.value)} />
          <button className="btn btn-primary" disabled={!newCard.trim()}>Добавить</button>
        </form>
      </section>
    </div>
  )
}

function Stat({ value, label, danger }) {
  return (
    <div className="card stat">
      <span className="stat-value" style={danger ? { color: 'var(--danger)' } : undefined}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
