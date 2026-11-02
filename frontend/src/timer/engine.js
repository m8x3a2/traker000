// Логика интервального таймера без React и без побочных эффектов — её покрывают модульные тесты.
// Время считается по отметке окончания шага (endAt), а не по числу тиков: таймер не «отстаёт»
// в фоновой вкладке и продолжает с того же места после перезагрузки страницы.

export const SNOOZE_MINUTES = 10
export const BREAK_COLOR = '#8b93a7'

export const DEFAULT_OPTIONS = { sound_start: 'bell', sound_end: 'gong', auto_continue: true, auto_delay: 5, voice: false }

// Те же стандартные шаблоны, что на сервере, — гость пользуется ими без входа
export const DEFAULT_PRESETS = [
  {
    title: 'Помодоро', rounds: 4, break_seconds: 15 * 60,
    blocks: [{ title: 'Работа', seconds: 25 * 60, color: '#30a46c' }, { title: 'Перерыв', seconds: 5 * 60, color: '#3e7bfa' }],
    sound_start: 'bell', sound_end: 'gong', auto_continue: true, auto_delay: 5, voice: false,
  },
  {
    title: '52/17', rounds: 3, break_seconds: 0,
    blocks: [{ title: 'Фокус', seconds: 52 * 60, color: '#f5a524' }, { title: 'Отдых', seconds: 17 * 60, color: '#3e7bfa' }],
    sound_start: 'beep', sound_end: 'gong', auto_continue: false, auto_delay: 5, voice: false,
  },
  {
    title: 'Учёба', rounds: 4, break_seconds: 0,
    blocks: [{ title: 'Учёба', seconds: 45 * 60, color: '#30a46c' }, { title: 'Разминка тела', seconds: 10 * 60, color: '#3e7bfa' }],
    sound_start: 'bell', sound_end: 'bell', auto_continue: false, auto_delay: 5, voice: true,
  },
]

export function quickPreset({ rounds, work, rest }, options = DEFAULT_OPTIONS) {
  const blocks = [{ title: 'Работа', seconds: work, color: '#30a46c' }]
  if (rest > 0) blocks.push({ title: 'Отдых', seconds: rest, color: '#3e7bfa' })
  return { title: 'Быстрый старт', rounds, break_seconds: 0, blocks, ...options }
}

export const totalSeconds = (p) =>
  p.blocks.reduce((s, b) => s + b.seconds, 0) * p.rounds + p.break_seconds * (p.rounds - 1)

// Развёртывает шаблон в плоский список шагов: блоки × круги, перерыв — только между кругами
export function buildSteps(preset) {
  const steps = []
  for (let round = 1; round <= preset.rounds; round++) {
    for (const b of preset.blocks) steps.push({ kind: 'block', title: b.title, seconds: b.seconds, color: b.color, round })
    if (round < preset.rounds && preset.break_seconds > 0) {
      steps.push({ kind: 'break', title: 'Перерыв между кругами', seconds: preset.break_seconds, color: BREAK_COLOR, round })
    }
  }
  return steps
}

/*
  Фазы таймера:
    running    — идёт обратный отсчёт шага
    transition — шаг закончился, следующий начнётся автоматически через auto_delay секунд
    waiting    — шаг закончился, ждём нажатия «ОК» (режим без автопродолжения)
    snoozed    — отложено на 10 минут; затем продолжится текущий шаг (resumeMs) или начнётся следующий
    paused     — пауза (pausedPhase — из какой фазы, remainingMs — сколько оставалось)
    finished   — все шаги пройдены
*/

export function start(preset, now) {
  const steps = buildSteps(preset)
  return startStep({ preset, steps, index: 0, startedAt: now }, 0, now)
}

export function startStep(state, index, now) {
  return { ...state, index, phase: 'running', endAt: now + state.steps[index].seconds * 1000, remainingMs: null, resumeMs: null }
}

export const currentStep = (s) => s?.steps[s.index] ?? null
export const nextStep = (s) => s?.steps[s.index + 1] ?? null

// Сколько миллисекунд показывать на циферблате в текущей фазе
export function remaining(s, now) {
  if (!s) return 0
  if (s.phase === 'paused') return s.remainingMs
  if (s.phase === 'waiting' || s.phase === 'finished') return 0
  return Math.max(0, s.endAt - now)
}

// Сколько осталось до конца всего таймера (без учёта ожидания и откладываний)
export function totalRemaining(s, now) {
  if (!s || s.phase === 'finished') return 0
  const rest = s.steps.slice(s.index + 1).reduce((sum, st) => sum + st.seconds * 1000, 0)
  const runningLeft = s.phase === 'running' ? remaining(s, now) : s.phase === 'paused' && s.pausedPhase === 'running' ? s.remainingMs : 0
  const snoozeLeft = s.resumeMs ?? 0
  return rest + runningLeft + snoozeLeft
}

