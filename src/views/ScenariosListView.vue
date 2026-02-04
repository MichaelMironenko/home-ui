<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { setDocumentDescription, setDocumentTitle, SCENARIOS_TITLE } from '../utils/pageTitle'
import { useScenariosApi } from '../composables/useScenariosApi'
import { useScenarioList } from '../composables/useScenarioList'
import { useScenarioDialGeometry } from '../composables/useScenarioDialGeometry'
import ScenarioOrbit from '../components/scenarios/ScenarioOrbit.vue'
import ScenarioListSection from '../components/scenarios/ScenarioListSection.vue'

const error = ref('')
const catalogGroups = ref([])
const nowTick = ref(Date.now())
let nowTimer = null
const hoveredScenarioId = ref(null)
const pinnedScenarioId = ref(null)
const isMobile = ref(false)
let mobileMediaQuery = null
let mobileMediaListener = null

const { cfg, loadConfig, scenariosRequest } = useScenariosApi()
const {
    sortedScenarios,
    hasScenarios,
    loading,
    toggling,
    loadScenarios,
    togglePause
} = useScenarioList({ scenariosRequest, cfg, error })

const NON_PREMIUM_SCENARIO_LIMIT = 3
const NON_PREMIUM_DEVICE_LIMIT = 10

const activeScenarios = computed(() => sortedScenarios.value.filter((entry) => !entry.disabled))

const catalogGroupDevices = computed(() => {
    const map = new Map()
    catalogGroups.value.forEach((group) => {
        if (!group?.id) return
        const entries = Array.isArray(group.devices)
            ? group.devices
                .map((deviceId) => String(deviceId || '').trim())
                .filter(Boolean)
            : []
        map.set(group.id, entries)
    })
    return map
})

function expandScenarioDevices(entry, groupMap) {
    const ids = new Set()
    const addDevice = (value) => {
        const normalized = String(value || '').trim()
        if (normalized) ids.add(normalized)
    }
    const explicitDevices = Array.isArray(entry?.targetDevices) ? entry.targetDevices : []
    explicitDevices.forEach(addDevice)
    const groups = Array.isArray(entry?.targetGroups) ? entry.targetGroups : []
    groups.forEach((groupId) => {
        const normalizedGroup = String(groupId || '').trim()
        if (!normalizedGroup) return
        const members = groupMap.get(normalizedGroup) || []
        members.forEach(addDevice)
    })
    return ids
}

const totalUniqueDevices = computed(() => {
    const union = new Set()
    const groupMap = catalogGroupDevices.value
    activeScenarios.value.forEach((entry) => {
        const ids = expandScenarioDevices(entry, groupMap)
        ids.forEach((id) => union.add(id))
    })
    return union
})

const sharedGroupIds = computed(() => {
    const groupSets = activeScenarios.value
        .map((entry) => {
            const list = Array.isArray(entry.targetGroups) ? entry.targetGroups : []
            return new Set(list.map((groupId) => String(groupId || '').trim()).filter(Boolean))
        })
        .filter((set) => set.size)
    if (!groupSets.length) return []
    let intersection = new Set(groupSets[0])
    for (let i = 1; i < groupSets.length; i += 1) {
        intersection = new Set([...intersection].filter((groupId) => groupSets[i].has(groupId)))
        if (!intersection.size) break
    }
    return [...intersection]
})

const hasSharedGroupExemption = computed(() => {
    const total = totalUniqueDevices.value.size
    if (total <= NON_PREMIUM_DEVICE_LIMIT) return false
    const groupMap = catalogGroupDevices.value
    for (const groupId of sharedGroupIds.value) {
        const devices = groupMap.get(groupId) || []
        const normalized = new Set(devices)
        if (normalized.size <= NON_PREMIUM_DEVICE_LIMIT) continue
        if (normalized.size !== total) continue
        const allIncluded = [...normalized].every((deviceId) => totalUniqueDevices.value.has(deviceId))
        if (!allIncluded) continue
        return true
    }
    return false
})

const scenarioLimitReached = computed(
    () => activeScenarios.value.length >= NON_PREMIUM_SCENARIO_LIMIT
)

const deviceLimitExceeded = computed(
    () => totalUniqueDevices.value.size > NON_PREMIUM_DEVICE_LIMIT && !hasSharedGroupExemption.value
)

const remainingScenarios = computed(() =>
    Math.max(NON_PREMIUM_SCENARIO_LIMIT - activeScenarios.value.length, 0)
)

const remainingDevices = computed(() => {
    const used = totalUniqueDevices.value.size
    const capped = Math.min(used, NON_PREMIUM_DEVICE_LIMIT)
    return Math.max(NON_PREMIUM_DEVICE_LIMIT - capped, 0)
})

function pluralize(value, forms) {
    const normalized = Math.abs(value) % 100
    if (normalized >= 11 && normalized <= 14) return forms[2]
    const lastDigit = normalized % 10
    if (lastDigit === 1) return forms[0]
    if (lastDigit >= 2 && lastDigit <= 4) return forms[1]
    return forms[2]
}

const canCreateScenario = computed(
    () => !scenarioLimitReached.value && !deviceLimitExceeded.value
)

const creationStatusText = computed(() => {
    if (scenarioLimitReached.value) return 'Достигнут лимит сценариев'
    if (deviceLimitExceeded.value) return 'Достигнут лимит устройств'
    return `Доступно: ${remainingScenarios.value} ${pluralize(remainingScenarios.value, ['сценарий', 'сценария', 'сценариев'])}, `
        + `${remainingDevices.value} ${pluralize(remainingDevices.value, ['устройство', 'устройства', 'устройств'])}`
})

