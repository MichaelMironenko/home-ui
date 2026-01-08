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

const { cfg, loadConfig, scenariosRequest } = useScenariosApi()
const {
    sortedScenarios,
    hasScenarios,
    loading,
    toggling,
    loadScenarios,
    togglePause
} = useScenarioList({ scenariosRequest, cfg, error })

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
})

onUnmounted(() => {
    if (nowTimer) {
        clearInterval(nowTimer)
        nowTimer = null
    }
})
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
                @ring-enter="activateScenario" @ring-leave="deactivateScenario" @ring-toggle-pin="togglePinnedScenario" />
            <ScenarioListSection :scenarios="sortedScenarios" :has-scenarios="hasScenarios"
                :active-scenario-id="activeScenarioId" :toggling="toggling"
                :scenario-status-display="scenarioStatusDisplay" :scenario-key="scenarioKey" @toggle-pause="togglePause"
                @hover="activateScenario" @hover-clear="deactivateScenario" />
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

.hero h1 {
    margin: 0;
    font-size: 28px;
    color: var(--text-primary);
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