function finishStep(s, now, events) {
  const last = s.index >= s.steps.length - 1
  events.push({ type: 'step-end', step: s.steps[s.index], last })
  if (last) {
    events.push({ type: 'finished' })
    return { ...s, phase: 'finished', endAt: null }
  }
  if (!s.preset.auto_continue) return { ...s, phase: 'waiting', endAt: null }
  return { ...s, phase: 'transition', endAt: now + s.preset.auto_delay * 1000 }
}

function goNext(s, now, events) {
  const next = startStep(s, s.index + 1, now)
  events.push({ type: 'step-start', step: next.steps[next.index], index: next.index })
  return next
}

/*
  Продвигает состояние к моменту now. Возвращает { state, events } — события обрабатывает хранилище
  (звуки, озвучка, уведомления). Если вкладка была закрыта долго, за один вызов можно пройти
  несколько шагов: каждый следующий шаг отсчитывается от момента окончания предыдущего.
*/
export function tick(state, now) {
  const events = []
  let s = state
  for (let guard = 0; s && guard < 1000; guard++) {
    if (!['running', 'transition', 'snoozed'].includes(s.phase) || now < s.endAt) break
    const at = s.endAt
    if (s.phase === 'running') s = finishStep(s, at, events)
    else if (s.phase === 'transition') s = goNext(s, at, events)
    else if (s.resumeMs != null) {
      s = { ...s, phase: 'running', endAt: at + s.resumeMs, resumeMs: null }
      events.push({ type: 'resume', step: s.steps[s.index] })
    } else s = goNext(s, at, events)
  }
  return { state: s, events }
}

// «ОК» или «Начать сейчас» — сразу к следующему шагу
export function confirm(s, now) {
  const events = []
  if (s.phase === 'snoozed' && s.resumeMs != null) {
    return { state: { ...s, phase: 'running', endAt: now + s.resumeMs, resumeMs: null }, events: [{ type: 'resume', step: currentStep(s) }] }
  }
  if (!['waiting', 'transition', 'snoozed'].includes(s.phase)) return { state: s, events }
  return { state: goNext(s, now, events), events }
}

// Пропустить текущий шаг
export function skip(s, now) {
  const events = []
  if (s.index >= s.steps.length - 1) {
    events.push({ type: 'finished' })
    return { state: { ...s, phase: 'finished', endAt: null }, events }
  }
  return { state: goNext(s, now, events), events }
}

// Отложить на 10 минут. Во время шага — шаг замирает и продолжится сам через 10 минут;
// после окончания шага — следующий шаг начнётся через 10 минут.
export function snooze(s, now, minutes = SNOOZE_MINUTES) {
  const resumeMs = s.phase === 'running' ? remaining(s, now)
    : s.phase === 'paused' && s.pausedPhase === 'running' ? s.remainingMs
      : s.phase === 'snoozed' ? s.resumeMs : null
  return { ...s, phase: 'snoozed', endAt: now + minutes * 60 * 1000, resumeMs, remainingMs: null }
}

export function pause(s, now) {
  if (!['running', 'transition', 'snoozed'].includes(s.phase)) return s
  return { ...s, phase: 'paused', pausedPhase: s.phase, remainingMs: remaining(s, now), endAt: null }
}

export function resume(s, now) {
  if (s.phase !== 'paused') return s
  return { ...s, phase: s.pausedPhase, endAt: now + s.remainingMs, remainingMs: null, pausedPhase: null }
}

const pad = (n) => String(n).padStart(2, '0')

export function formatTime(ms) {
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function plural(n, one, few, many) {
  const n10 = n % 10
  const n100 = n % 100
  if (n10 === 1 && n100 !== 11) return one
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few
  return many
}

// «45 минут», «1 минута 30 секунд» — для озвучки
export function durationWords(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const parts = []
  if (m) parts.push(`${m} ${plural(m, 'минута', 'минуты', 'минут')}`)
  if (s) parts.push(`${s} ${plural(s, 'секунда', 'секунды', 'секунд')}`)
  return parts.join(' ')
}

// Текст озвучки начала шага: на первом блоке круга называем номер круга
export function announcement(state, index) {
  const step = state.steps[index]
  const firstOfRound = step.kind === 'block' && (index === 0 || state.steps[index - 1].round !== step.round)
  const round = firstOfRound && state.preset.rounds > 1 ? `Круг ${step.round} из ${state.preset.rounds}. ` : ''
  return `${round}${step.title}, ${durationWords(step.seconds)}`
}
