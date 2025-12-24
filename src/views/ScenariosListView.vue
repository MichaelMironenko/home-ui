<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'
import { summarizeStatusRecord, deriveScenarioListStatus } from '../utils/scenarioStatusDisplay'
import { setDocumentDescription, setDocumentTitle, SCENARIOS_TITLE } from '../utils/pageTitle'

const router = useRouter()
const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(true)
const error = ref('')
const scenarios = ref([])
const toggling = ref({})
const nowTick = ref(Date.now())
let nowTimer = null

setDocumentTitle(SCENARIOS_TITLE)
setDocumentDescription('Список сценариев ExtraHub: создавайте, редактируйте, ставьте на паузу и отслеживайте статус умного света.')

function normalizeBase(raw = '') {
    return raw.replace(/\/+$/, '')
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

async function scenariosRequest(path, options = {}) {
    if (!cfg.value.base) throw new Error('scenarios URL not configured')
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

async function loadScenarios() {
    if (!cfg.value.base) {
        scenarios.value = []
        loading.value = false
        return
    }
    loading.value = true
    error.value = ''
    try {
        const data = await scenariosRequest('/list')
        if (Array.isArray(data?.scenarios)) {
            scenarios.value = data.scenarios.map((entry) => {
                const key = String(entry?.key || '').trim()
                const cleanedId = key.replace(/^scenarios\//, '').replace(/\.json$/i, '')
                const id = String(entry?.id || cleanedId || '').trim()
                const name = String(entry?.name || cleanedId || id || '').trim() || 'Без имени'
                return {
                    id,
                    name,
                    key,
                    size: Number(entry?.size) || 0,
                    lastModified: entry?.lastModified || '',
                    pause: entry?.pause || null,
                    status: summarizeStatusRecord(entry?.status || null),
                    type: entry?.type || null,
                    disabled: entry?.disabled === true,
                }
            })
        } else if (data?.ok === false && data?.error) {
            scenarios.value = []
            error.value = data.error
        } else {
            scenarios.value = []
            error.value = 'Не удалось получить список сценариев'
        }
    } catch (err) {
        error.value = `Не удалось загрузить сценарии: ${err}`
        scenarios.value = []
    } finally {
        loading.value = false
    }
}

const sortedScenarios = computed(() => {
    return [...scenarios.value].sort((a, b) => {
        if (a.disabled !== b.disabled) return a.disabled ? 1 : -1
        return a.name.localeCompare(b.name)
    })
})

const hasScenarios = computed(() => sortedScenarios.value.length > 0)

function scenarioLinkLocation(item) {
    if (!item || !item.id) return null
    if (item.type === 'auto-light-v1') {
        return { name: 'auto-light-edit', params: { id: item.id } }
    }
    return { name: 'scenario-edit', params: { id: item.id } }
}

function scenarioLinkHref(item) {
    const location = scenarioLinkLocation(item)
    if (!location) return '#'
    const resolved = router.resolve(location)
    if (resolved?.href) return resolved.href
    return resolved?.fullPath || '#'
}

function openScenario(item) {
    const location = scenarioLinkLocation(item)
    if (!location) return
    router.push(location)
}

function openScenarioInNewTab(item) {
    const href = scenarioLinkHref(item)
    if (!href || href === '#') return
    window.open(href, '_blank', 'noopener')
}

function handleCardClick(item, event) {
    if (!event || event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    openScenario(item)
}

function handleCardAuxClick(item, event) {
    if (event?.button === 1) {
        event.preventDefault()
        openScenarioInNewTab(item)
    }
}

function handleCardEnter(item) {
    openScenario(item)
}

function createScenario() {
    router.push({ name: 'scenario-create' })
}

function isPaused(item) {
    return !!item?.pause
}

async function togglePause(item) {
    if (!item?.id || toggling.value[item.id]) return
    if (item?.disabled) {
        error.value = 'Сценарий отключен — включите его, чтобы управлять паузой'
        return
    }
    if (item?.disabled) return
    toggling.value = { ...toggling.value, [item.id]: true }
    try {
        if (isPaused(item)) {
            const res = await scenariosRequest('/scenario/resume', { method: 'POST', body: { id: item.id } })
            item.pause = res?.result?.pause || null
            if (res?.status) item.status = summarizeStatusRecord(res.status)
        } else {
            const res = await scenariosRequest('/scenario/pause', { method: 'POST', body: { id: item.id } })
            item.pause = res?.pause || { setAt: Date.now(), reason: { source: 'manual' } }
            if (res?.status) item.status = summarizeStatusRecord(res.status)
        }
    } catch (err) {
        error.value = String(err)
    } finally {
        toggling.value = { ...toggling.value, [item.id]: false }
    }
}

onMounted(async () => {
    await loadConfig()
    await loadScenarios()
    if (typeof window !== 'undefined') {
        nowTimer = window.setInterval(() => {
            nowTick.value = Date.now()
        }, 30000)
    }
})

onUnmounted(() => {
    if (nowTimer) {
        clearInterval(nowTimer)
        nowTimer = null
    }
})

function scenarioStatusDisplay(item) {
    return deriveScenarioListStatus(item, nowTick.value)
}
</script>

<template>
    <main class="page-shell list">
        <header class="hero">
            <div>
                <h1>Сценарии</h1>
            </div>
            <div class="actions">
                <RouterLink class="info-link" :to="{ name: 'landing' }" target="_blank" rel="noopener">
                    Что умеет Extrahub?
                </RouterLink>
                <button class="toggle create-button" type="button" @click="createScenario">Создать сценарий</button>
            </div>
        </header>

        <section class="panel-card" v-if="loading">
            <p>Загрузка списка…</p>
        </section>

        <section class="panel-card" v-else-if="error">
            <p>{{ error }}</p>
            <button class="toggle retry-button" type="button" @click="loadScenarios">Повторить</button>
        </section>

        <section class="grid" v-else>
            <article v-if="!hasScenarios" class="empty onboarding">
                <h2>У вас пока нет сценариев</h2>
                <p>Создайте первый сценарий, чтобы автоматизировать свет или настроить собственные правила.</p>
                <ul>
                    <li>Выберите устройства и группы, которые нужно контролировать.</li>
                    <li>Задайте временное окно и условия запуска.</li>
                    <li>Сохраните и протестируйте сценарий прямо из редактора.</li>
                </ul>
                <button class="toggle create-button" type="button" @click="createScenario">Создать сценарий</button>
            </article>
            <article v-for="item in sortedScenarios" :key="item.id || item.key || item.name" class="scenario-card"
                :class="{ paused: isPaused(item), disabled: item.disabled }" role="link" tabindex="0"
                @keyup.enter="handleCardEnter(item)">
                <a class="card-link-overlay" :href="scenarioLinkHref(item)"
                    :aria-label="'Открыть сценарий «' + (item.name || 'Без имени') + '»'"
                    @click="handleCardClick(item, $event)" @auxclick="handleCardAuxClick(item, $event)" />
                <header class="card__header">
                    <div class="card__title">
                        <h2>{{ item.name }}</h2>
                        <p class="status" :class="`status--${scenarioStatusDisplay(item).kind}`">
                            <span>{{ scenarioStatusDisplay(item).label }}</span>
                        </p>
                    </div>
                    <button type="button" class="toggle" :disabled="toggling[item.id] || item.disabled"
                        @click.stop="togglePause(item)">
                        <span v-if="isPaused(item)">▶ Возобновить</span>
                        <span v-else>⏸ Пауза</span>
                    </button>
                </header>
            </article>
        </section>
    </main>
</template>

<style scoped>
.page-shell {
    padding: 24px 16px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.panel-card {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--surface-border);
    padding: 16px;
    box-shadow: 0 12px 30px rgba(2, 6, 23, 0.55);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.list {
    width: min(960px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.actions {
    display: flex;
    gap: 8px;
}

.info-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    color: #cbd5f5;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    background: rgba(15, 23, 42, 0.4);
}

.create-button {
    font-weight: 600;
    color: var(--text-primary);
}

.retry-button {
    margin-top: 8px;
}

.hero h1 {
    margin: 0;
    font-size: 28px;
    color: var(--text-primary);
}

.subtitle {
    margin: 4px 0 0;
    color: var(--text-muted);
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
}

.scenario-card {
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.45);
    position: relative;
}

.scenario-card.paused {
    border-color: rgba(249, 115, 22, 0.55);
    box-shadow: 0 12px 24px rgba(249, 115, 22, 0.25);
}

.scenario-card.disabled {
    opacity: 0.65;
    border-style: dashed;
}

.card__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    position: relative;
}

.card__title {
    flex: 1;
    cursor: pointer;
}

.card__title h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary);
}

.status {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.status span {
    position: relative;
}

.status--running {
    color: #34d399;
    animation: status-shimmer 2.5s ease-in-out infinite;
}

.status--running::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.7);
}

.status--paused {
    color: #facc15;
}

.status--off {
    color: var(--text-muted);
}

.status--waiting {
    color: #93c5fd;
}

.card-link-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    z-index: 2;
    display: block;
    cursor: pointer;
}

.card-link-overlay:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.4);
    outline-offset: -6px;
}

.card__header,
.card__title,
.status {
    position: relative;
}

.toggle {
    position: relative;
    z-index: 3;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    transition: background .15s ease, transform .1s ease;
    color: var(--text-primary);
}

.toggle:hover:enabled {
    background: rgba(168, 85, 247, 0.12);
    transform: translateY(-1px);
}

.toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.empty {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--text-muted);
    background: var(--surface-card);
    border-radius: 16px;
    padding: 32px;
    border: 1px dashed rgba(148, 163, 184, 0.4);
}

.onboarding {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
}

.onboarding h2 {
    margin: 0;
    color: var(--text-primary);
}

.onboarding ul {
    list-style: disc;
    padding-left: 20px;
    text-align: left;
    margin: 0;
    color: var(--text-muted);
}

@keyframes status-shimmer {
    0% {
        filter: none;
    }
    50% {
        filter: drop-shadow(0 0 6px rgba(52, 211, 153, 0.8));
    }
    100% {
        filter: none;
    }
}
</style>
