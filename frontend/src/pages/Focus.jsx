import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { ConfirmDialog } from '../components/Modal'
import PresetEditor, { CounterInput, DurationInput, TimerOptions } from '../components/PresetEditor'
import { TimerActions, phaseHint } from '../components/TimerWidget'
import { DEFAULT_PRESETS, currentStep, formatTime, quickPreset, remaining, totalRemaining, totalSeconds } from '../timer/engine'
import { BUILTIN_SOUNDS, canSpeak } from '../timer/sounds'
import { timer, useTimer } from '../timer/store'

const EMPTY_PRESET = {
  title: '', rounds: 4, break_seconds: 0,
  blocks: [{ title: 'Работа', seconds: 25 * 60, color: '#30a46c' }, { title: 'Отдых', seconds: 5 * 60, color: '#3e7bfa' }],
  sound_start: 'bell', sound_end: 'gong', auto_continue: true, auto_delay: 5, voice: false,
}

export default function Focus({ user, navigate }) {
  const { state, now, prefs } = useTimer()
  const [presets, setPresets] = useState([])
  const [sounds, setSounds] = useState(BUILTIN_SOUNDS)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) { setPresets(DEFAULT_PRESETS); return }
    try {
      setPresets(await api('/timers'))
    } catch (e) { setError(e.message) }
  }, [user])

  useEffect(() => { load() }, [load])
  useEffect(() => { api('/sounds').then(setSounds).catch(() => {}) }, [])

  const savePreset = async (form) => {
    const body = { ...form }
    delete body.id; delete body.position; delete body.total_seconds
    if (form.id) await api(`/timers/${form.id}`, { method: 'PUT', body })
    else await api('/timers', { method: 'POST', body })
    setEditing(null)
    load()
  }

  const remove = async () => {
    try {
      await api(`/timers/${deleting.id}`, { method: 'DELETE' })
      setDeleting(null)
      load()
    } catch (e) { setError(e.message) }
  }

  const restoreDefaults = async () => {
    try { setPresets(await api('/timers/defaults', { method: 'POST' })) } catch (e) { setError(e.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Фокус</h1>
          <p className="subtitle">Интервальный таймер: блоки работы и отдыха, круги, звуки и озвучка</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {state && <ActiveTimer state={state} now={now} />}

      <TimerSettings prefs={prefs} />

      <QuickStart prefs={prefs} sounds={sounds} user={user} onSaveAsPreset={(p) => setEditing({ ...p, title: '' })} />

      <section className="stack">
        <div className="card-title">
          <h2>{user ? 'Мои шаблоны' : 'Стандартные шаблоны'}</h2>
          {user ? (
            <div className="row">
              <button className="btn btn-sm" onClick={restoreDefaults} title="Вернуть удалённые стандартные шаблоны">↺ Стандартные</button>
              <button className="btn btn-sm btn-primary" onClick={() => setEditing(structuredClone(EMPTY_PRESET))}>＋ Добавить</button>
            </div>
          ) : (
            <span className="small muted">
              <a href="#/login" onClick={(e) => { e.preventDefault(); navigate('login') }}>Войдите</a>, чтобы сохранять свои шаблоны
            </span>
          )}
        </div>
        {presets.length === 0 && <div className="card empty">Шаблонов нет — создайте свой или верните стандартные</div>}
        <div className="grid grid-2">
          {presets.map((p, i) => (
            <PresetCard
              key={p.id ?? i}
              preset={p}
              onStart={() => timer.start(p)}
              onEdit={user ? () => setEditing(structuredClone(p)) : null}
              onCopy={user ? () => setEditing({ ...structuredClone(p), id: undefined, title: `${p.title} (копия)`.slice(0, 40) }) : null}
              onDelete={user ? () => setDeleting(p) : null}
            />
          ))}
        </div>
      </section>

      {editing && (
        <PresetEditor preset={editing} sounds={sounds} volume={prefs.volume} onSave={savePreset} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmDialog title="Удалить шаблон?" onConfirm={remove} onCancel={() => setDeleting(null)}>
          <p>Шаблон <b>{deleting.title}</b> будет удалён.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function ActiveTimer({ state, now }) {
  const step = currentStep(state)
  const left = state.phase === 'waiting' ? 0 : remaining(state, now)
  const progress = state.phase === 'running' || (state.phase === 'paused' && state.pausedPhase === 'running')
    ? 100 - (left / (step.seconds * 1000)) * 100 : state.phase === 'finished' ? 100 : 0
  return (
    <section className={`card timer-active phase-${state.phase}`} style={{ '--step': step.color }}>
      <div className="row">
        <span className="badge" style={{ background: step.color, color: '#fff' }}>{step.kind === 'break' ? 'Перерыв' : step.title}</span>
        <span className="muted small">«{state.preset.title}» · круг {step.round} из {state.preset.rounds} · шаг {state.index + 1} из {state.steps.length}</span>
        <span className="spacer" />
        <span className="muted small">до конца ≈ {formatTime(totalRemaining(state, now))}</span>
      </div>
      <div className="timer-big">{state.phase === 'finished' ? 'Готово!' : formatTime(left)}</div>
      <div className="progress"><div style={{ width: `${progress}%`, background: step.color }} /></div>
      <p className="muted">{phaseHint(state, now)}</p>
      <TimerActions state={state} />
      <div className="step-strip" aria-label="Шаги таймера">
        {state.steps.map((s, i) => (
          <div key={i} title={`${s.title} · ${formatTime(s.seconds * 1000)}`}
            className={i < state.index ? 'done' : i === state.index ? 'current' : ''}
            style={{ flexGrow: s.seconds, background: s.color }} />
        ))}
      </div>
    </section>
  )
}

function TimerSettings({ prefs }) {
  return (
    <section className="card row timer-settings">
      <label className="switch-line" title="Таймер будет виден в углу экрана на любой странице приложения">
        <input type="checkbox" role="switch" checked={prefs.showEverywhere} onChange={(e) => timer.setPrefs({ showEverywhere: e.target.checked })} />
        <span className="switch" aria-hidden="true" />
        <span>Показывать таймер на всех страницах</span>
      </label>
      <label className="row nowrap volume-line">
        <span title="Громкость">{prefs.volume > 0 ? '🔊' : '🔇'}</span>
        <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => timer.setPrefs({ volume: Number(e.target.value) })} aria-label="Громкость" />
      </label>
      {!canSpeak() && <span className="small muted">Озвучка голосом не поддерживается этим браузером</span>}
    </section>
  )
}

function QuickStart({ prefs, sounds, user, onSaveAsPreset }) {
  const [open, setOpen] = useState(false)
  const q = prefs.quick
  const setQuick = (patch) => timer.setPrefs({ quick: { ...q, ...patch } })
  const preset = quickPreset(q, prefs.quickOptions)
  return (
    <section className="card stack">
      <div className="card-title">
        <h2>⚡ Быстрый старт</h2>
        <span className="muted small">всего {formatTime(totalSeconds(preset) * 1000)}</span>
      </div>
      <div className="quick-grid">
        <div className="field">
          <label>Круги</label>
          <CounterInput value={q.rounds} onChange={(rounds) => setQuick({ rounds })} />
        </div>
        <div className="field">
          <label>Работа</label>
          <DurationInput value={q.work} min={5} step={30} onChange={(work) => setQuick({ work })} />
        </div>
        <div className="field">
          <label>Отдых</label>
          <DurationInput value={q.rest} min={0} step={30} onChange={(rest) => setQuick({ rest })} />
        </div>
      </div>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} Звуки, озвучка и переход к следующему шагу
      </button>
      {open && (
        <TimerOptions value={prefs.quickOptions} onChange={(v) => timer.setPrefs({ quickOptions: v })} sounds={sounds} volume={prefs.volume} />
      )}
      <div className="row">
        <button className="btn btn-primary" onClick={() => timer.start(preset)}>▶ Начать</button>
        {user && <button className="btn" onClick={() => onSaveAsPreset(preset)}>💾 Сохранить как шаблон</button>}
      </div>
    </section>
  )
}

function PresetCard({ preset, onStart, onEdit, onCopy, onDelete }) {
  const roundSeconds = preset.blocks.reduce((s, b) => s + b.seconds, 0)
  return (
    <div className="card preset-card stack">
      <div className="card-title" style={{ marginBottom: 0 }}>
        <h3>{preset.title}</h3>
        <span className="preset-total">{formatTime(totalSeconds(preset) * 1000)}</span>
      </div>
      <div className="preset-bar">
        <span className="preset-rounds">{preset.rounds}×</span>
        {preset.blocks.map((b, i) => (
          <div key={i} style={{ flexGrow: b.seconds / roundSeconds, background: b.color }} title={b.title}>
            <span>{b.title}</span>
            <span>{formatTime(b.seconds * 1000)}</span>
          </div>
        ))}
      </div>
      <div className="row small muted">
        <span>{preset.auto_continue ? `▶ авто через ${preset.auto_delay} с` : '✓ ждать «ОК»'}</span>
        {preset.break_seconds > 0 && <span>· перерыв {formatTime(preset.break_seconds * 1000)}</span>}
        {preset.voice && <span>· 🗣️ озвучка</span>}
      </div>
      <div className="row">
        {onEdit && <button className="btn btn-ghost btn-icon" title="Изменить" onClick={onEdit}>✏️</button>}
        {onCopy && <button className="btn btn-ghost btn-icon" title="Копировать" onClick={onCopy}>⧉</button>}
        {onDelete && <button className="btn btn-ghost btn-icon" title="Удалить" onClick={onDelete}>🗑️</button>}
        <span className="spacer" />
        <button className="btn btn-primary" onClick={onStart}>▶ Начать</button>
      </div>
    </div>
  )
}
