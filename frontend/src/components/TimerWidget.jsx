import { useState } from 'react'
import { SNOOZE_MINUTES, currentStep, formatTime, nextStep, remaining } from '../timer/engine'
import { timer, useTimer } from '../timer/store'

const PHASE_LABEL = {
  running: null,
  paused: 'Пауза',
  waiting: 'Шаг завершён',
  transition: 'Далее',
  snoozed: 'Отложено',
  finished: 'Готово!',
}

// Кнопки управления — общие для страницы «Фокус» и плавающего виджета
export function TimerActions({ state, compact = false }) {
  const sm = compact ? 'btn-sm' : ''
  const { phase } = state
  if (phase === 'finished') {
    return (
      <div className="row timer-actions">
        <button className={`btn btn-primary ${sm}`} onClick={timer.restart}>↻ Ещё раз</button>
        <button className={`btn ${sm}`} onClick={timer.stop}>Закрыть</button>
      </div>
    )
  }
  const snoozeBtn = (
    <button className={`btn ${sm}`} onClick={timer.snooze} title={`Отложить на ${SNOOZE_MINUTES} минут`}>
      💤 {compact ? `${SNOOZE_MINUTES} мин` : `Отложить на ${SNOOZE_MINUTES} мин`}
    </button>
  )
  return (
    <div className="row timer-actions">
      {phase === 'waiting' && <button className={`btn btn-primary ${sm}`} onClick={timer.confirm}>✓ ОК</button>}
      {phase === 'transition' && <button className={`btn btn-primary ${sm}`} onClick={timer.confirm}>▶ Сейчас</button>}
      {phase === 'snoozed' && <button className={`btn btn-primary ${sm}`} onClick={timer.confirm}>▶ Продолжить</button>}
      {phase === 'running' && <button className={`btn ${sm}`} onClick={timer.pause} title="Пауза">⏸{!compact && ' Пауза'}</button>}
      {phase === 'paused' && <button className={`btn btn-primary ${sm}`} onClick={timer.resume} title="Продолжить">▶{!compact && ' Продолжить'}</button>}
      {phase !== 'paused' && snoozeBtn}
      {(phase === 'running' || phase === 'paused') && <button className={`btn ${sm}`} onClick={timer.skip} title="Пропустить шаг">⏭</button>}
      <button className={`btn btn-ghost ${sm}`} onClick={timer.stop} title="Остановить таймер">⏹{!compact && ' Стоп'}</button>
    </div>
  )
}

export function phaseHint(state, now) {
  const next = nextStep(state)
  switch (state.phase) {
    case 'waiting': return next ? `Нажмите «ОК», чтобы начать: ${next.title}` : ''
    case 'transition': return next ? `${next.title} начнётся через ${Math.ceil(remaining(state, now) / 1000)} с` : ''
    case 'snoozed': return state.resumeMs != null ? `Шаг продолжится через ${formatTime(remaining(state, now))}` : `${next?.title ?? ''} начнётся через ${formatTime(remaining(state, now))}`
    case 'paused': return 'Таймер на паузе'
    case 'finished': return `«${state.preset.title}» завершён`
    default: return next ? `Далее: ${next.title}` : 'Последний шаг'
  }
}

// Плавающий таймер на всех страницах (включается переключателем на странице «Фокус»)
export default function TimerWidget({ onOpen }) {
  const { state, now, prefs } = useTimer()
  const [collapsed, setCollapsed] = useState(false)
  if (!state || !prefs.showEverywhere) return null

  const step = currentStep(state)
  const attention = state.phase === 'waiting' || state.phase === 'finished'
  const shown = state.phase === 'waiting' ? 0 : remaining(state, now)

  if (collapsed && !attention) {
    return (
      <button className="timer-pill" style={{ '--step': step.color }} onClick={() => setCollapsed(false)} title="Развернуть таймер">
        <span className="dot" style={{ background: step.color }} />
        {state.phase === 'paused' ? '⏸ ' : state.phase === 'snoozed' ? '💤 ' : ''}{formatTime(shown)}
      </button>
    )
  }

  return (
    <div className={`timer-widget ${attention ? 'attention' : ''}`} style={{ '--step': step.color }} role="status">
      <div className="timer-widget-head">
        <button className="timer-widget-title" onClick={onOpen} title="Открыть страницу «Фокус»">
          <span className="dot" style={{ background: step.color }} />
          <span>{PHASE_LABEL[state.phase] ?? step.title}</span>
          <span className="muted small">круг {step.round}/{state.preset.rounds}</span>
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCollapsed(true)} title="Свернуть">—</button>
      </div>
      <div className="timer-widget-time">{state.phase === 'finished' ? '✓' : formatTime(shown)}</div>
      <div className="small muted">{phaseHint(state, now)}</div>
      <TimerActions state={state} compact />
    </div>
  )
}
