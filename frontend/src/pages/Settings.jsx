import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { COLOR_LABELS, PRESETS, applyTheme, loadLocalTheme, saveLocalTheme } from '../theme'
import { ConfirmDialog } from '../components/Modal'
import { todayISO } from '../dates'

const THEME_OPTIONS = [
  { id: 'dark', label: 'Тёмная' },
  { id: 'light', label: 'Светлая' },
  { id: 'custom', label: 'Своя' },
]

export default function Settings({ user, reloadUser }) {
  const initial = loadLocalTheme()
  const [theme, setTheme] = useState(initial.theme)
  const [colors, setColors] = useState(initial.custom_colors || PRESETS.dark)
  const [message, setMessage] = useState(null)

  // Уходя со страницы, возвращаем сохранённую тему (если предпросмотр не сохранили)
  useEffect(() => () => {
    const saved = loadLocalTheme()
    applyTheme(saved.theme, saved.custom_colors)
  }, [])

  const preview = (nextTheme, nextColors) => {
    setTheme(nextTheme)
    setColors(nextColors)
    applyTheme(nextTheme, nextColors)
  }

  const saveTheme = async () => {
    const data = { theme, custom_colors: colors }
    try {
      if (user) await api('/settings', { method: 'PUT', body: data })
      saveLocalTheme(data)
      setMessage({ type: 'success', text: user ? 'Тема сохранена в аккаунте' : 'Тема сохранена в этом браузере' })
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    }
  }

  const cancelTheme = () => {
    const saved = loadLocalTheme()
    preview(saved.theme, saved.custom_colors || PRESETS.dark)
    setMessage(null)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Настройки</h1>
          <p className="subtitle">{user ? `Аккаунт: ${user.username}` : 'Вы гость — тема сохранится только в этом браузере'}</p>
        </div>
      </div>

      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <section className="card stack">
        <h2>Тема оформления</h2>
        <div className="theme-options">
          {THEME_OPTIONS.map((opt) => {
            const c = opt.id === 'custom' ? colors : PRESETS[opt.id]
            return (
              <button key={opt.id} className={`theme-option ${theme === opt.id ? 'active' : ''}`} onClick={() => preview(opt.id, colors)}>
                <div className="theme-preview">
                  <div style={{ background: c.bg }} />
                  <div style={{ background: c.surface }} />
                  <div style={{ background: c.accent }} />
                  <div style={{ background: c.text }} />
                </div>
                <b>{opt.label}</b>
              </button>
            )
          })}
        </div>

        {theme === 'custom' && (
          <>
            <div className="row">
              <span className="small muted">Начать с:</span>
              <button className="btn btn-sm" onClick={() => preview('custom', { ...PRESETS.dark })}>тёмной</button>
              <button className="btn btn-sm" onClick={() => preview('custom', { ...PRESETS.light })}>светлой</button>
            </div>
            <div className="color-grid">
              {Object.keys(COLOR_LABELS).map((key) => (
                <label key={key} className="color-field">
                  <input type="color" value={colors[key]} onChange={(e) => preview('custom', { ...colors, [key]: e.target.value })} />
                  <span className="small">{COLOR_LABELS[key]}</span>
                  <span className="hex">{colors[key]}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="row">
          <button className="btn btn-primary" onClick={saveTheme}>Сохранить тему</button>
          <button className="btn" onClick={cancelTheme}>Отменить изменения</button>
        </div>
      </section>

      {user && <DataSection onImported={reloadUser} />}
    </div>
  )
}

function DataSection({ onImported }) {
  const fileRef = useRef(null)
  const [pending, setPending] = useState(null) // { fileName, data }
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const exportData = async () => {
    try {
      const data = await api('/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `traker000-${todayISO()}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: 'Файл экспорта скачан' })
    } catch (e) {
      setMessage({ type: 'error', text: e.message })
    }
  }

  const onFile = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // чтобы можно было выбрать тот же файл повторно
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (data?.app !== 'traker000') throw new Error('Это не файл экспорта Traker000')
      setPending({ fileName: file.name, data })
      setMessage(null)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof SyntaxError ? 'Файл повреждён или не является JSON' : err.message })
    }
  }

  const confirmImport = async () => {
    setBusy(true)
    try {
      const res = await api('/import', { method: 'POST', body: pending.data })
      setPending(null)
      setMessage({ type: 'success', text: `${res.detail}: привычек ${res.habits}, задач ${res.tasks}, тегов ${res.tags}, записей дневника ${res.diary}, шаблонов таймера ${res.timers}` })
      await onImported()
    } catch (e) {
      setPending(null)
      setMessage({ type: 'error', text: `Импорт не выполнен, данные не изменены. ${e.message}` })
    } finally {
      setBusy(false)
    }
  }

  const count = (key) => (Array.isArray(pending?.data?.[key]) ? pending.data[key].length : 0)

  return (
    <section className="card stack">
      <h2>Данные</h2>
      <p className="muted small">
        Экспорт сохраняет все ваши привычки, задачи, теги, дневник, заметку, шаблоны таймера и тему в JSON-файл.
        Импорт <b>заменяет</b> текущие данные содержимым файла.
      </p>
      {message && <div className={`alert alert-${message.type}`}>{message.text}</div>}
      <div className="row">
        <button className="btn" onClick={exportData}>⬇️ Экспорт в JSON</button>
        <button className="btn" onClick={() => fileRef.current.click()}>⬆️ Импорт из JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      </div>

      {pending && (
        <ConfirmDialog title="⚠️ Заменить все данные?" confirmLabel="Да, заменить" busy={busy} onConfirm={confirmImport} onCancel={() => setPending(null)}>
          <div className="alert alert-warning">
            Все ваши текущие привычки, задачи, теги, записи дневника и заметка будут <b>удалены</b> и заменены данными из файла.
            Это действие нельзя отменить.
          </div>
          <p className="small">
            Файл <b>{pending.fileName}</b>: привычек {count('habits')}, задач {count('tasks')}, тегов {count('tags')}, записей дневника {count('diary')}, шаблонов таймера {count('timers')}.
          </p>
          <p className="small muted">Совет: сначала сделайте экспорт текущих данных, чтобы иметь резервную копию.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
