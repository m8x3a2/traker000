// Хранилище фокус-таймера вне React (паттерн Observer): компоненты подписываются через
// useSyncExternalStore, поэтому таймер на странице «Фокус», плавающий виджет и пункт меню
// показывают одно и то же время и не сбрасываются при переходах между страницами.
import { useSyncExternalStore } from 'react'
import * as engine from './engine'
import { playSound, speak, unlockAudio } from './sounds'

const STATE_KEY = 'traker_timer'
const PREFS_KEY = 'traker_timer_prefs'
const ACTIVE = ['running', 'transition', 'snoozed']

export const DEFAULT_PREFS = {
  showEverywhere: true, // показывать плавающий таймер на всех страницах
  volume: 0.8,
  quick: { rounds: 8, work: 90, rest: 30 },
  quickOptions: engine.DEFAULT_OPTIONS,
}

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key))
    return v ?? fallback
  } catch {
    return fallback
  }
}

let state = load(STATE_KEY, null)
let prefs = { ...DEFAULT_PREFS, ...load(PREFS_KEY, {}) }
let snapshot = { state, prefs, now: Date.now() }
const listeners = new Set()
let interval = null

function emit() {
  snapshot = { state, prefs, now: Date.now() }
  listeners.forEach((l) => l())
}

function save() {
  try {
    if (state) localStorage.setItem(STATE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STATE_KEY)
  } catch { /* приватный режим */ }
}

function notify(title, body) {
  if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return
  try { new Notification(title, { body, tag: 'traker-timer' }) } catch { /* не поддерживается */ }
}

// Побочные эффекты событий движка: звук, голос, системное уведомление (если вкладка неактивна)
function handle(events, s) {
  const p = s.preset
  for (const e of events) {
    if (e.type === 'step-end' && !e.last) {
      playSound(p.sound_end, prefs.volume)
      const next = engine.nextStep(s)
      if (s.phase === 'waiting') {
        if (p.voice) setTimeout(() => speak(`${e.step.title} завершено. Нажмите ОК`, prefs.volume), 1200)
        notify(`«${e.step.title}» завершено`, 'Нажмите «ОК», чтобы продолжить')
      } else {
        notify(`«${e.step.title}» завершено`, next ? `Далее: ${next.title}` : '')
      }
    } else if (e.type === 'step-start') {
      playSound(p.sound_start, prefs.volume)
      if (p.voice) setTimeout(() => speak(engine.announcement(s, e.index), prefs.volume), 700)
    } else if (e.type === 'resume') {
      playSound(p.sound_start, prefs.volume)
      if (p.voice) speak(`Продолжаем: ${e.step.title}`, prefs.volume)
    } else if (e.type === 'finished') {
      playSound(p.sound_end, prefs.volume)
      if (p.voice) setTimeout(() => speak('Таймер завершён. Отличная работа!', prefs.volume), 1200)
      notify('Таймер завершён', p.title)
    }
  }
}

function apply(result) {
  const { state: next, events } = result.events ? result : { state: result, events: [] }
  state = next
  save()
  if (events.length) handle(events, state)
  updateTitle()
  ensureTicking()
  emit()
}

function onTick() {
  if (!state) return
  const now = Date.now()
  const result = engine.tick(state, now)
  if (result.events.length) {
    // Если вкладка была закрыта, прошедшие шаги не «пищат» все разом — звучит только последний
    const recent = result.events.filter((e) => e.type === 'finished' || e === result.events[result.events.length - 1])
    state = result.state
    save()
    handle(recent, state)
  }
  updateTitle()
  emit()
}

function ensureTicking() {
  const active = state && ACTIVE.includes(state.phase)
  if (active && !interval) interval = setInterval(onTick, 250)
  if (!active && interval) { clearInterval(interval); interval = null }
}

const baseTitle = typeof document !== 'undefined' ? document.title : 'Traker000'
function updateTitle() {
  if (typeof document === 'undefined') return
  if (!state || state.phase === 'finished') { document.title = baseTitle; return }
  const step = engine.currentStep(state)
  const prefix = {
    running: engine.formatTime(engine.remaining(state, Date.now())),
    paused: '⏸',
    waiting: '✓ ОК?',
    transition: '→',
    snoozed: '💤 ' + engine.formatTime(engine.remaining(state, Date.now())),
  }[state.phase]
  document.title = `${prefix} · ${step.title} — ${baseTitle}`
}

// Таймер, запущенный до перезагрузки, догоняет время и продолжает
if (state) { onTick(); ensureTicking() }

export const timer = {
  start(preset) {
    unlockAudio()
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
    const now = Date.now()
    const s = engine.start(preset, now)
    apply({ state: s, events: [{ type: 'step-start', step: s.steps[0], index: 0 }] })
  },
  pause: () => apply(engine.pause(state, Date.now())),
  resume: () => apply(engine.resume(state, Date.now())),
  skip: () => apply(engine.skip(state, Date.now())),
  confirm: () => apply(engine.confirm(state, Date.now())),
  snooze: () => apply(engine.snooze(state, Date.now())),
  restart: () => state && timer.start(state.preset),
  stop() {
    state = null
    save()
    updateTitle()
    ensureTicking()
    emit()
  },
  setPrefs(patch) {
    prefs = { ...prefs, ...patch }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* приватный режим */ }
    emit()
  },
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useTimer = () => useSyncExternalStore(subscribe, () => snapshot)
