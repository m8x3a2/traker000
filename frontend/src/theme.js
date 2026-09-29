export const PRESETS = {
  dark: { bg: '#0f1115', surface: '#181b22', border: '#2a2f3a', text: '#e6e8ee', muted: '#8b93a7', accent: '#7c5cff' },
  light: { bg: '#f4f5f8', surface: '#ffffff', border: '#dde1e8', text: '#1c2030', muted: '#667085', accent: '#5b3df5' },
}

export const COLOR_LABELS = {
  bg: 'Фон',
  surface: 'Карточки и меню',
  border: 'Границы',
  text: 'Текст',
  muted: 'Второстепенный текст',
  accent: 'Акцент (кнопки)',
}

const STORAGE_KEY = 'traker_theme'

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b < 128
}

export function applyTheme(theme, customColors) {
  const colors = theme === 'custom' && customColors ? customColors : PRESETS[theme] || PRESETS.dark
  const root = document.documentElement
  for (const [key, value] of Object.entries(colors)) root.style.setProperty(`--${key}`, value)
  root.style.colorScheme = isDark(colors.bg) ? 'dark' : 'light'
}

export function loadLocalTheme() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { theme: 'dark', custom_colors: null }
  } catch {
    return { theme: 'dark', custom_colors: null }
  }
}

export function saveLocalTheme({ theme, custom_colors }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, custom_colors }))
}
