import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { ConfirmDialog } from '../components/Modal'
import IconPicker from '../components/IconPicker'
import { playSound } from '../timer/sounds'

const TABS = [['stats', 'Статистика'], ['users', 'Пользователи'], ['templates', 'Каталог привычек'], ['sounds', 'Звуки таймера']]

export default function Admin({ user }) {
  const [tab, setTab] = useState('stats')
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Администрирование</h1>
          <p className="subtitle">Пользователи, роли, каталог привычек и звуки таймера</p>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'stats' && <SystemStats />}
      {tab === 'users' && <Users currentUser={user} />}
      {tab === 'templates' && <Templates />}
      {tab === 'sounds' && <Sounds />}
    </div>
  )
}

function SystemStats() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { api('/admin/stats').then(setStats).catch((e) => setError(e.message)) }, [])

  if (error) return <div className="alert alert-error">{error}</div>
  if (!stats) return null
  const items = [
    ['Пользователей', stats.users], ['Администраторов', stats.admins], ['Привычек', stats.habits],
    ['Отметок привычек', stats.habit_logs], ['Задач', stats.tasks], ['Карточек в дневниках', stats.diary_cards],
    ['Шаблонов в каталоге', stats.templates], ['Шаблонов таймера', stats.timer_presets], ['Загруженных звуков', stats.timer_sounds],
  ]
  return (
    <div className="grid grid-stats">
      {items.map(([label, value]) => (
        <div key={label} className="card stat">
          <span className="stat-value">{value}</span>
          <span className="stat-label">{label}</span>
        </div>
      ))}
    </div>
  )
}

