import { useState } from 'react'
import Modal from './Modal'
import { formatTime, totalSeconds } from '../timer/engine'
import { playSound } from '../timer/sounds'

export const BLOCK_COLORS = ['#30a46c', '#3e7bfa', '#f5a524', '#e5484d', '#7c5cff', '#12a594', '#d6409f', '#8b93a7']
const MAX_SECONDS = 600 * 60 + 59

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// Поле «мм:сс» с кнопками −/+ (шаг 1 минута, как в мобильных интервальных таймерах)
export function DurationInput({ value, onChange, min = 1, max = MAX_SECONDS, step = 60 }) {
  const m = Math.floor(value / 60)
  const s = value % 60
  const set = (mm, ss) => onChange(clamp(mm * 60 + ss, min, max))
  return (
    <div className="duration-input">
      <button type="button" className="btn btn-icon" onClick={() => onChange(clamp(value - step, min, max))} aria-label="Меньше">−</button>
      <input className="input" inputMode="numeric" value={m} aria-label="минуты"
        onChange={(e) => set(Number(e.target.value.replace(/\D/g, '')) || 0, s)} />
      <span>:</span>
      <input className="input" inputMode="numeric" value={String(s).padStart(2, '0')} aria-label="секунды"
        onChange={(e) => set(m, clamp(Number(e.target.value.replace(/\D/g, '')) || 0, 0, 59))} />
      <button type="button" className="btn btn-icon" onClick={() => onChange(clamp(value + step, min, max))} aria-label="Больше">+</button>
    </div>
  )
}

export function CounterInput({ value, onChange, min = 1, max = 99 }) {
  return (
    <div className="duration-input">
      <button type="button" className="btn btn-icon" onClick={() => onChange(clamp(value - 1, min, max))} aria-label="Меньше">−</button>
      <input className="input" inputMode="numeric" value={value} onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, '')) || min, min, max))} />
      <button type="button" className="btn btn-icon" onClick={() => onChange(clamp(value + 1, min, max))} aria-label="Больше">+</button>
    </div>
  )
}

export function SoundSelect({ value, onChange, sounds, label, volume }) {
  return (
    <div className="field grow">
      <label>{label}</label>
      <div className="row nowrap">
        <select className="select" value={value} onChange={(e) => { onChange(e.target.value); playSound(e.target.value, volume) }}>
          <option value="none">Без звука</option>
          {sounds.map((s) => <option key={s.id} value={s.id}>{s.name}{s.builtin ? '' : ' (загружен)'}</option>)}
        </select>
        <button type="button" className="btn btn-icon" title="Прослушать" onClick={() => playSound(value, volume)}>🔊</button>
      </div>
    </div>
  )
}

// Настройки перехода и звуков — общие для редактора шаблона и быстрого старта
export function TimerOptions({ value, onChange, sounds, volume }) {
  const set = (patch) => onChange({ ...value, ...patch })
  return (
    <div className="stack">
      <div className="form-row">
        <SoundSelect label="Звук начала шага" value={value.sound_start} onChange={(v) => set({ sound_start: v })} sounds={sounds} volume={volume} />
        <SoundSelect label="Звук окончания шага" value={value.sound_end} onChange={(v) => set({ sound_end: v })} sounds={sounds} volume={volume} />
      </div>
      <div className="field">
        <label>После звукового сигнала</label>
        <label className="radio-line">
          <input type="radio" checked={value.auto_continue} onChange={() => set({ auto_continue: true })} />
          <span>продолжать автоматически через</span>
          <input className="input input-num" type="number" min={0} max={60} value={value.auto_delay} disabled={!value.auto_continue}
            onChange={(e) => set({ auto_delay: clamp(Number(e.target.value) || 0, 0, 60) })} />
          <span>сек</span>
        </label>
        <label className="radio-line">
          <input type="radio" checked={!value.auto_continue} onChange={() => set({ auto_continue: false })} />
          <span>ждать нажатия «ОК»</span>
        </label>
      </div>
      <label className="radio-line">
        <input type="checkbox" checked={value.voice} onChange={(e) => set({ voice: e.target.checked })} />
        <span>🗣️ Озвучивать голосом: название шага, длительность и номер круга</span>
      </label>
    </div>
  )
}

