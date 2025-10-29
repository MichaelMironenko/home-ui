import { ref, readonly } from 'vue'

const STORAGE_KEY = 'request-metrics-v1'
const storageAvailable = typeof window !== 'undefined' && !!window.localStorage

const todayString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const defaultState = (date = todayString()) => ({
  date,
  yandexCalls: 0,
  functionCalls: 0
})

const loadInitialState = () => {
  if (!storageAvailable) return defaultState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return defaultState()
    const storedDate = typeof parsed.date === 'string' ? parsed.date : ''
    if (storedDate !== todayString()) return defaultState()
    return {
      date: storedDate,
      yandexCalls: Number.isFinite(parsed.yandexCalls) ? Number(parsed.yandexCalls) : 0,
      functionCalls: Number.isFinite(parsed.functionCalls) ? Number(parsed.functionCalls) : 0
    }
  } catch {
    return defaultState()
  }
}

const state = ref(loadInitialState())

const persist = (value) => {
  if (!storageAvailable) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // ignore persistence errors (private mode, storage quota, etc)
  }
}

const ensureTodayState = () => {
  const today = todayString()
  if (state.value.date === today) return state.value
  const fresh = defaultState(today)
  state.value = fresh
  persist(fresh)
  return fresh
}

const recordCall = (key) => {
  const current = ensureTodayState()
  const next = {
    ...current,
    [key]: Number(current[key] || 0) + 1
  }
  state.value = next
  persist(next)
}

export const trackYandexCall = () => recordCall('yandexCalls')
export const trackFunctionCall = () => recordCall('functionCalls')

export const useRequestMetrics = () => {
  ensureTodayState()
  return readonly(state)
}

export const getRequestMetrics = () => ensureTodayState()
