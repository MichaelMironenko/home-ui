import { ref } from 'vue'
import { ensureApiBase } from '../utils/apiBase'

const profile = ref(null)
const instructions = ref(null)
const loadingProfile = ref(false)
const profileError = ref(null)

const timezoneList = ref([])
const timezoneSearchLoading = ref(false)
const timezoneSearchError = ref(null)

const defaultHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
}

async function requestJson(path, init = {}) {
  const base = await ensureApiBase()
  const response = await fetch(`${base}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Request failed (${response.status})`)
  }
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (err) {
    console.warn('[profile] response parsing failed', text)
    throw err
  }
}

async function loadProfile(force = false) {
  if (profile.value && instructions.value && !force) {
    return profile.value
  }
  loadingProfile.value = true
  profileError.value = null
  try {
    const data = await requestJson('/api/profile', { method: 'GET', headers: defaultHeaders })
    console.log('[profile] loadProfile response', data?.profile)
    profile.value = data.profile || null
    instructions.value = data.presenceInstructions || null
    return profile.value
  } catch (err) {
    profileError.value = err?.message || String(err)
    throw err
  } finally {
    loadingProfile.value = false
  }
}

async function searchTimezones(query = '', limit = 300) {
  timezoneSearchLoading.value = true
  timezoneSearchError.value = null
  try {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (limit) params.set('limit', limit.toString())
    console.log('[profile] searchTimezones request', { query, limit })
    const data = await requestJson(`/api/profile/timezones?${params.toString()}`, {
      method: 'GET',
      headers: defaultHeaders
    })
    console.log('[profile] searchTimezones response', data.timezones?.length, data.timezones ? data.timezones.slice(0, 5) : [])
    timezoneList.value = data.timezones || []
    return timezoneList.value
  } catch (err) {
    timezoneSearchError.value = err?.message || String(err)
    console.warn('[profile] searchTimezones failed', err)
    throw err
  } finally {
    timezoneSearchLoading.value = false
  }
}

async function updateTimezone(timezoneId) {
  profileError.value = null
  try {
    const payload = { timezoneId: timezoneId || null }
    const data = await requestJson('/api/profile/timezone', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(payload)
    })
    profile.value = data.profile || profile.value
    return profile.value
  } catch (err) {
    profileError.value = err?.message || String(err)
    throw err
  }
}

export function useProfile() {
  return {
    profile,
    instructions,
    loadingProfile,
    profileError,
    timezoneList,
    timezoneSearchLoading,
    timezoneSearchError,
    loadProfile,
    searchTimezones,
    updateTimezone
  }
}