const newBlock = (i) => ({ title: i % 2 ? 'Отдых' : 'Работа', seconds: i % 2 ? 5 * 60 : 25 * 60, color: BLOCK_COLORS[i % 2] })

export default function PresetEditor({ preset, sounds, volume, onSave, onClose }) {
  const [form, setForm] = useState(() => structuredClone(preset))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const setBlock = (i, patch) => set({ blocks: form.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) })
  const moveBlock = (i, d) => {
    const blocks = [...form.blocks]
    ;[blocks[i], blocks[i + d]] = [blocks[i + d], blocks[i]]
    set({ blocks })
  }

  const save = async () => {
    if (!form.title.trim()) return setError('Введите название')
    if (form.blocks.some((b) => !b.title.trim())) return setError('У каждого блока должно быть название')
    setBusy(true)
    try {
      await onSave(form)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      title={preset.id ? 'Изменить шаблон' : 'Новый шаблон'}
      onClose={onClose}
      actions={
        <>
          <span className="muted small spacer">Всего: <b>{formatTime(totalSeconds(form) * 1000)}</b></span>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </>
      }
    >
      <div className="preset-editor stack">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-row">
          <div className="field grow">
            <label>Название</label>
            <input className="input" maxLength={40} value={form.title} onChange={(e) => set({ title: e.target.value })} autoFocus />
          </div>
          <div className="field">
            <label>Круги</label>
            <CounterInput value={form.rounds} onChange={(rounds) => set({ rounds })} />
          </div>
        </div>

        <div className="stack block-list">
          {form.blocks.map((b, i) => (
            <div key={i} className="block-edit" style={{ '--block': b.color }}>
              <div className="row nowrap">
                <input className="input block-title" maxLength={30} value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} aria-label="Название блока" />
                <button type="button" className="btn btn-ghost btn-icon" disabled={i === 0} onClick={() => moveBlock(i, -1)} title="Выше">↑</button>
                <button type="button" className="btn btn-ghost btn-icon" disabled={i === form.blocks.length - 1} onClick={() => moveBlock(i, 1)} title="Ниже">↓</button>
                <button type="button" className="btn btn-ghost btn-icon" disabled={form.blocks.length >= 20} title="Копировать блок"
                  onClick={() => set({ blocks: [...form.blocks.slice(0, i + 1), { ...b }, ...form.blocks.slice(i + 1)] })}>⧉</button>
                <button type="button" className="btn btn-ghost btn-icon" disabled={form.blocks.length <= 1} title="Удалить блок"
                  onClick={() => set({ blocks: form.blocks.filter((_, j) => j !== i) })}>🗑️</button>
              </div>
              <div className="row">
                <DurationInput value={b.seconds} onChange={(seconds) => setBlock(i, { seconds })} />
                <div className="row color-row">
                  {BLOCK_COLORS.map((c) => (
                    <button key={c} type="button" className={`color-dot ${b.color === c ? 'active' : ''}`} style={{ background: c }}
                      onClick={() => setBlock(i, { color: c })} aria-label={`Цвет ${c}`} />
                  ))}
                </div>
              </div>
            </div>
          ))}
          <button type="button" className="btn add-card-btn" disabled={form.blocks.length >= 20}
            onClick={() => set({ blocks: [...form.blocks, newBlock(form.blocks.length)] })}>＋ Добавить блок</button>
        </div>

        <div className="field">
          <label>Перерыв между кругами (0 — без перерыва)</label>
          <DurationInput value={form.break_seconds} min={0} max={3600} onChange={(break_seconds) => set({ break_seconds })} />
        </div>

        <TimerOptions value={form} onChange={(v) => setForm(v)} sounds={sounds} volume={volume} />
      </div>
    </Modal>
  )
}
