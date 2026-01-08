<script setup>
import { ref, computed, onMounted, watchEffect } from 'vue'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'
import { colorSwatchStyle, normalizeEvents, normalizeScenarioName } from '../utils/events'

const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(false)
const error = ref('')
const events = ref([])
const scenarioIndex = ref({ byId: new Map(), byName: new Map() })

watchEffect(() => {
    setDocumentTitle('Журнал сценариев')
    setDocumentDescription('Журнал событий ExtraHub: когда запускались сценарии, кто инициировал и какие действия отправлены устройствам.')
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

async function loadScenarioIndex() {
    scenarioIndex.value = { byId: new Map(), byName: new Map() }
    if (!cfg.value.base) return
    try {
        const data = await apiFetch('/list')
        if (!Array.isArray(data?.scenarios)) return
        const byId = new Map()
        const byName = new Map()
        for (const entry of data.scenarios) {
            const key = String(entry?.key || '').trim()
            const cleanedId = key.replace(/^scenarios\//, '').replace(/\.json$/i, '')
            const id = String(entry?.id || cleanedId || '').trim()
            if (!id) continue
            const name = String(entry?.name || cleanedId || id || '').trim() || 'Без имени'
            const normalizedName = normalizeScenarioName(name)
            const item = { id, name, type: entry?.type || null }
            byId.set(id, item)
            if (normalizedName) byName.set(normalizedName, item)
        }
        scenarioIndex.value = { byId, byName }
    } catch (err) {
        console.warn('[events] loadScenarioIndex failed', err)
        scenarioIndex.value = { byId: new Map(), byName: new Map() }
    }
}


async function loadEvents() {
    if (!cfg.value.base) return
    if (!events.value.length) loading.value = true
    error.value = ''
    try {
        const data = await apiFetch('/events')
        events.value = normalizeEvents(data?.events || [], scenarioIndex.value)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        error.value = `Ошибка загрузки истории: ${message}`
    } finally {
        loading.value = false
    }
}

const hasEvents = computed(() => events.value.length > 0)

const groupedEvents = computed(() => {
    const groups = []
    for (const event of events.value) {
        const lastGroup = groups[groups.length - 1]
        if (!lastGroup || lastGroup.scenarioKey !== event.scenarioKey) {
            groups.push({
                id: `g_${event.scenarioKey}_${event.timestamp}`,
                scenarioKey: event.scenarioKey,
                scenarioName: event.scenarioName,
                scenarioId: event.scenarioId,
                scenarioType: event.scenarioType,
                rows: []
            })
        }

        const rowHasContent =
            Boolean(event.triggerIcon) ||
            Boolean(event.brightnessDisplay) ||
            Boolean(event._showColorAny) ||
            Boolean(event.statusLabel) ||
            event.sensorLux != null

        if (!rowHasContent) continue

        groups[groups.length - 1].rows.push({
            id: event.id,
            timeText: event.timeText,
            triggerIcon: event.triggerIcon,
            triggerLabel: event.triggerLabel,
            brightnessDisplay: event.brightnessDisplay,
            _showColorAny: Boolean(event._showColorAny),
            _showCctOnly: Boolean(event._showCctOnly),
            colorLabel: event.colorLabel,
            colorTemperature: event.colorTemperature,
            colorHexDisplay: event.colorHexDisplay,
            sensorLux: event.sensorLux,
            statusLabel: event.statusLabel,
        })
    }
    return groups.filter((group) => group.rows.length > 0)
})

onMounted(async () => {
    await loadConfig()
    if (cfg.value.base) {
        await loadScenarioIndex()
        await loadEvents()
    }
})

async function refreshAll() {
    await loadScenarioIndex()
    await loadEvents()
}

function scenarioLinkLocation(group) {
    if (!group?.scenarioId) return null
    if (group.scenarioType === 'auto-light-v1') {
        return { name: 'auto-light-edit', params: { id: group.scenarioId } }
    }
    return { name: 'scenario-edit', params: { id: group.scenarioId } }
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
            <article
                v-for="group in groupedEvents"
                :key="group.id"
                class="event-card"
                :class="{ 'event-card--clickable': Boolean(group.scenarioId) }"
            >
                <component
                    :is="group.scenarioId ? 'RouterLink' : 'div'"
                    class="event-card-link"
                    :to="group.scenarioId ? scenarioLinkLocation(group) : undefined"
                >
                    <div class="event-head">
                        <span class="event-name event-name--inline" :title="group.scenarioName">{{ group.scenarioName }}</span>
                    </div>
                    <div class="event-rows">
                        <div v-for="row in group.rows" :key="row.id" class="event-row-line">
                            <div class="event-row-left">
                                <span class="event-row-time">{{ row.timeText }}</span>
                                <span
                                    v-if="row.triggerIcon"
                                    class="event-trigger-icon"
                                    :title="row.triggerLabel"
                                    aria-hidden="true"
                                >{{ row.triggerIcon }}</span>
                            </div>
                            <div class="event-metrics">
                                <span v-if="row.statusLabel" class="metric metric-status">
                                    <span class="metric-value">{{ row.statusLabel }}</span>
                                </span>
                                <span v-if="row.brightnessDisplay" class="metric metric-brightness">
                                    <span class="metric-icon" aria-hidden="true">💡</span>
                                    <span class="metric-value">{{ row.brightnessDisplay }}</span>
                                </span>
                                <span v-if="row._showColorAny" class="metric metric-color">
                                    <span v-if="row.colorHexDisplay || row.colorTemperature" class="color-swatch"
                                        :class="{ temperature: !row.colorHexDisplay }" :style="colorSwatchStyle(row)"></span>
                                    <span v-if="row.colorLabel || row._showCctOnly" class="metric-value">
                                        <template v-if="row.colorLabel">{{ row.colorLabel }}</template>
                                        <template v-else-if="row._showCctOnly">{{ row.colorTemperature }}K</template>
                                    </span>
                                </span>
                                <span v-if="row.sensorLux != null" class="metric">
                                    <span class="metric-icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" role="presentation">
                                        <path
                                            d="M12 4.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm6.364 3.136a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0ZM18.5 13a1 1 0 0 1 0 2h-1a1 1 0 1 1 0-2h1Zm-12 0a1 1 0 1 1 0 2H5.5a1 1 0 0 1 0-2h1Zm1.257-5.243a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707a1 1 0 0 1 1.414 0ZM12 9a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-1 6.5h2V20a1 1 0 1 1-2 0v-2.5Z" />
                                        </svg>
                                    </span>
                                    <span class="metric-value">{{ row.sensorLux }} lx</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </component>
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
    color: var(--text-muted);
    font-size: 14px;
}

.secondary {
    padding: 10px 16px;
    background: transparent;
    border: 1px solid var(--surface-border-strong);
    border-radius: 8px;
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.2s ease;
}

.secondary:disabled {
    opacity: 0.5;
    cursor: default;
}

.secondary:not(:disabled):hover {
    background: var(--surface-hover);
}

.panel {
    padding: 20px;
    border-radius: 16px;
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
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
    color: var(--text-primary);
}

.metrics-subtitle {
    margin: 4px 0 0;
    color: var(--text-muted);
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
    color: var(--text-muted);
}

.summary-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
}

.metrics-note {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
}

.metrics-note.error {
    color: var(--danger);
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
    color: var(--text-primary);
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
    background: var(--surface-muted);
    border-radius: 8px;
}

.row-label {
    font-family: 'SFMono-Regular', monospace;
    font-size: 12px;
    color: var(--text-subtle);
}

.row-value {
    font-size: 15px;
    font-weight: 600;
    color: #38bdf8;
}

.panel.error {
    border-color: var(--danger-border);
    color: var(--danger-text-soft);
}

.timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.empty {
    margin: 0;
    color: var(--text-muted);
}

.event-card {
    padding: 10px 18px;
    border-radius: 14px;
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.event-card-link {
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: inherit;
    text-decoration: none;
}

.event-card--clickable {
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, transform var(--transition-base);
}

.event-card--clickable:hover {
    border-color: var(--surface-border-strong);
    background: var(--surface-hover);
}

.event-card--clickable:active,
.event-card--clickable:has(.event-card-link:active) {
    transform: scale(0.95);
}

.event-card--clickable:focus-visible {
    outline: 2px solid var(--primary-strong);
    outline-offset: 2px;
}

.event-card--clickable .event-card-link:focus-visible {
    outline: 2px solid var(--primary-strong);
    outline-offset: 2px;
}

.event-card:hover .event-name {
    color: var(--text-primary);
}

.event-head {
    display: flex;
    align-items: center;
}

.event-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.event-row-line {
    display: flex;
    align-items: center;
    gap: 12px;
}

.event-row-left {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    min-width: 68px;
}

.event-metrics {
    flex: 1 1 auto;
}

.event-row-time {
    font-size: 13px;
    color: var(--text-subtle);
    white-space: nowrap;
}

.event-trigger-icon {
    flex: 0 0 auto;
    font-size: 13px;
    line-height: 1;
    color: var(--text-subtle);
    filter: saturate(0.9);
}

.event-trigger {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
    color: var(--text-subtle);
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--chip-bg);
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
    color: var(--danger-text-soft);
    background: var(--danger-soft);
}

.event-name {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 16px;
    margin: 0;
}

.event-name--inline {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    background: var(--chip-bg);
    color: var(--text-primary);
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
    gap: 16px;
    font-size: 13px;
    color: var(--text-subtle);
    justify-content: flex-start;
    min-width: 0;
    align-items: center;
}

.metric {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-primary);
    font-weight: 500;
}

.metric.metric-brightness {
    gap: 4px;
}

.metric-value {
    font-weight: 400;
    color: var(--text-muted);
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
    color: var(--danger);
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

	    .event-row-line {
	        flex-wrap: wrap;
	        gap: 12px;
	    }

	    .event-metrics {
	        justify-content: flex-start;
	    }
	}
</style>
