// Звуки и озвучка таймера. Три стандартных звука синтезируются Web Audio API (файлы не нужны),
// звуки администратора загружаются с сервера: GET /sounds/{id}/file.
import { API_URL } from '../api'

export const BUILTIN_SOUNDS = [
  { id: 'bell', name: 'Колокольчик', builtin: true },
  { id: 'beep', name: 'Сигнал', builtin: true },
  { id: 'gong', name: 'Гонг', builtin: true },
]

let ctx = null
function audio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Браузер разрешает звук только после действия пользователя — «размораживаем» контекст при первом клике
export function unlockAudio() {
  try { audio() } catch { /* нет Web Audio */ }
}
if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlockAudio, { once: true })

function tone(c, { freq, type = 'sine', start, duration, volume, attack = 0.01 }) {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(c.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

const SYNTH = {
  // Два удара колокольчика: основной тон и обертон
  bell(c, v) {
    for (const t of [0, 0.45]) {
      tone(c, { freq: 880, start: c.currentTime + t, duration: 1.4, volume: 0.5 * v })
      tone(c, { freq: 2200, start: c.currentTime + t, duration: 0.6, volume: 0.15 * v })
    }
  },
  // Три коротких сигнала
  beep(c, v) {
    for (const t of [0, 0.22, 0.44]) tone(c, { freq: 1000, type: 'square', start: c.currentTime + t, duration: 0.14, volume: 0.18 * v, attack: 0.005 })
  },
  // Низкий гонг с долгим затуханием
  gong(c, v) {
    for (const [freq, vol] of [[110, 0.6], [165, 0.35], [262, 0.2], [392, 0.1]]) {
      tone(c, { freq, start: c.currentTime, duration: 3, volume: vol * v, attack: 0.02 })
    }
  },
}

const customCache = new Map()

export function playSound(id, volume = 0.8) {
  if (!id || id === 'none' || volume <= 0) return
  try {
    if (id.startsWith('custom:')) {
      const url = `${API_URL}/sounds/${id.slice(7)}/file`
      let el = customCache.get(url)
      if (!el) { el = new Audio(url); customCache.set(url, el) }
      el.volume = Math.min(1, volume)
      el.currentTime = 0
      el.play().catch(() => {})
      return
    }
    SYNTH[id]?.(audio(), volume)
  } catch { /* звук не критичен */ }
}

// Озвучка голосом (Web Speech API). Если голоса на русском нет, браузер прочитает голосом по умолчанию.
export function speak(text, volume = 0.8) {
  if (!('speechSynthesis' in window) || !text) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ru-RU'
  u.volume = Math.min(1, volume)
  const ru = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('ru'))
  if (ru) u.voice = ru
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window
