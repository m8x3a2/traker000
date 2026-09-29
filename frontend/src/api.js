export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TOKEN_KEY = 'traker_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)

let onUnauthorized = null
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

// Приводит ошибку FastAPI (строка или список ошибок Pydantic) к читаемому тексту
function formatError(detail, status) {
  if (!detail) return `Ошибка ${status}`
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        const field = (e.loc || []).slice(1).join('.')
        const msg = (e.msg || '').replace(/^Value error, /, '')
        return field ? `${field}: ${msg}` : msg
      })
      .join('; ')
  }
  return JSON.stringify(detail)
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = API_URL + path
  if (query) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      // Массив передаётся повтором параметра: ?tag_ids=1&tag_ids=2
      for (const item of Array.isArray(v) ? v : [v]) {
        if (item !== undefined && item !== null && item !== '') params.append(k, item)
      }
    }
    const qs = params.toString()
    if (qs) url += '?' + qs
  }

  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error(`Сервер недоступен. Проверьте, что бэкенд запущен (${API_URL})`)
  }

  if (res.status === 401 && token) onUnauthorized?.()
  if (res.status === 204) return null

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(formatError(data?.detail, res.status))
  return data
}
