<script setup>
import { ref, computed, onMounted, watchEffect } from 'vue'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'
import { setDocumentTitle } from '../utils/pageTitle'
import { temperatureToHex } from '../utils/colorUtils'

const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(false)
const error = ref('')
const events = ref([])

watchEffect(() => {
  setDocumentTitle('Журнал сценариев')
})

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

const ORIGIN_VARIANTS = {
  manual: 'manual',
  'manual-batch': 'manual',
  timer: 'timer',
  'timer-single': 'timer',
  save: 'system',
  resume: 'system',
  presence: 'presence',
}

function normalizeEvents(list) {
  if (!Array.isArray(list)) return []
  const seenIds = new Map()
  const mapped = list.map((raw) => {
    if (!raw || typeof raw !== 'object') return null
    const tsSource = raw.ts || raw.timestamp || raw.timeText || null
    const parsedTs = tsSource ? Date.parse(tsSource) : NaN
    const timestamp = Number.isNaN(parsedTs) ? Date.now() : parsedTs
    const triggerVariant = ORIGIN_VARIANTS[raw?.origin] || 'generic'

    const baseId = raw?.id || `evt_${timestamp}`
    const dupCount = seenIds.get(baseId) || 0
    const dedupedId = dupCount === 0 ? baseId : `${baseId}_${dupCount + 1}`
    seenIds.set(baseId, dupCount + 1)

    return {
      id: dedupedId,
      timestamp,
      timeText: formatTime(timestamp),
      scenarioName: raw?.scenarioName || raw?.scenarioId || 'Без имени',
      triggerVariant,
      triggerLabel: formatTriggerLabel(raw?.origin),
      brightnessDisplay: typeof raw?.brightness === 'string' ? raw.brightness : '',
      colorLabel: raw?.colorLabel || '',
      colorTemperature: Number.isFinite(raw?.colorTemperature) ? Number(raw.colorTemperature) : null,
      colorHexDisplay: typeof raw?.colorHex === 'string' ? raw.colorHex : null,
      sensorLux: Number.isFinite(raw?.sensorLux) ? Math.round(raw.sensorLux) : null,
    }
  })
  return mapped.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)
}

function colorSwatchStyle(event) {
  if (event.colorHexDisplay) {
    return { backgroundColor: event.colorHexDisplay }
  }
  if (Number.isFinite(event.colorTemperature)) {
    return { backgroundColor: temperatureToHex(event.colorTemperature) }
  }
  return null
}

async function loadEvents() {
  if (!cfg.value.base) return
  if (!events.value.length) loading.value = true
  error.value = ''
  try {
    const data = await apiFetch('/events')
    events.value = normalizeEvents(data?.events || [])
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
        <div class="event-row">
          <div class="event-time-block">
            <span class="event-time">{{ event.timeText }}</span>
            <span v-if="event.triggerLabel" class="event-trigger" :class="`trigger-${event.triggerVariant}`">{{ event.triggerLabel }}</span>
          </div>
          <div class="event-main">
            <div class="event-name">{{ event.scenarioName }}</div>
            <div class="event-metrics" v-if="event.brightnessDisplay || event.colorLabel || event.sensorLux != null">
            <span v-if="event.brightnessDisplay" class="metric">
              <span class="metric-icon" aria-hidden="true">💡</span>
              <span class="metric-value">{{ event.brightnessDisplay }}</span>
              </span>
            <span v-if="event.colorLabel" class="metric metric-color">
              <span
                class="color-swatch"
                :class="{ temperature: !event.colorHexDisplay }"
                :style="colorSwatchStyle(event)"
              ></span>
              <span class="metric-value">{{ event.colorLabel }}</span>
            </span>
              <span v-if="event.sensorLux != null" class="metric">
                <span class="metric-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path d="M12 4.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm6.364 3.136a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0ZM18.5 13a1 1 0 0 1 0 2h-1a1 1 0 1 1 0-2h1Zm-12 0a1 1 0 1 1 0 2H5.5a1 1 0 0 1 0-2h1Zm1.257-5.243a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0ZM12 9a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-1 6.5h2V20a1 1 0 1 1-2 0v-2.5Z" />
                  </svg>
                </span>
                <span class="metric-value">{{ event.sensorLux }} lx</span>
              </span>
            </div>
          </div>
        </div>
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
  gap: 8px;
}

.empty {
  margin: 0;
  color: #94a3b8;
}

.event-card {
  padding: 10px 18px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-row {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.event-row:hover .event-name {
  color: #ffffff;
}

.event-time-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  flex: 0 0 80px;
}

.event-time {
  font-family: 'SFMono-Regular', monospace;
  font-size: 12px;
  color: #cbd5f5;
}

.event-trigger {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  color: #93c5fd;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.13);
}

.event-trigger.trigger-timer {
  color: #6ee7b7;
  background: rgba(16, 185, 129, 0.15);
}

.event-trigger.trigger-presence {
  color: #d8b4fe;
  background: rgba(192, 132, 252, 0.15);
}

.event-trigger.trigger-system {
  color: #fecaca;
  background: rgba(248, 113, 113, 0.15);
}

.event-name {
  font-weight: 600;
  color: #f8fafc;
  font-size: 18px;
  margin: 0;
}

.event-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  background: rgba(248, 250, 252, 0.08);
  color: #f1f5f9;
}

.status-pill.pause {
  color: #fbbf24;
}

.status-pill.error {
  color: #fca5a5;
}

.event-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 13px;
  color: #cbd5f5;
  justify-content: flex-start;
  min-width: 0;
  align-items: center;
}

.metric {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #f8fafc;
  font-weight: 500;
}

.metric-value {
  font-weight: 600;
}

.metric-color .metric-value {
  font-weight: 500;
}

.metric-icon {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fcd34d;
}

.metric-icon svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.metric:last-child .metric-icon {
  color: #fbbf24;
}

.color-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
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
  .event-row {
    flex-wrap: wrap;
    gap: 12px;
  }
  .event-time-block {
    flex: 0 0 auto;
  }
  .event-metrics {
    justify-content: flex-start;
  }
}
</style>
