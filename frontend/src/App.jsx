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
import Focus from './pages/Focus'
import Catalog from './pages/Catalog'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
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

const SIDEBAR_KEY = 'traker_sidebar_collapsed'
const readCollapsed = () => {
  try { return localStorage.getItem(SIDEBAR_KEY) === '1' } catch { return false }
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [route, setRoute] = useState(readRoute())
  const [collapsed, setCollapsed] = useState(readCollapsed) // меню свёрнуто до иконок

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') } catch { /* не критично */ }
  }, [collapsed])

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
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo">✓</span>
          <span className="brand-name">Traker000</span>
        </div>
        <nav className="nav">
          {navItems.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => navigate(n.id)}
              title={n.label}
              aria-label={n.label}
              aria-current={page === n.id ? 'page' : undefined}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {n.id === 'focus' && <NavTimer />}
            </button>
          ))}
        </nav>
        <button
          className="nav-item sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          aria-expanded={!collapsed}
        >
          <span className="nav-icon"><Icon path={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></span>
          <span className="nav-label">Свернуть меню</span>
        </button>
        <div className="sidebar-footer">
          {user ? (
            <>
              <div className="user-line">
                <span className="user-avatar" title={`${user.username} · ${ROLE_LABELS[role]}`}>{user.username[0].toUpperCase()}</span>
                <span className="user-name hide-collapsed">{user.username}</span>
                <span className={`badge hide-collapsed ${role === 'admin' ? 'badge-accent' : ''}`}>{ROLE_LABELS[role]}</span>
              </div>
              <button className="nav-item footer-btn" onClick={logout} title="Выйти">
                <span className="nav-icon"><Icon path="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></span>
                <span className="nav-label">Выйти</span>
              </button>
            </>
          ) : (
            <>
              <span className="muted small nav-label">Вы вошли как гость</span>
              <div className="row hide-collapsed">
                <button className="btn btn-sm btn-primary" onClick={() => navigate('login')}>Войти</button>
                <button className="btn btn-sm" onClick={() => navigate('register')}>Регистрация</button>
              </div>
              <button className="nav-item footer-btn show-collapsed" onClick={() => navigate('login')} title="Войти">
                <span className="nav-icon"><Icon path="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M14 7l5 5-5 5M19 12H8" /></span>
              </button>
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

// Простая линейная иконка 24×24 (цвет — от текста)
function Icon({ path }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  )
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
