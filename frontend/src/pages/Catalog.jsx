import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'

const FEATURES = [
  ['🔁', 'Привычки', 'Отмечайте дни и следите за сериями'],
  ['✅', 'Задачи', 'Сроки, приоритеты и теги'],
  ['📅', 'Дневник', 'Неделя карточками: настроение и записи'],
  ['📝', 'Заметки', 'Одна плашка вместо сотни заметок'],
]

export default function Catalog({ user, navigate }) {
  const [templates, setTemplates] = useState([])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [added, setAdded] = useState(new Set())
  const [error, setError] = useState('')

  useEffect(() => {
    api('/templates').then(setTemplates).catch((e) => setError(e.message))
  }, [])

  const categories = useMemo(() => [...new Set(templates.map((t) => t.category).filter(Boolean))], [templates])
  const visible = templates.filter(
    (t) => (!category || t.category === category) && t.title.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const addToMe = async (t) => {
    try {
      await api('/habits', { method: 'POST', body: { title: t.title, description: t.description, icon: t.icon, template_id: t.id } })
      setAdded((prev) => new Set(prev).add(t.id))
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="page">
      {!user && (
        <section className="card hero">
          <h1>Traker000 — привычки, задачи и дневник в одном месте</h1>
          <p className="muted">Без перегруза: неделя на одном экране и одна заметка вместо сотни.</p>
          <div className="feature-list">
            {FEATURES.map(([icon, title, text]) => (
              <div key={title} className="feature">
                <span style={{ fontSize: 22 }}>{icon}</span>
                <div><b>{title}</b><div className="small muted">{text}</div></div>
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={() => navigate('register')}>Начать бесплатно</button>
            <button className="btn" onClick={() => navigate('login')}>У меня есть аккаунт</button>
          </div>
        </section>
      )}

      <div className="page-header">
        <div>
          <h1>Каталог привычек</h1>
          <p className="subtitle">Готовые идеи — добавьте себе в один клик</p>
        </div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="🔍 Поиск" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {categories.length > 0 && (
        <div className="row">
          <button className={`chip ${!category ? 'active' : ''}`} onClick={() => setCategory('')}>Все</button>
          {categories.map((c) => (
            <button key={c} className={`chip ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="card empty">Ничего не найдено</div>
      ) : (
        <div className="grid grid-cards">
          {visible.map((t) => (
            <div key={t.id} className="card template-card">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <span className="habit-icon">{t.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="habit-title">{t.title}</div>
                  {t.category && <span className="small muted">{t.category}</span>}
                </div>
              </div>
              <p className="desc">{t.description}</p>
              {user ? (
                <button className="btn btn-sm" disabled={added.has(t.id)} onClick={() => addToMe(t)}>
                  {added.has(t.id) ? '✓ Добавлено' : '+ Добавить себе'}
                </button>
              ) : (
                <button className="btn btn-sm" onClick={() => navigate('login')}>Войти, чтобы добавить</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