const {
    dial,
    environment,
    currentNeedleCoords,
    groupRings,
    groupLabelPaths,
    orbitConflictSegments,
    scenarioArcGradients,
    scenarioKey,
    scenarioStatusDisplay,
    formatConflictLabel,
    formatOverlapWindow
} = useScenarioDialGeometry({
    sortedScenarios,
    catalogGroups,
    nowTick
})

const activeScenarioId = computed(() => pinnedScenarioId.value || hoveredScenarioId.value)
const activeGroupId = computed(() => {
    if (!activeScenarioId.value) return null
    for (const group of groupRings.value) {
        if (group.scenarios.some((entry) => entry.scenarioId === activeScenarioId.value)) {
            return group.id
        }
    }
    return null
})

setDocumentTitle(SCENARIOS_TITLE)
setDocumentDescription(
    'Список сценариев ExtraHub: создавайте, редактируйте, ставьте на паузу и отслеживайте статус умного света.'
)

async function loadCatalogGroups() {
    if (!cfg.value.base) return
    try {
        const data = await scenariosRequest('/catalog')
        catalogGroups.value = Array.isArray(data?.groups) ? data.groups : []
    } catch {
        catalogGroups.value = []
    }
}

function activateScenario(key) {
    hoveredScenarioId.value = key
}

function deactivateScenario(key) {
    if (hoveredScenarioId.value === key) {
        hoveredScenarioId.value = null
    }
}

function togglePinnedScenario(key) {
    pinnedScenarioId.value = pinnedScenarioId.value === key ? null : key
}

function scenarioDomId(key) {
    const safe = String(key || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
    return `scenario-card-${safe || 'unknown'}`
}

function scenarioCardId(item) {
    return scenarioDomId(scenarioKey(item))
}

function scrollToScenario(key) {
    if (!key || typeof document === 'undefined') return
    const target = document.getElementById(scenarioDomId(key))
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleRingToggle(key) {
    togglePinnedScenario(key)
    if (isMobile.value) {
        scrollToScenario(key)
    }
}

function syncMobileFlag() {
    if (!mobileMediaQuery) return
    isMobile.value = mobileMediaQuery.matches
}

onMounted(async () => {
    try {
        await loadConfig()
    } catch (err) {
        error.value = `Не удалось загрузить config: ${err}`
    }
    await Promise.all([loadScenarios(), loadCatalogGroups()])
    if (typeof window !== 'undefined') {
        nowTimer = window.setInterval(() => {
            nowTick.value = Date.now()
        }, 30000)
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
        mobileMediaQuery = window.matchMedia('(max-width: 640px)')
        mobileMediaListener = () => syncMobileFlag()
        syncMobileFlag()
        if (mobileMediaQuery.addEventListener) {
            mobileMediaQuery.addEventListener('change', mobileMediaListener)
        } else if (mobileMediaQuery.addListener) {
            mobileMediaQuery.addListener(mobileMediaListener)
        }
    }
})

onUnmounted(() => {
    if (nowTimer) {
        clearInterval(nowTimer)
        nowTimer = null
    }
    if (mobileMediaQuery && mobileMediaListener) {
        if (mobileMediaQuery.removeEventListener) {
            mobileMediaQuery.removeEventListener('change', mobileMediaListener)
        } else if (mobileMediaQuery.removeListener) {
            mobileMediaQuery.removeListener(mobileMediaListener)
        }
    }
    mobileMediaQuery = null
    mobileMediaListener = null
})
</script>

<template>
    <main class="page-shell list">
        <header class="hero page-header">
            <div>
                <h1>Сценарии</h1>
            </div>
            <div class="actions">
                <RouterLink class="info-link" :to="{ name: 'landing' }" target="_blank" rel="noopener">
                    Что умеет Extrahub?
                </RouterLink>
            </div>
        </header>

        <section class="panel-card" v-if="loading">
            <p>Загрузка списка…</p>
        </section>

        <section class="panel-card" v-else-if="error">
            <p>{{ error }}</p>
            <button class="toggle retry-button" type="button" @click="loadScenarios">Повторить</button>
        </section>

        <section v-else class="scenario-layout">
            <ScenarioOrbit v-if="hasScenarios" :group-rings="groupRings" :scenario-arc-gradients="scenarioArcGradients"
                :group-label-paths="groupLabelPaths" :orbit-conflict-segments="orbitConflictSegments"
                :active-scenario-id="activeScenarioId" :active-group-id="activeGroupId"
                :environment="environment" :dial-face-scale="dial.FACE_SCALE" :current-needle-coords="currentNeedleCoords"
                :format-overlap-window="formatOverlapWindow" :format-conflict-label="formatConflictLabel"
                @ring-enter="activateScenario" @ring-leave="deactivateScenario" @ring-toggle-pin="handleRingToggle" />
            <ScenarioListSection :scenarios="sortedScenarios" :has-scenarios="hasScenarios"
                :active-scenario-id="activeScenarioId" :toggling="toggling"
                :scenario-status-display="scenarioStatusDisplay" :scenario-key="scenarioKey"
                :scenario-card-id="scenarioCardId" :can-create-scenario="canCreateScenario"
                :creation-status-text="creationStatusText"
                @toggle-pause="togglePause" @hover="activateScenario"
                @hover-clear="deactivateScenario" />
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

.retry-button {
    margin-top: 8px;
}

.subtitle {
    margin: 4px 0 0;
    color: var(--text-muted);
}

.scenario-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

@media (min-width: 641px) {
    .scenario-layout {
        flex-direction: row;
        align-items: stretch;
    }

    :deep(.scenario-orbit) {
        flex: 1 1 0;
        min-width: 330px;
        max-width: 450px;
    }

    :deep(.scenario-list) {
        flex: 1 1 0;
    }
}
</style>
