import { useState } from 'react'
import { api } from '../api'

export default function Register({ onLogin, navigate }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const validate = () => {
    const name = username.trim()
    if (name.length < 3 || name.length > 40) return 'Имя пользователя: от 3 до 40 символов'
    if (name.includes(' ')) return 'Имя пользователя не должно содержать пробелов'
    if (password.length < 6 || password.length > 40) return 'Пароль: от 6 до 40 символов'
    if (password !== password2) return 'Пароли не совпадают'
    return ''
  }

  const submit = async (e) => {
    e.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)
    setError('')
    setBusy(true)
    try {
      const body = { username: username.trim(), password }
      await api('/register', { method: 'POST', body })
      const tokens = await api('/login', { method: 'POST', body })
      await onLogin(tokens)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Регистрация</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="reg-username">Имя пользователя</label>
          <input id="reg-username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={40} autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="reg-password">Пароль (6–40 символов)</label>
          <input id="reg-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={40} required />
        </div>
        <div className="field">
          <label htmlFor="reg-password2">Повторите пароль</label>
          <input id="reg-password2" className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} maxLength={40} required />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Создаём…' : 'Создать аккаунт'}</button>
        <p className="muted small">
          Уже есть аккаунт? <a href="#/login" onClick={(e) => { e.preventDefault(); navigate('login') }}>Войти</a>
        </p>
      </form>
    </div>
  )
}
