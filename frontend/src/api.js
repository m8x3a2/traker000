export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TOKEN_KEY = 'traker_token'
const REFRESH_KEY = 'traker_refresh'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)

const getRefresh = () => localStorage.getItem(REFRESH_KEY)

// Сохраняет пару токенов после входа или обновления; null — выход
export function setTokens(tokens) {
  setToken(tokens?.access_token ?? null)
  if (tokens?.refresh_token) localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
  else localStorage.removeItem(REFRESH_KEY)
}

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

// Access-токен живёт 30 минут. Когда он истёк, один раз меняем refresh-токен на новую пару
// и повторяем запрос. Несколько одновременных запросов ждут одно и то же обновление.
let refreshing = null
function refreshTokens() {
  const refresh = getRefresh()
  if (!refresh) return Promise.resolve(false)
  refreshing ??= fetch(API_URL + '/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
    .then(async (res) => {
      if (!res.ok) return false
      setTokens(await res.json())
      return true
    })
    .catch(() => false)
    .finally(() => { refreshing = null })
  return refreshing
}

export async function logoutRequest() {
  const refresh = getRefresh()
  setTokens(null)
  if (refresh) {
    await fetch(API_URL + '/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => {})
  }
}

export async function api(path, { method = 'GET', body, query, form } = {}, retried = false) {
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
    res = await fetch(url, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) })
  } catch {
    throw new Error(`Сервер недоступен. Проверьте, что бэкенд запущен (${API_URL})`)
  }

  if (res.status === 401 && token) {
    if (!retried && (await refreshTokens())) return api(path, { method, body, query, form }, true)
    onUnauthorized?.()
  }
  if (res.status === 204) return null

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(formatError(data?.detail, res.status))
  return data
}