function Users({ currentUser }) {
  const [users, setUsers] = useState([])
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api('/admin/users').then(setUsers).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const changeRole = async (u, role) => {
    try {
      await api(`/admin/users/${u.id}/role`, { method: 'PUT', body: { role } })
      setError('')
      load()
    } catch (e) { setError(e.message) }
  }

  const remove = async () => {
    try {
      await api(`/admin/users/${deleting.id}`, { method: 'DELETE' })
      setDeleting(null)
      load()
    } catch (e) { setError(e.message) }
  }

  return (
    <section className="card">
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Имя</th><th>Роль</th><th>Привычки</th><th>Задачи</th><th>Дневник</th><th>Регистрация</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isMe = u.id === currentUser.id
              return (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username} {isMe && <span className="badge badge-accent">вы</span>}</td>
                  <td>
                    <select className="select input-inline" value={u.role} disabled={isMe} onChange={(e) => changeRole(u, e.target.value)}>
                      <option value="client">Клиент</option>
                      <option value="admin">Админ</option>
                    </select>
                  </td>
                  <td>{u.habits_count}</td>
                  <td>{u.tasks_count}</td>
                  <td>{u.diary_count}</td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('ru-RU') : '—'}</td>
                  <td>{!isMe && <button className="btn btn-ghost btn-icon" title="Удалить" onClick={() => setDeleting(u)}>🗑️</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {deleting && (
        <ConfirmDialog title="Удалить пользователя?" onConfirm={remove} onCancel={() => setDeleting(null)}>
          <p>Пользователь <b>{deleting.username}</b> и все его данные (привычки, задачи, дневник, заметка) будут удалены без возможности восстановления.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

const EMPTY_TEMPLATE = { title: '', description: '', icon: '✅', category: '' }

function Templates() {
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState(EMPTY_TEMPLATE)
  const [editId, setEditId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => api('/templates').then(setTemplates).catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    try {
      if (editId) await api(`/admin/templates/${editId}`, { method: 'PUT', body: form })
      else await api('/admin/templates', { method: 'POST', body: form })
      setForm(EMPTY_TEMPLATE)
      setEditId(null)
      setError('')
      load()
    } catch (err) { setError(err.message) }
  }

  const startEdit = (t) => {
    setEditId(t.id)
    setForm({ title: t.title, description: t.description, icon: t.icon, category: t.category })
  }

  const remove = async () => {
    try {
      await api(`/admin/templates/${deleting.id}`, { method: 'DELETE' })
      setDeleting(null)
      load()
    } catch (e) { setError(e.message) }
  }

  return (
    <>
      <form className="card stack" onSubmit={submit}>
        <h2>{editId ? 'Редактировать шаблон' : 'Новый шаблон привычки'}</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-row">
          <div className="field">
            <label>Иконка</label>
            <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
          </div>
          <div className="field grow">
            <label>Название</label>
            <input className="input" maxLength={60} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field grow">
            <label>Категория</label>
            <input className="input" maxLength={40} placeholder="Здоровье, Развитие…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label>Описание</label>
          <input className="input" maxLength={300} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={!form.title.trim()}>{editId ? 'Сохранить' : 'Добавить в каталог'}</button>
          {editId && <button type="button" className="btn" onClick={() => { setEditId(null); setForm(EMPTY_TEMPLATE) }}>Отмена</button>}
        </div>
      </form>

      <section className="card">
        <div className="list">
          {templates.map((t) => (
            <div key={t.id} className="list-item">
              <span className="habit-icon" style={{ background: 'var(--accent-soft)' }}>{t.icon}</span>
              <div className="content">
                <div className="title">{t.title} {t.category && <span className="badge">{t.category}</span>}</div>
                <div className="small muted">{t.description}</div>
              </div>
              <button className="btn btn-ghost btn-icon" title="Изменить" onClick={() => startEdit(t)}>✏️</button>
              <button className="btn btn-ghost btn-icon" title="Удалить" onClick={() => setDeleting(t)}>🗑️</button>
            </div>
          ))}
        </div>
      </section>

      {deleting && (
        <ConfirmDialog title="Удалить шаблон?" onConfirm={remove} onCancel={() => setDeleting(null)}>
          <p>Шаблон «{deleting.title}» исчезнет из каталога. Привычки, которые пользователи уже добавили себе, останутся.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

const MAX_SOUND_SECONDS = 10
const MAX_SOUND_KB = 1024

// Длительность аудиофайла измеряет браузер (для WAV сервер проверяет её сам)
function audioDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = new Audio()
    el.preload = 'metadata'
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(el.duration) }
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Браузер не может прочитать этот файл')) }
    el.src = url
  })
}

function Sounds() {
  const fileRef = useRef(null)
  const [sounds, setSounds] = useState([])
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [message, setMessage] = useState(null)

  const load = useCallback(() => api('/admin/sounds').then(setSounds).catch((e) => setMessage({ type: 'error', text: e.message })), [])
  useEffect(() => { load() }, [load])

  const pick = async (e) => {
    const f = e.target.files[0]
    e.target.value = ''
    if (!f) return
    try {
      if (f.size > MAX_SOUND_KB * 1024) throw new Error(`Файл больше ${MAX_SOUND_KB} КБ`)
      const duration = await audioDuration(f)
      if (!(duration > 0)) throw new Error('Не удалось определить длительность')
      if (duration > MAX_SOUND_SECONDS) throw new Error(`Звук длится ${duration.toFixed(1)} с — допускается до ${MAX_SOUND_SECONDS} секунд`)
      setFile({ file: f, duration })
      if (!name) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 40))
      setMessage(null)
    } catch (err) {
      setFile(null)
      setMessage({ type: 'error', text: err.message })
    }
  }

  const upload = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const form = new FormData()
      form.append('file', file.file)
      form.append('name', name.trim())
      form.append('duration_ms', String(Math.round(file.duration * 1000)))
      await api('/admin/sounds', { method: 'POST', form })
      setFile(null)
      setName('')
      setMessage({ type: 'success', text: 'Звук загружен — теперь его можно выбрать в любом шаблоне таймера' })
      load()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    try {
      await api(`/admin/sounds/${deleting.id}`, { method: 'DELETE' })
      setDeleting(null)
      load()
    } catch (e) { setMessage({ type: 'error', text: e.message }) }
  }

  return (
    <>
      <form className="card stack" onSubmit={upload}>
        <h2>Загрузить звук</h2>
        <p className="small muted">
          Звук будет доступен всем пользователям при выборе сигнала начала и окончания шага.
          Длительность — до {MAX_SOUND_SECONDS} секунд, размер — до {MAX_SOUND_KB} КБ; форматы MP3, WAV, OGG, WEBM, M4A.
          Три стандартных звука («Колокольчик», «Сигнал», «Гонг») встроены в приложение.
        </p>
        {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
        <div className="form-row">
          <div className="field">
            <label>Файл</label>
            <button type="button" className="btn" onClick={() => fileRef.current.click()}>
              🎵 {file ? `${file.file.name} · ${file.duration.toFixed(1)} с` : 'Выбрать аудио'}
            </button>
            <input ref={fileRef} type="file" accept="audio/*" hidden onChange={pick} />
          </div>
          <div className="field grow">
            <label>Название</label>
            <input className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Свисток" />
          </div>
          <button className="btn btn-primary" disabled={!file || !name.trim() || busy}>{busy ? 'Загрузка…' : 'Загрузить'}</button>
        </div>
      </form>

      <section className="card">
        {sounds.length === 0 && <div className="empty">Загруженных звуков пока нет</div>}
        <div className="list">
          {sounds.map((s) => (
            <div key={s.id} className="list-item">
              <button className="btn btn-icon" title="Прослушать" onClick={() => playSound(`custom:${s.id}`, 0.8)}>▶</button>
              <div className="content">
                <div className="title">{s.name}</div>
                <div className="small muted">{(s.duration_ms / 1000).toFixed(1)} с · {Math.round(s.size / 1024)} КБ · {s.content_type}</div>
              </div>
              <button className="btn btn-ghost btn-icon" title="Удалить" onClick={() => setDeleting(s)}>🗑️</button>
            </div>
          ))}
        </div>
      </section>

      {deleting && (
        <ConfirmDialog title="Удалить звук?" onConfirm={remove} onCancel={() => setDeleting(null)}>
          <p>Звук <b>{deleting.name}</b> будет удалён. В шаблонах, где он выбран, будет использоваться стандартный звук.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
