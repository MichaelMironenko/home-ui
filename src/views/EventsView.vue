<script setup>
import { ref, computed, onMounted } from 'vue'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'

const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(false)
const error = ref('')
const events = ref([])
const catalogDevices = ref({})
const catalogGroups = ref({})

function normalizeBase(url = '') {
  return url.replace(/\/+$/, '')
}

async function loadConfig() {
  try {
    const raw = await getConfig()
    const apiBase =
      raw.api ||
      raw.apiBase ||
      raw.scenariosUrl ||
      raw.scenariosURL ||
      raw.scenarioUrl ||
      raw.scenariosBase ||
      ''
    cfg.value.base = normalizeBase(apiBase)
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
    credentials: options.credentials ?? 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) {
    throw new Error(json?.error || text || res.statusText || 'Request failed')
  }
  return json
}

function formatTime(ts) {
  if (!Number.isFinite(ts)) return ''
  const date = new Date(ts)
  const toTwo = (v) => v.toString().padStart(2, '0')
  return `${toTwo(date.getHours())}:${toTwo(date.getMinutes())}:${toTwo(date.getSeconds())}`
}

function formatTriggerLabel(origin) {
  if (!origin) return ''
  return ORIGIN_LABELS[origin] || origin
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
    if (!raw || typeof raw !== 'object') return null
    const tsSource = raw.ts || raw.timestamp || raw.timeText || null
    const parsedTs = tsSource ? Date.parse(tsSource) : NaN
    const timestamp = Number.isNaN(parsedTs) ? Date.now() : parsedTs
    const devicesRaw = Array.isArray(raw.devices) ? raw.devices.map(formatDevice) : []
    const presenceStatus = raw.presenceStatus || 'unknown'
    const status = raw.status || {}
    const isPaused = !!status.pause
    const statusText = isPaused
      ? 'Пауза'
      : (status.throttled ? 'Отложено по rate-limit'
        : (status.reason && status.reason !== 'manual_pause' ? status.reason : ''))

    const targetGroups = Array.isArray(raw?.target?.groups) ? raw.target.groups.map((id) => ({
      id,
      name: groupMap[id] || id,
    })) : []
    const targetDevices = Array.isArray(raw?.target?.devices) ? raw.target.devices.map((id) => ({
      id,
      name: deviceMap[id] || id,
    })) : []

    const showDeviceDetails = targetGroups.length === 0

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

    let nextRunText = ''
    if (status.nextRunUtc) {
      try {
        const dt = new Date(status.nextRunUtc)
        nextRunText = dt.toLocaleString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        })
      } catch (_) {
        nextRunText = status.nextRunUtc
      }
    }
    let nextRequestText = ''
    if (status.nextRequestUtc) {
      try {
        const dt = new Date(status.nextRequestUtc)
        nextRequestText = dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      } catch (_) {
        nextRequestText = status.nextRequestUtc
      }
    }

    return {
      id: raw?.id || `evt_${timestamp}`,
      timestamp,
      timeText: formatTime(timestamp),
      scenarioName: raw?.scenarioName || raw?.scenarioId || 'Без имени',
      triggerLabel: formatTriggerLabel(raw?.origin),
      targetGroups,
      targetDevices,
      devices: devicesRaw,
      showDeviceDetails,
      presenceLabel: PRESENCE_LABELS[presenceStatus] || PRESENCE_LABELS.unknown,
      statusText,
      isPaused,
      brightnessDisplay,
      colorLabel,
      colorHexDisplay,
      requestSummary: Array.isArray(raw?.requestSummary) ? raw.requestSummary : [],
      nextRunText,
      nextRequestText,
      functionBreakdown: Array.isArray(raw?.functionBreakdown) ? raw.functionBreakdown : [],
      sensorLux: Number.isFinite(raw?.sensorLux) ? Math.round(raw.sensorLux) : null,
    }
  })
  return mapped.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)
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

onMounted(async () => {
  await loadConfig()
  if (cfg.value.base) {
    await loadCatalog()
    await loadEvents()
  }
})

async function refreshAll() {
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
      <button class="secondary" type="button" @click="refreshAll" :disabled="loading">
        Обновить
      </button>
    </header>

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
          <span class="event-trigger" v-if="event.triggerLabel">{{ event.triggerLabel }}</span>
        </header>
        <div class="event-name">{{ event.scenarioName }}</div>
        <div class="event-target" v-if="event.targetGroups.length">
          <span class="target-chip" v-for="group in event.targetGroups" :key="group.id">{{ group.name }}</span>
        </div>
        <div class="event-target" v-else-if="event.targetDevices.length && !event.showDeviceDetails">
          <span class="target-chip" v-for="device in event.targetDevices" :key="device.id">{{ device.name }}</span>
        </div>
        <div class="event-metrics" v-if="event.brightnessDisplay || event.colorLabel || event.sensorLux != null">
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
          <span v-if="event.sensorLux != null" class="metric">
            <span class="metric-label">Датчик</span>
            <span class="metric-value">{{ event.sensorLux }} lx</span>
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

.metrics-sections {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.metrics-subsection {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metrics-subheading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
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
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.event-time {
  font-family: 'SFMono-Regular', monospace;
  font-size: 12px;
  color: #cbd5f5;
}

.event-trigger {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.event-trigger::before {
  content: '·';
  color: #475569;
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
  margin-bottom: 8px;
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
