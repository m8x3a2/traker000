// Работа с датами в локальном времени пользователя. Формат для API — YYYY-MM-DD.

const pad = (n) => String(n).padStart(2, '0')

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Понедельник недели, в которую входит дата
export function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return addDays(r, -((r.getDay() + 6) % 7))
}

export const weekDates = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i))

export const todayISO = () => toISO(new Date())

export const DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
export const DAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

export const formatDate = (d, opts = { day: 'numeric', month: 'long' }) => d.toLocaleDateString('ru-RU', opts)

export const weekLabel = (start) => `${formatDate(start)} — ${formatDate(addDays(start, 6))}`
