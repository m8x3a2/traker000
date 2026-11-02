import { useState } from 'react'
import { api } from '../api'

export default function Login({ onLogin, navigate }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const tokens = await api('/login', { method: 'POST', body: { username, password } })
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
        <h1>Вход</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="login-username">Имя пользователя</label>
          <input id="login-username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div className="field">
          <label htmlFor="login-password">Пароль</label>
          <input id="login-password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
        <p className="muted small">
          Нет аккаунта? <a href="#/register" onClick={(e) => { e.preventDefault(); navigate('register') }}>Зарегистрироваться</a>
        </p>
      </form>
    </div>
  )
}
