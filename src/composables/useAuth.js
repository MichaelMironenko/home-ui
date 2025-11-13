import { ref } from 'vue'
import { getConfig } from '../lib/api'

const user = ref(null)
const ready = ref(false)
let baseUrl = ''
let initPromise = null

const headersJson = { Accept: 'application/json' }

function resolveBase(raw) {
  return (raw || '').replace(/\/+$/, '')
}

async function ensureBaseUrl() {
  if (baseUrl) return baseUrl
  const cfg = await getConfig()
  const base = resolveBase(cfg.scenariosURL || cfg.scenariosUrl || cfg.scenarioUrl || cfg.scenariosBase || '')
  if (!base) throw new Error('scenariosURL не задан в config.json')
  baseUrl = base
  return baseUrl
}

async function fetchSession() {
  const base = await ensureBaseUrl()
  const res = await fetch(`${base}/auth/me`, {
    method: 'GET',
    credentials: 'include',
    headers: headersJson
  })
  if (res.status === 401) {
    user.value = null
    return null
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `Failed to load session (${res.status})`)
  }
  const data = await res.json()
  user.value = data?.user || null
  return user.value
}

async function ensureSession(force = false) {
  if (force) initPromise = null
  if (!initPromise) {
    initPromise = (async () => {
      ready.value = false
      try {
        await fetchSession()
      } catch (err) {
        console.warn('[auth] session check failed', err)
        user.value = null
      } finally {
        ready.value = true
      }
      return user.value
    })()
  }
  return initPromise
}

async function login(redirectTarget) {
  const base = await ensureBaseUrl()
  const target = typeof redirectTarget === 'string' && redirectTarget.length
    ? redirectTarget
    : window.location.href
  window.location.href = `${base}/auth/login?redirect=${encodeURIComponent(target)}`
}

async function logout() {
  const base = await ensureBaseUrl()
  try {
    await fetch(`${base}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}'
    })
  } catch (err) {
    console.warn('[auth] logout failed', err)
  }
  user.value = null
  ready.value = true
}

export function useAuth() {
  return {
    user,
    ready,
    ensureSession,
    login,
    logout
  }
}
