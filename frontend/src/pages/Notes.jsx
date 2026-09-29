import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

const MAX_LENGTH = 20000

// Одна «плашка» для заметок вместо сотни разрозненных записей
export default function Notes() {
  const [content, setContent] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const saved = useRef('')

  useEffect(() => {
    api('/note')
      .then((note) => {
        setContent(note.content)
        saved.current = note.content
        setLoaded(true)
      })
      .catch((e) => setError(e.message))
  }, [])

  const save = async (value) => {
    if (value === saved.current) return
    setStatus('Сохранение…')
    try {
      await api('/note', { method: 'PUT', body: { content: value } })
      saved.current = value
      setStatus('Сохранено ✓')
      setError('')
    } catch (e) {
      setStatus('')
      setError(e.message)
    }
  }

  // Автосохранение через 800 мс после окончания ввода
  useEffect(() => {
    if (!loaded) return
    const timer = setTimeout(() => save(content), 800)
    return () => clearTimeout(timer)
  }, [content, loaded])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Заметки</h1>
          <p className="subtitle">Одно место для всех мыслей, списков и идей — сохраняется автоматически</p>
        </div>
        <span className="small muted">{status || (loaded ? `${content.length} / ${MAX_LENGTH}` : '')}</span>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loaded && (
        <textarea
          className="note-area"
          placeholder={'Пишите что угодно…\n\nСписок покупок, идеи, ссылки, цитаты.'}
          maxLength={MAX_LENGTH}
          value={content}
          onChange={(e) => { setContent(e.target.value); setStatus('') }}
          onBlur={() => save(content)}
        />
      )}
    </div>
  )
}
