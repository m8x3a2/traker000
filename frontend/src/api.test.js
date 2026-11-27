import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, getToken, setTokens, setUnauthorizedHandler } from './api'

const expired = { access_token: 'expired-access', refresh_token: 'old-refresh' }
const renewed = { access_token: 'new-access', refresh_token: 'new-refresh' }

beforeEach(() => {
  const values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  })
  setTokens(expired)
})

afterEach(() => {
  setTokens(null)
  setUnauthorizedHandler(null)
  vi.unstubAllGlobals()
})

test('retries a late 401 with the already rotated token', async () => {
  let finishLateRequest
  const lateResponse = new Promise((resolve) => { finishLateRequest = resolve })
  const fetchMock = vi.fn(async (url, options) => {
    if (url.endsWith('/refresh')) return Response.json(renewed)
    if (options.headers.Authorization === 'Bearer new-access') return Response.json({ ok: true })
    if (url.endsWith('/late')) return lateResponse
    return new Response(null, { status: 401 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const late = api('/late')
  await expect(api('/first')).resolves.toEqual({ ok: true })
  finishLateRequest(new Response(null, { status: 401 }))
  await expect(late).resolves.toEqual({ ok: true })
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/refresh'))).toHaveLength(1)
})

test('a refresh response arriving after logout cannot restore the old session', async () => {
  let finishRefresh
  const refreshResponse = new Promise((resolve) => { finishRefresh = resolve })
  const fetchMock = vi.fn((url) => url.endsWith('/refresh') ? refreshResponse : new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetchMock)
  const onUnauthorized = vi.fn()
  setUnauthorizedHandler(onUnauthorized)

  const request = api('/stats/dashboard')
  const failed = expect(request).rejects.toThrow('401')
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  setTokens(null)
  finishRefresh(Response.json(renewed))
  await failed
  expect(getToken()).toBeNull()
  expect(onUnauthorized).not.toHaveBeenCalled()
})
