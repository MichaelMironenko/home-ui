import { ref } from 'vue'
import { ensureApiBase } from '../utils/apiBase'

const profile = ref(null)
const instructions = ref(null)
const loadingProfile = ref(false)
const profileError = ref(null)

const cityDetection = ref(null)
const cityDetectionLoading = ref(false)
const cityDetectionError = ref(null)

const defaultHeaders = {
  Accept: 'application/json',
  'Content-Type': 'application/json'
}

let clientIpHint = null

async function ensureClientIp() {
  if (clientIpHint) return clientIpHint
  try {
    const resp = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
    if (resp.ok) {
      const data = await resp.json().catch(() => null)
      clientIpHint = data?.ip || null
    }
  } catch (err) {
    console.warn('[profile] ip detect failed', err)
  }
  return clientIpHint
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

async function updateCity(city) {
  profileError.value = null
  try {
    const payload = { city: city || null }
    console.log('[profile] updateCity request', payload)
    const data = await requestJson('/api/profile/city', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(payload)
    })
    console.log('[profile] updateCity response', data?.profile)
    profile.value = data.profile || profile.value
    return profile.value
  } catch (err) {
    profileError.value = err?.message || String(err)
    console.warn('[profile] updateCity failed', err)
    throw err
  }
}

async function detectCity(timezone = null) {
  cityDetectionLoading.value = true
  cityDetectionError.value = null
  try {
    const payload = {
      timezone: timezone || null,
      offsetMin: -new Date().getTimezoneOffset(),
      timeIso: new Date().toISOString()
    }
    const ip = await ensureClientIp()
    if (ip) payload.ip = ip
    console.log('[profile] detectCity request', payload)
    const data = await requestJson('/api/profile/detect-city', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify(payload)
    })
    cityDetection.value = data.detection || null
    console.log('[profile] detectCity response', data.detection)
    return cityDetection.value
  } catch (err) {
    cityDetectionError.value = err?.message || String(err)
    console.warn('[profile] detectCity failed', err)
    throw err
  } finally {
    cityDetectionLoading.value = false
  }
}

async function reverseGeocode(lat, lon) {
  try {
    console.log('[profile] reverseGeocode request', { lat, lon })
    const data = await requestJson('/api/profile/reverse-geocode', {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ lat, lon })
    })
    console.log('[profile] reverseGeocode response', data)
    return data
  } catch (err) {
    cityDetectionError.value = err?.message || String(err)
    console.warn('[profile] reverseGeocode failed', err)
    throw err
  }
}

async function geocodeCityByName(name, { limit = 5 } = {}) {
  try {
    const params = new URLSearchParams({ q: name || '' })
    if (limit) {
      params.set('limit', String(limit))
    }
    console.log('[profile] geocodeCityByName request', { name, limit })
    const data = await requestJson(`/api/profile/geocode?${params.toString()}`, {
      method: 'GET',
      headers: defaultHeaders
    })
    console.log('[profile] geocodeCityByName response', data)
    return data
  } catch (err) {
    cityDetectionError.value = err?.message || String(err)
    console.warn('[profile] geocodeCityByName failed', err)
    throw err
  }
}

export function useProfile() {
  return {
    profile,
    instructions,
    loadingProfile,
    profileError,
    cityDetection,
    cityDetectionLoading,
    cityDetectionError,
    loadProfile,
    updateCity,
    detectCity,
    reverseGeocode,
    geocodeCityByName
  }
}
