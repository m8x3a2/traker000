import { useState } from 'react'
import { api } from '../api'
import Modal, { ConfirmDialog } from './Modal'
import Checkbox from './Checkbox'
import { addDays, toISO } from '../dates'

export const PRIORITIES = {
  high: { label: 'Высокий', badge: 'badge-danger' },
  medium: { label: 'Средний', badge: 'badge-warning' },
  low: { label: 'Низкий', badge: '' },
}

// Быстрый выбор срока одной кнопкой
const QUICK_DATES = [
  ['Сегодня', 0],
  ['Завтра', 1],
  ['Через неделю', 7],
  ['Без срока', null],
]

// Поля задачи — используются и в форме создания, и в окне редактирования
export function TaskFields({ value, onChange, tags, compact }) {
  const set = (patch) => onChange({ ...value, ...patch })
  const now = new Date()
  const toggleTag = (id) =>
    set({ tag_ids: value.tag_ids.includes(id) ? value.tag_ids.filter((x) => x !== id) : [...value.tag_ids, id] })

  return (
    <>
      <div className="form-row">
        <div className="field grow">
          <label>{compact ? 'Новая задача' : 'Название'}</label>
          <input className="input" placeholder="Что нужно сделать?" maxLength={200} value={value.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="field">
          <label>Срок</label>
          <input className="input input-inline" type="date" value={value.due_date} onChange={(e) => set({ due_date: e.target.value })} />
        </div>
        <div className="field">
          <label>Приоритет</label>
          <select className="select input-inline" value={value.priority} onChange={(e) => set({ priority: e.target.value })}>
            {Object.entries(PRIORITIES).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <span className="small muted">Срок:</span>
        {QUICK_DATES.map(([label, days]) => {
          const iso = days == null ? '' : toISO(addDays(now, days))
          return (
            <button type="button" key={label} className={`chip ${value.due_date === iso ? 'active' : ''}`} onClick={() => set({ due_date: iso })}>
              {label}
            </button>
          )
        })}
      </div>
      {!compact && (
        <div className="field">
          <label>Описание</label>
          <textarea className="textarea" style={{ minHeight: 140 }} maxLength={2000} value={value.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
      )}
      {tags.length > 0 && (
        <div className="row">
          <span className="small muted">Теги:</span>
          {tags.map((t) => (
            <button type="button" key={t.id} className={`chip ${value.tag_ids.includes(t.id) ? 'active' : ''}`} onClick={() => toggleTag(t.id)}>
              <span className="dot" style={{ background: t.color }} />{t.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// Окно задачи: просмотр описания, изменение, удаление. Используется на страницах «Задачи» и «Дневник».
export default function TaskEditor({ task, tags, onChanged, onClose }) {
  const [form, setForm] = useState({ ...task, due_date: task.due_date || '', tag_ids: task.tags.map((x) => x.id) })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    try {
      const { title, description, due_date, priority, done, tag_ids } = form
      await api(`/tasks/${task.id}`, {
        method: 'PUT',
        body: { title, description, due_date: due_date || null, priority, done, tag_ids },
      })
      onChanged()
      onClose()
    } catch (e) { setError(e.message) }
  }

  const remove = async () => {
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' })
      onChanged()
      onClose()
    } catch (e) {
      setConfirmDelete(false)
      setError(e.message)
    }
  }

  if (confirmDelete) {
    return (
      <ConfirmDialog title="Удалить задачу?" onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
        <p>Задача «{task.title}» будет удалена без возможности восстановления.</p>
      </ConfirmDialog>
    )
  }

  return (
    <Modal
      title="Задача"
      onClose={onClose}
      actions={<>
        <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>Удалить</button>
        <button className="btn" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={save} disabled={!form.title.trim()}>Сохранить</button>
      </>}
    >
      {error && <div className="alert alert-error">{error}</div>}
      <TaskFields value={form} onChange={setForm} tags={tags} />
      <Checkbox checked={form.done} onChange={(done) => setForm({ ...form, done })} label="Выполнена" />
    </Modal>
  )
}
