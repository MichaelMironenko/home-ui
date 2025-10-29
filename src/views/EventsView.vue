<script setup>
import { ref, computed, onMounted } from 'vue'
import { trackFunctionCall } from '../lib/requestMetrics'

const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(false)
const error = ref('')
const events = ref([])
const catalogDevices = ref({})
const catalogGroups = ref({})
const metricsSnapshot = ref(null)
const metricsLoading = ref(false)
const metricsError = ref('')

function normalizeBase(url = '') {
  return url.replace(/\/+$/, '')
}

async function loadConfig() {
  try {
    const res = await fetch('/config.json')
    if (!res.ok) throw new Error('config load failed')
    const raw = await res.json()
    cfg.value.base = normalizeBase(
      raw.scenariosUrl || raw.scenariosURL || raw.scenarioUrl || raw.scenariosBase || ''
    )
    cfg.value.keyHeader = raw.keyHeader || raw['x-api-key-header'] || 'x-api-key'
    cfg.value.keyValue = raw.keyValue || raw.apiKey || raw['x-api-key'] || ''
  } catch (err) {
    error.value = `Не удалось загрузить config: ${err}`
  }
}

async function apiFetch(path, options = {}) {
  if (!cfg.value.base) throw new Error('Сервис сценариев не настроен в config.json')
  const headers = { ...(options.headers || {}) }
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  if (cfg.value.keyValue) headers[cfg.value.keyHeader || 'x-api-key'] = cfg.value.keyValue
  trackFunctionCall()
  const res = await fetch(`${cfg.value.base}${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) {
    throw new Error(json?.error || res.statusText || 'Request failed')
  }
  return json
}

function formatTime(ts) {
  if (!Number.isFinite(ts)) return ''
  const date = new Date(ts)
  const toTwo = (v) => v.toString().padStart(2, '0')
  return `${toTwo(date.getHours())}:${toTwo(date.getMinutes())}:${toTwo(date.getSeconds())}`
}

const ORIGIN_LABELS = {
  manual: 'Ручной запуск',
  'manual-batch': 'Ручной пакет',
  timer: 'Таймер',
  'timer-single': 'Таймер',
  save: 'Сохранение',
  resume: 'Возобновление',
  presence: 'Присутствие',
}

const PRESENCE_LABELS = {
  home: 'Дома',
  away: 'Нет дома',
  unknown: 'Неизвестно',
}

function formatDevice(device) {
  const name = device?.name?.trim() || device?.id || 'Устройство'
  const brightness = Number(device?.brightness)
  const brightnessText = Number.isFinite(brightness) ? `${Math.round(brightness)}%` : '—'
  const color = device?.color || null
  let colorText = '—'
  let colorHex = null
  let isTemperature = false
  if (color) {
    if (color.type === 'temperature' && Number.isFinite(color.temperatureK)) {
      colorText = `${Math.round(color.temperatureK)}K`
      isTemperature = true
    } else if (color.type === 'color' && typeof color.hex === 'string') {
      colorHex = color.hex
      colorText = color.hex.toUpperCase()
    }
  }
  return {
    id: device?.id || name,
    name,
    brightnessText,
    brightness,
    colorText,
    colorHex,
    isTemperature,
    color,
  }
}

function normalizeEvents(list, maps) {
  if (!Array.isArray(list)) return []
  const deviceMap = maps?.devices || {}
  const groupMap = maps?.groups || {}
  const mapped = list.map((raw) => {
    const ts = Number(raw?.ts)
    const timestamp = Number.isFinite(ts) ? ts : Date.now()
    const devicesRaw = Array.isArray(raw?.devices) ? raw.devices.map(formatDevice) : []
    const presenceStatus = raw?.presence?.status || 'unknown'
    const errorText = raw?.error?.message?.trim() || ''
    const result = raw?.result || null
    const isPaused = !!(result && (result.reason === 'manual_pause' || result.pause))
    const statusText = isPaused
      ? 'Пауза'
      : (result?.throttled ? 'Отложено по rate-limit'
        : (result?.reason && result.reason !== 'manual_pause' ? result.reason : ''))

    const targetGroups = Array.isArray(raw?.target?.groups) ? raw.target.groups.map((id) => ({
      id,
      name: groupMap[id] || id,
    })) : []
    const targetDevices = Array.isArray(raw?.target?.devices) ? raw.target.devices.map((id) => ({
      id,
      name: deviceMap[id] || id,
    })) : []

    const showDeviceDetails = targetGroups.length === 0 || Boolean(errorText)

    const brightnessValues = devicesRaw
      .map((d) => Number.isFinite(d.brightness) ? Math.round(d.brightness) : null)
      .filter((v) => v != null)
    let brightnessDisplay = ''
    if (brightnessValues.length === 1) {
      brightnessDisplay = `${brightnessValues[0]}%`
    } else if (brightnessValues.length > 1) {
      const min = Math.min(...brightnessValues)
      const max = Math.max(...brightnessValues)
      brightnessDisplay = min === max ? `${min}%` : `${min}–${max}%`
    }

    const tempValues = devicesRaw
      .map((d) => {
        if (d.color?.type === 'temperature' && Number.isFinite(d.color.temperatureK)) {
          return Math.round(d.color.temperatureK)
        }
        return null
      })
      .filter((v) => v != null)
    let colorHexDisplay = null
    let colorLabel = ''
    if (tempValues.length) {
      const min = Math.min(...tempValues)
      const max = Math.max(...tempValues)
      colorLabel = min === max ? `${min}K` : `${min}–${max}K`
    } else {
      const hexValues = devicesRaw
        .map((d) => (d.color?.type === 'color' && typeof d.color.hex === 'string') ? d.color.hex : null)
        .filter((v) => typeof v === 'string')
      if (hexValues.length) {
        const uniqueHex = Array.from(new Set(hexValues.map((hex) => hex.toLowerCase())))
        if (uniqueHex.length === 1) {
          colorHexDisplay = uniqueHex[0]
          colorLabel = uniqueHex[0].toUpperCase()
        } else {
          colorLabel = 'несколько цветов'
        }
      }
    }

    const requestCounts = {}
    const rawRequests = Array.isArray(raw?.requests) ? raw.requests : []
    for (const req of rawRequests) {
      const kind = typeof req === 'string'
        ? req
        : (req && typeof req.kind === 'string' ? req.kind : '')
      if (!kind) continue
      requestCounts[kind] = (requestCounts[kind] || 0) + 1
    }
    const requestSummary = Object.entries(requestCounts)
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    const metrics = raw?.metrics || null
    if (metrics?.brightness) {
      if (Number.isFinite(metrics.brightness.single)) {
        brightnessDisplay = `${metrics.brightness.single}%`
      } else if (Number.isFinite(metrics.brightness.min) && Number.isFinite(metrics.brightness.max)) {
        brightnessDisplay = `${metrics.brightness.min}–${metrics.brightness.max}%`
      }
    }
    if (metrics?.temperature) {
      if (Number.isFinite(metrics.temperature.single)) {
        colorHexDisplay = null
        colorLabel = `${metrics.temperature.single}K`
      } else if (Number.isFinite(metrics.temperature.min) && Number.isFinite(metrics.temperature.max)) {
        colorHexDisplay = null
        colorLabel = `${metrics.temperature.min}–${metrics.temperature.max}K`
      }
    }
    let nextRunText = ''
    if (raw?.schedule?.nextRun) {
      try {
        const dt = new Date(raw.schedule.nextRun)
        nextRunText = dt.toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        })
      } catch (_) {
        nextRunText = raw.schedule.nextRun
      }
    }
    let nextRequestText = ''
    if (raw?.schedule?.nextRequest) {
      try {
        const dt = new Date(raw.schedule.nextRequest)
        nextRequestText = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      } catch (_) {
        nextRequestText = raw.schedule.nextRequest
      }
    }

    return {
      id: raw?.id || `evt_${timestamp}`,
      timestamp,
      timeText: formatTime(timestamp),
      scenarioName: raw?.scenarioName || raw?.scenarioId || 'Без имени',
      originLabel: ORIGIN_LABELS[raw?.origin] || '',
      targetGroups,
      targetDevices,
      devices: devicesRaw,
      showDeviceDetails,
      presenceLabel: PRESENCE_LABELS[presenceStatus] || PRESENCE_LABELS.unknown,
      statusText,
      errorText,
      isPaused,
      brightnessDisplay,
      colorLabel,
      colorHexDisplay,
      requestSummary,
      nextRunText,
      nextRequestText,
    }
  })
  return mapped.sort((a, b) => b.timestamp - a.timestamp)
}

async function loadCatalog() {
  if (!cfg.value.base) return
  try {
    const data = await apiFetch('/catalog')
    const dMap = {}
    const gMap = {}
    for (const d of Array.isArray(data?.devices) ? data.devices : []) {
      if (d?.id) dMap[d.id] = d.name || d.id
    }
    for (const g of Array.isArray(data?.groups) ? data.groups : []) {
      if (g?.id) gMap[g.id] = g.name || g.id
    }
    catalogDevices.value = dMap
    catalogGroups.value = gMap
  } catch (err) {
    console.warn('catalog load failed', err)
  }
}

async function loadEvents() {
  if (!cfg.value.base) return
  if (!events.value.length) loading.value = true
  error.value = ''
  try {
    const data = await apiFetch('/events')
    events.value = normalizeEvents(data?.events || [], {
      devices: catalogDevices.value,
      groups: catalogGroups.value,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    error.value = `Ошибка загрузки истории: ${message}`
  } finally {
    loading.value = false
  }
}

const hasEvents = computed(() => events.value.length > 0)

const metricsTotals = computed(() => {
  return {
    date: metricsSnapshot.value?.date || '',
    yandexCalls: Number(metricsSnapshot.value?.yandexCalls) || 0,
    functionCalls: Number(metricsSnapshot.value?.functionCalls) || 0,
  }
})

const yandexBreakdown = computed(() => {
  const bucket = metricsSnapshot.value?.yandexBreakdown || {}
  return Object.entries(bucket)
    .map(([key, value]) => ({
      key,
      label: key,
      count: Number(value) || 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
})

async function loadMetrics() {
  if (!cfg.value.base) return
  metricsLoading.value = true
  metricsError.value = ''
  try {
    const data = await apiFetch('/metrics')
    metricsSnapshot.value = {
      date: data?.date || '',
      yandexCalls: Number(data?.yandexCalls) || 0,
      functionCalls: Number(data?.functionCalls) || 0,
      yandexBreakdown: data?.yandexBreakdown || {},
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    metricsError.value = `Ошибка загрузки статистики: ${message}`
  } finally {
    metricsLoading.value = false
  }
}

onMounted(async () => {
  await loadConfig()
  if (cfg.value.base) {
    await loadCatalog()
    await loadMetrics()
    await loadEvents()
  }
})

async function refreshAll() {
  await loadMetrics()
  await loadEvents()
}
</script>

<template>
  <main class="events">
    <header class="hero">
      <div>
        <h1>История событий</h1>
        <p class="subtitle">Запуски сценариев за последние 12 часов</p>
      </div>
      <button class="secondary" type="button" @click="refreshAll" :disabled="loading || metricsLoading">
        Обновить
      </button>
    </header>

    <section class="panel metrics-panel" v-if="metricsLoading || metricsError || metricsSnapshot">
      <header class="metrics-head">
        <div>
          <h2>Статистика запросов</h2>
          <p class="metrics-subtitle" v-if="metricsTotals.date">За {{ metricsTotals.date }}</p>
        </div>
        <div class="metrics-summary" v-if="metricsSnapshot && !metricsLoading">
          <span class="summary-item">
            <span class="summary-label">Yandex API</span>
            <span class="summary-value">{{ metricsTotals.yandexCalls }}</span>
          </span>
          <span class="summary-item">
            <span class="summary-label">Наши функции</span>
            <span class="summary-value">{{ metricsTotals.functionCalls }}</span>
          </span>
        </div>
      </header>
      <p v-if="metricsLoading" class="metrics-note">Обновляем статистику…</p>
      <p v-else-if="metricsError" class="metrics-note error">{{ metricsError }}</p>
      <div v-else>
        <p v-if="!yandexBreakdown.length" class="metrics-note">Пока нет обращений к Yandex API.</p>
        <ul v-else class="metrics-list">
          <li v-for="entry in yandexBreakdown" :key="entry.key" class="metrics-row">
            <span class="row-label">{{ entry.label }}</span>
            <span class="row-value">{{ entry.count }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section class="panel" v-if="loading && !hasEvents">
      <p>Загрузка истории…</p>
    </section>

    <section class="panel error" v-else-if="error">
      <p>{{ error }}</p>
    </section>

    <section class="timeline" v-else>
      <p v-if="!hasEvents" class="empty">Нет событий за выбранный период.</p>
      <article v-for="event in events" :key="event.id" class="event-card">
        <header class="event-head">
          <span class="event-time">{{ event.timeText }}</span>
          <span class="event-origin" v-if="event.originLabel">{{ event.originLabel }}</span>
        </header>
        <div class="event-name">{{ event.scenarioName }}</div>
        <div class="event-target" v-if="event.targetGroups.length">
          <span class="target-chip" v-for="group in event.targetGroups" :key="group.id">{{ group.name }}</span>
        </div>
        <div class="event-target" v-else-if="event.targetDevices.length && !event.showDeviceDetails">
          <span class="target-chip" v-for="device in event.targetDevices" :key="device.id">{{ device.name }}</span>
        </div>
        <div class="event-metrics" v-if="event.brightnessDisplay || event.colorLabel">
          <span v-if="event.brightnessDisplay" class="metric">
            <span class="metric-label">Яркость</span>
            <span class="metric-value">{{ event.brightnessDisplay }}</span>
          </span>
          <span v-if="event.colorLabel" class="metric">
            <span class="metric-label">Цвет</span>
            <span class="metric-value">
              <span v-if="event.colorHexDisplay" class="metric-dot" :style="{ backgroundColor: event.colorHexDisplay }" />
              {{ event.colorLabel }}
            </span>
          </span>
        </div>
        <div class="event-devices" v-if="event.showDeviceDetails && event.devices.length">
          <div class="device-chip" v-for="device in event.devices" :key="device.id">
            <span class="device-name">{{ device.name }}</span>
            <span class="device-brightness">{{ device.brightnessText }}</span>
            <span v-if="device.colorHex" class="color-dot" :style="{ backgroundColor: device.colorHex }" />
            <span v-if="device.colorHex" class="device-color">{{ device.colorText }}</span>
            <span v-else-if="device.isTemperature" class="device-color">{{ device.colorText }}</span>
          </div>
        </div>
        <div class="event-requests" v-if="event.requestSummary && event.requestSummary.length">
          <div class="requests-title">API вызовы</div>
          <ul class="requests-list">
            <li v-for="req in event.requestSummary" :key="req.kind" class="requests-row">
              <span class="requests-kind">{{ req.kind }}</span>
              <span class="requests-count">{{ req.count }}</span>
            </li>
          </ul>
        </div>
        <div class="event-next-run" v-if="event.nextRunText || event.nextRequestText">
          <div v-if="event.nextRunText">
            <span class="next-run-label">Следующее окно:</span>
            <span class="next-run-value">{{ event.nextRunText }}</span>
          </div>
          <div v-if="event.nextRequestText">
            <span class="next-run-label">Следующий запрос:</span>
            <span class="next-run-value">{{ event.nextRequestText }}</span>
          </div>
        </div>
        <footer class="event-foot">
          <span class="presence">Присутствие: {{ event.presenceLabel }}</span>
          <span v-if="event.statusText" class="status" :class="{ pause: event.isPaused }">{{ event.statusText }}</span>
          <span v-if="event.errorText" class="error">{{ event.errorText }}</span>
        </footer>
      </article>
    </section>
  </main>
</template>

<style scoped>
.events {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.hero h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
}

.subtitle {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 14px;
}

.secondary {
  padding: 10px 16px;
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 8px;
  color: #e2e8f0;
  cursor: pointer;
  transition: background 0.2s ease;
}

.secondary:disabled {
  opacity: 0.5;
  cursor: default;
}

.secondary:not(:disabled):hover {
  background: rgba(148, 163, 184, 0.1);
}

.panel {
  padding: 20px;
  border-radius: 16px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.metrics-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.metrics-head {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: space-between;
  align-items: flex-end;
}

.metrics-head h2 {
  margin: 0;
  font-size: 20px;
  color: #f8fafc;
}

.metrics-subtitle {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 12px;
}

.metrics-summary {
  display: flex;
  gap: 16px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.summary-label {
  font-size: 11px;
  color: #94a3b8;
}

.summary-value {
  font-size: 18px;
  font-weight: 600;
  color: #f8fafc;
}

.metrics-note {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.metrics-note.error {
  color: #fca5a5;
}

.metrics-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metrics-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: rgba(30, 41, 59, 0.75);
  border-radius: 8px;
}

.row-label {
  font-family: 'SFMono-Regular', monospace;
  font-size: 12px;
  color: #cbd5f5;
}

.row-value {
  font-size: 15px;
  font-weight: 600;
  color: #38bdf8;
}

.panel.error {
  border-color: rgba(248, 113, 113, 0.4);
  color: #fecaca;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty {
  margin: 0;
  color: #94a3b8;
}

.event-card {
  padding: 16px 18px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.event-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.event-time {
  font-family: 'SFMono-Regular', monospace;
  font-size: 12px;
  color: #cbd5f5;
}

.event-origin {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.25);
  color: #60a5fa;
  font-size: 11px;
  font-weight: 600;
}

.event-name {
  font-weight: 600;
  color: #f8fafc;
  font-size: 18px;
}

.event-target {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.target-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  font-size: 13px;
}

.event-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #cbd5f5;
}

.metric {
  display: flex;
  align-items: center;
  gap: 6px;
}

.metric-label {
  color: #94a3b8;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-value {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f8fafc;
  font-weight: 500;
}

.metric-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.event-devices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.event-requests {
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.requests-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
}

.requests-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.requests-row {
  display: flex;
  justify-content: space-between;
  font-family: 'SFMono-Regular', monospace;
  font-size: 12px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 6px;
  padding: 4px 8px;
  color: #cbd5f5;
}

.requests-kind {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.requests-count {
  font-weight: 600;
  color: #38bdf8;
}

.event-next-run {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.event-next-run > div {
  display: flex;
  gap: 6px;
}

.next-run-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.next-run-value {
  color: #f8fafc;
}

.device-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  color: #e2e8f0;
  font-size: 13px;
}

.device-name {
  font-weight: 500;
}

.device-brightness {
  color: #cbd5f5;
}

.device-color {
  color: #f8fafc;
  font-weight: 500;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.event-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #cbd5f5;
}

.status.pause {
  color: #fbbf24;
}

.presence {
  font-weight: 500;
}

.status {
  color: #f1f5f9;
}

.error {
  color: #fca5a5;
}

@media (max-width: 600px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }
  .secondary {
    width: 100%;
  }
  .event-card {
    padding: 14px;
  }
}
</style>
