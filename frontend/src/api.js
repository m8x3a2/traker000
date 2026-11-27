export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const TOKEN_KEY = 'traker_token'
const REFRESH_KEY = 'traker_refresh'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY)

const getRefresh = () => localStorage.getItem(REFRESH_KEY)
let sessionVersion = 0
let lastRotation = null

function storeTokens(tokens) {
  setToken(tokens?.access_token ?? null)
  if (tokens?.refresh_token) localStorage.setItem(REFRESH_KEY, tokens.refresh_token)
  else localStorage.removeItem(REFRESH_KEY)
}

// Вход и выход меняют сессию. Ротация токенов внутри текущей сессии её сохраняет.
export function setTokens(tokens) {
  sessionVersion += 1
  lastRotation = null
  storeTokens(tokens)
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
function refreshTokens(version) {
  const refresh = getRefresh()
  if (!refresh) return Promise.resolve(false)
  if (refreshing?.token === refresh && refreshing.version === version) return refreshing.promise
  const operation = { token: refresh, version }
  operation.promise = fetch(API_URL + '/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  })
    .then(async (res) => {
      if (!res.ok) return false
      const tokens = await res.json()
      if (sessionVersion !== version || getRefresh() !== refresh) return false
      storeTokens(tokens)
      lastRotation = { version, access: tokens.access_token }
      return true
    })
    .catch(() => false)
    .finally(() => { if (refreshing === operation) refreshing = null })
  refreshing = operation
  return operation.promise
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

export async function api(path, { method = 'GET', body, query, form, signal } = {}, retried = false) {
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
  const refresh = getRefresh()
  const version = sessionVersion
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(url, { method, headers, signal, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error(`Сервер недоступен. Проверьте, что бэкенд запущен (${API_URL})`)
  }

  if (res.status === 401 && token) {
    if (!retried && !signal?.aborted && sessionVersion === version) {
      const rotated = lastRotation?.version === version && lastRotation.access === getToken() && token !== getToken()
      const renewed = rotated || (getRefresh() === refresh && await refreshTokens(version))
      if (renewed && sessionVersion === version && !signal?.aborted) {
        return api(path, { method, body, query, form, signal }, true)
      }
    }
    if (sessionVersion === version && getToken() === token && !signal?.aborted) onUnauthorized?.()
  }
  if (res.status === 204) return null

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(formatError(data?.detail, res.status))
  return data
}
