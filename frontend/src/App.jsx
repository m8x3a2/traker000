import { useCallback, useEffect, useState } from 'react'
import { api, getToken, logoutRequest, setTokens, setUnauthorizedHandler } from './api'
import { applyTheme, loadLocalTheme, saveLocalTheme } from './theme'
import Login from './pages/Login'
import Register from './pages/Register'
import Today from './pages/Today'
import Habits from './pages/Habits'
import Tasks from './pages/Tasks'
import Week from './pages/Week'
import Notes from './pages/Notes'
import Catalog from './pages/Catalog'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import Focus from './pages/Focus'
import TimerWidget from './components/TimerWidget'
import { currentStep, formatTime, remaining } from './timer/engine'
import { useTimer } from './timer/store'

// auth: только для вошедших, admin: только для администраторов
const NAV = [
  { id: 'today', label: 'Сегодня', icon: '🏠', auth: true },
  { id: 'habits', label: 'Привычки', icon: '🔁', auth: true },
  { id: 'tasks', label: 'Задачи', icon: '✅', auth: true },
  { id: 'week', label: 'Дневник', icon: '📅', auth: true },
  { id: 'notes', label: 'Заметки', icon: '📝', auth: true },
  { id: 'focus', label: 'Фокус', icon: '⏱️' },
  { id: 'catalog', label: 'Каталог', icon: '📚' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
  { id: 'admin', label: 'Админ', icon: '🛡️', auth: true, admin: true },
]

const PAGES = { today: Today, habits: Habits, tasks: Tasks, week: Week, notes: Notes, focus: Focus, catalog: Catalog, settings: Settings, admin: Admin }

const readRoute = () => window.location.hash.replace(/^#\/?/, '')
const navigate = (id) => { window.location.hash = '/' + id }

const ROLE_LABELS = { guest: 'Гость', client: 'Клиент', admin: 'Админ' }

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [route, setRoute] = useState(readRoute())

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const logout = useCallback(() => {
    logoutRequest()
    setUser(null)
    navigate('login')
  }, [])

  useEffect(() => setUnauthorizedHandler(logout), [logout])

  // Загружает пользователя и его тему с сервера
  const loadUser = useCallback(async () => {
    const me = await api('/me')
    setUser(me)
    try {
      const s = await api('/settings')
      applyTheme(s.theme, s.custom_colors)
      saveLocalTheme(s)
    } catch { /* тема не критична */ }
    return me
  }, [])

  useEffect(() => {
    const local = loadLocalTheme()
    applyTheme(local.theme, local.custom_colors)
    if (getToken()) {
      loadUser()
        .catch(() => setTokens(null))
        .finally(() => setLoading(false))
    }
  }, [loadUser])

  const handleLogin = async (tokens) => {
    setTokens(tokens)
    await loadUser()
    navigate('today')
  }

  const role = user?.role ?? 'guest'
  const navItems = NAV.filter((n) => (!n.auth || user) && (!n.admin || role === 'admin'))

  let page = route || (user ? 'today' : 'catalog')
  let content
  if (loading) {
    content = <div className="empty">Загрузка…</div>
  } else if (page === 'login') {
    content = <Login onLogin={handleLogin} navigate={navigate} />
  } else if (page === 'register') {
    content = <Register onLogin={handleLogin} navigate={navigate} />
  } else {
    const item = NAV.find((n) => n.id === page)
    if (!item) page = user ? 'today' : 'catalog'
    const current = NAV.find((n) => n.id === page)
    const Page = PAGES[page]
    if (current.auth && !user) {
      content = <AuthRequired />
    } else if (current.admin && role !== 'admin') {
      content = <div className="card empty">⛔ Раздел доступен только администраторам</div>
    } else {
      content = <Page user={user} navigate={navigate} reloadUser={loadUser} />
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">✓</span>
          <span>Traker000</span>
        </div>
        <nav className="nav">
          {navItems.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => navigate(n.id)}
              title={n.label}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {n.id === 'focus' && <NavTimer />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {user ? (
            <>
              <div className="user-line">
                <span className="user-name">{user.username}</span>
                <span className={`badge ${role === 'admin' ? 'badge-accent' : ''}`}>{ROLE_LABELS[role]}</span>
              </div>
              <button className="btn btn-sm" onClick={logout}>Выйти</button>
            </>
          ) : (
            <>
              <span className="muted small nav-label">Вы вошли как гость</span>
              <div className="row">
                <button className="btn btn-sm btn-primary" onClick={() => navigate('login')}>Войти</button>
                <button className="btn btn-sm" onClick={() => navigate('register')}>Регистрация</button>
              </div>
            </>
          )}
        </div>
      </aside>
      <main className="main">{content}</main>
      {page !== 'focus' && <TimerWidget onOpen={() => navigate('focus')} />}
    </div>
  )
}

// Оставшееся время запущенного таймера рядом с пунктом меню «Фокус»
function NavTimer() {
  const { state, now } = useTimer()
  if (!state || state.phase === 'finished') return null
  const step = currentStep(state)
  const text = state.phase === 'waiting' ? 'ОК?' : state.phase === 'paused' ? '⏸' : formatTime(remaining(state, now))
  return <span className="nav-timer" style={{ background: step.color }}>{text}</span>
}

function AuthRequired() {
  return (
    <div className="page">
      <div className="card empty stack" style={{ alignItems: 'center' }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <h2>Нужно войти</h2>
        <p>Этот раздел доступен после входа. Гостям доступны каталог привычек, фокус-таймер и настройки темы.</p>
        <div className="row">
          <button className="btn btn-primary" onClick={() => navigate('login')}>Войти</button>
          <button className="btn" onClick={() => navigate('register')}>Создать аккаунт</button>
        </div>
      </div>
    </div>
  )
}
