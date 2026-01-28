<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getConfig } from '../lib/api'
import { cacheScenarioUpdate, getCachedScenarioById } from '../lib/scenarioCache'
import { computeEnvironment, createDefaultScenario, normalizeScenarioStruct } from '../utils/scenarioUtils'
import { stopColorHex, temperatureToHex } from '../utils/colorUtils'
import { normalizeEvents, normalizeScenarioName as normalizeEventScenarioName } from '../utils/events'
import { trackFunctionCall } from '../lib/requestMetrics'
import {
    hasBrightnessCapability,
    supportsColorCapability,
    isTargetDevice
} from '../utils/deviceCapabilities'
import { lockColorUsage, lockColorMode, lockBrightnessUsage } from '../utils/stopStateRules'
import ScenarioDialCircle from '../components/dial/ScenarioDialCircle.vue'
import TargetDevicesCard from '../components/dial/TargetDevicesCard.vue'
import StopPreviewList from '../components/dial/StopPreviewList.vue'
import RunScheduleCard from '../components/dial/RunScheduleCard.vue'
import ScenarioActionsFooter from '../components/dial/ScenarioActionsFooter.vue'
import DeviceSelectorSheet from '../components/dial/DeviceSelectorSheet.vue'
import StopStateSheet from '../components/dial/StopStateSheet.vue'
import ScenarioSheet from '../components/dial/ScenarioSheet.vue'
import SegmentedControl from '../components/dial/SegmentedControl.vue'
import ScenarioHistoryChart from '../components/scenarios/ScenarioHistoryChart.vue'
import { useScenarioApi } from '../composables/useScenarioApi'
import { useProfile } from '../composables/useProfile'
import {
    applyStop,
    buildScenarioPayload,
    clampNumberLocal,
    hydrateStopsFromActions,
    normalizeScenarioName,
    summarizeStopState,
    updateStopFromTime
} from '../utils/scenarioViewLogic'
import { summarizeStatusRecord, deriveScenarioListStatus } from '../utils/scenarioStatusDisplay'
import { setDocumentDescription, setDocumentTitle, SCENARIOS_TITLE } from '../utils/pageTitle'

const scenarioStatus = ref('running')
const scenarioDisplayStatus = computed(() => {
    if (scenarioStatus.value === 'off' || scenario.disabled) return 'off'
    return scenarioStatus.value
})
const scenarioStatusSummary = ref(null)
const scenarioPauseInfo = ref(null)
const scenarioOverlaps = ref([])
const route = useRoute()
const router = useRouter()
const profileStore = useProfile()
const routeScenarioId = computed(() => {
    const id = route.params.id
    return typeof id === 'string' ? id : ''
})
const isCreateMode = computed(() => route.name === 'scenario-create')
const scenarioApiReady = ref(false)
const scenarioLoading = ref(!isCreateMode.value && !!routeScenarioId.value)

const presenceConfigured = computed(() => !!profileStore.presenceConfigured.value)
const PRESENCE_SETUP_TOOLTIP = 'Для работы сценария по присутствию сначала нужно настроить его в профиле'
const presenceOptions = computed(() => {
    const ready = presenceConfigured.value
    return [
        { id: 'any', label: 'Всегда' },
        {
            id: 'home',
            label: 'Когда кто-то дома',
            disabled: !ready,
            warning: !ready,
            tooltip: !ready ? PRESENCE_SETUP_TOOLTIP : null
        }
    ]
})
const presenceMode = ref('any')
const weekdayOptions = [
    { value: 1, label: 'Пн' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чт' },
    { value: 5, label: 'Пт' },
    { value: 6, label: 'Сб' },
    { value: 7, label: 'Вс' }
]

const { loadConfig: loadScenarioConfig, scenarioRequest } = useScenarioApi()
const scenario = reactive(createDefaultScenario())
scenario.id = ''
scenario.name = ''
const canControlRuntime = computed(() => !isCreateMode.value && !!scenario.id)
const scenarioDisabled = computed(() => scenario.disabled === true)
const selectedDevicesIds = ref(new Set())
const selectedGroupIds = ref(new Set())
const selectionDirty = ref(false)
const selectionSources = reactive({
    targetDevices: [],
    targetGroups: []
})
const editingName = ref(false)
const nameInputRef = ref(null)

const sunriseTime = ref(7 * 60 + 10)
const sunsetTime = ref(16 * 60 + 25)
const envInfo = ref(null)
const scenarioNameValue = computed({
    get() {
        return scenario.name || ''
    },
    set(value) {
        scenario.name = String(value ?? '').slice(0, 30)
    }
})

const scenarioNameDisplayTrimmed = computed(() => normalizeScenarioName(scenarioNameValue.value))
const scenarioNameUiLabel = computed(() => scenarioNameDisplayTrimmed.value || 'Название сценария')

function updateScenarioPageTitle() {
    const trimmedName = scenarioNameValue.value?.trim()
    if (trimmedName) {
        setDocumentTitle(trimmedName, SCENARIOS_TITLE)
        setDocumentDescription(`Сценарий "${trimmedName}" в ExtraHub: настройка расписания, устройств и условий запуска.`)
        return
    }
    if (isCreateMode.value) {
        setDocumentTitle('Новый сценарий', SCENARIOS_TITLE)
        setDocumentDescription('Создайте новый сценарий ExtraHub: выберите устройства, дни недели, яркость и цвет света.')
        return
    }
    setDocumentTitle('Сценарий', SCENARIOS_TITLE)
    setDocumentDescription('Сценарий ExtraHub: настройка времени, устройств, яркости, цвета и условий присутствия.')
}

watch([scenarioNameValue, isCreateMode], updateScenarioPageTitle, { immediate: true })

watch(editingName, (active) => {
    if (active) {
        nextTick(() => nameInputRef.value?.focus())
    }
})

function finishEditingName() {
    editingName.value = false
    scenario.name = normalizeScenarioName(scenario.name)
    if (!scenario.name) scenario.name = 'Новый сценарий'
}

const selectedDays = computed(() => {
    const days = scenario.time?.days
    if (Array.isArray(days) && days.length) return days
    return [1, 2, 3, 4, 5, 6, 7]
})

const scheduleDaysSummary = computed(() => {
    const days = selectedDays.value
    if (Array.isArray(days) && days.length === 7) return 'Каждый день'
    const labelByValue = new Map(weekdayOptions.map((item) => [item.value, item.label]))
    const labels = (days || [])
        .slice()
        .sort((a, b) => a - b)
        .map((value) => labelByValue.get(value))
        .filter(Boolean)
    return labels.length ? labels.join(', ') : 'Каждый день'
})

const schedulePresenceSummary = computed(() => {
    return presenceOptions.value.find((option) => option.id === presenceMode.value)?.label || 'Всегда'
})

const scheduleSummary = computed(() => `${scheduleDaysSummary.value} · ${schedulePresenceSummary.value}`)

const scheduleDraftDays = ref(new Set(selectedDays.value))
const scheduleDraftPresence = ref(presenceMode.value)

function resetScheduleDrafts() {
    scheduleDraftDays.value = new Set(selectedDays.value)
    scheduleDraftPresence.value = presenceMode.value
}

function toggleScheduleDraftDay(value) {
    const nextDays = new Set(scheduleDraftDays.value)
    if (nextDays.has(value)) nextDays.delete(value)
    else nextDays.add(value)
    if (!nextDays.size) nextDays.add(value)
    scheduleDraftDays.value = nextDays
}

function setScheduleDraftPresence(value) {
    scheduleDraftPresence.value = value
}

function applyScheduleChanges() {
    const sortedDays = Array.from(scheduleDraftDays.value).sort((a, b) => a - b)
    scenario.time = {
        ...(scenario.time || {}),
        days: sortedDays
    }
    presenceMode.value = scheduleDraftPresence.value
    closeModal()
}

const colorPalette = ['#ffd89c', '#ffb4a2', '#f472b6', '#c084fc', '#60a5fa', '#34d399', '#fef08a', '#f97316']

const startStop = createStopState({
    clockMinutes: 6 * 60 + 30,
    temperature: 3200,
    colorHex: '#ffd9a8',
    brightness: 65
})
const endStop = createStopState({
    clockMinutes: 22 * 60,
    temperature: 4800,
    colorHex: '#a1c9ff',
    brightness: 12,
    useBrightness: true,
    useColor: true
})

const historyDefaultColor = computed(() => stopColorHex(startStop))

const AUTO_BRIGHTNESS_DEFAULTS = {
    enabled: false,
    sensorId: '',
    luxMin: 1,
    luxMax: 1000,
    brightnessMin: 0,
    brightnessMax: 100
}

const autoBrightness = reactive({ ...AUTO_BRIGHTNESS_DEFAULTS })

watch(
    () => startStop.useColor,
    () => {
        lockColorUsage(startStop, endStop)
    }
)

watch(
    () => startStop.useBrightness,
    (value) => {
        lockBrightnessUsage(startStop, endStop)
    }
)

watch(
    () => startStop.colorMode,
    () => {
        lockColorMode(startStop, endStop)
    }
)

lockColorUsage(startStop, endStop)
lockBrightnessUsage(startStop, endStop)

function resetAutoBrightness() {
    Object.assign(autoBrightness, AUTO_BRIGHTNESS_DEFAULTS)
}

function applyAutoBrightnessState(state) {
    if (!state || typeof state !== 'object') return false
    autoBrightness.enabled = !!state.enabled
    autoBrightness.sensorId = state.sensorId || ''
    const rawLuxMin = clampNumberLocal(state.luxMin ?? AUTO_BRIGHTNESS_DEFAULTS.luxMin, 0, AUTO_BRIGHTNESS_DEFAULTS.luxMax)
    const luxMax = clampNumberLocal(
        state.luxMax ?? AUTO_BRIGHTNESS_DEFAULTS.luxMax,
        Math.max(rawLuxMin + 1, AUTO_BRIGHTNESS_DEFAULTS.luxMin + 1),
        100000
    )
    autoBrightness.luxMax = luxMax
    autoBrightness.luxMin = Math.min(rawLuxMin, luxMax - 1)
    const rawBrightnessMin = clampNumberLocal(
        state.brightnessMin ?? AUTO_BRIGHTNESS_DEFAULTS.brightnessMin,
        0,
        AUTO_BRIGHTNESS_DEFAULTS.brightnessMax
    )
    const brightnessMax = clampNumberLocal(
        state.brightnessMax ?? AUTO_BRIGHTNESS_DEFAULTS.brightnessMax,
        rawBrightnessMin,
        100
    )
    autoBrightness.brightnessMax = brightnessMax
    autoBrightness.brightnessMin = Math.min(rawBrightnessMin, brightnessMax)
    return true
}

function createStopState({
    clockMinutes,
    temperature,
    colorHex,
    brightness,
    useColor = true,
    useBrightness = true
}) {
    return reactive({
        mode: 'clock', // clock | sunrise | sunset
        clockMinutes,
        offset: 0,
        colorMode: 'temperature', // temperature | rgb
        temperature,
        colorHex,
        brightness,
        useColor,
        useBrightness
    })
}

function handleStartStopUpdate(snapshot) {
    applyStop(startStop, snapshot)
}

function handleEndStopUpdate(snapshot) {
    applyStop(endStop, snapshot)
}

function handleStopModalUpdate(snapshot) {
    if (modalPayload.value === 'start') handleStartStopUpdate(snapshot)
    if (modalPayload.value === 'end') handleEndStopUpdate(snapshot)
}

function handleDialChange(payload) {
    if (payload?.start) applyStop(startStop, payload.start)
    if (payload?.end) applyStop(endStop, payload.end)
}

function handleAutoBrightnessUpdate(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return
    Object.assign(autoBrightness, snapshot)
}

function applyStopsFromScenario() {
    const startSource = scenario.time?.start
    const endSource = scenario.time?.end
    if (startSource) updateStopFromTime(startStop, startSource)
    if (endSource) updateStopFromTime(endStop, endSource)
    resetAutoBrightness()
    hydrateStopsFromActions(scenario.actions || [], { startStop, endStop, autoBrightness })
}

captureSelectionSourcesFromScenario()
applyStopsFromScenario()

function clearSelectionSources() {
    selectionSources.targetDevices = []
    selectionSources.targetGroups = []
}

function captureSelectionSourcesFromScenario(source = scenario) {
    selectionSources.targetDevices = Array.isArray(source.target?.devices) ? [...source.target.devices] : []
    selectionSources.targetGroups = Array.isArray(source.target?.groups) ? [...source.target.groups] : []
}

function resolveScenarioSelection() {
    const groupSet = new Set(selectionSources.targetGroups || [])
    const deviceSet = new Set(selectionSources.targetDevices || [])
    applyGroupMembersToDevices(deviceSet, groupSet)
    return { groups: groupSet, devices: deviceSet }
}

function setsEqual(left, right) {
    if (left === right) return true
    if (!left || !right || left.size !== right.size) return false
    for (const value of left) {
        if (!right.has(value)) return false
    }
    return true
}

function syncSelectedDevicesFromSources(force = false) {
    if (!force && selectionDirty.value) return
    const prevGroups = new Set(selectedGroupIds.value)
    const prevDevices = new Set(selectedDevicesIds.value)
    const resolved = resolveScenarioSelection()
    selectedGroupIds.value = new Set(resolved.groups)
    selectedDevicesIds.value = new Set(resolved.devices)
    sanitizeSelectionSets()
    if (!selectionDirty.value && baselineComparable.value) {
        const groupsChanged = !setsEqual(prevGroups, selectedGroupIds.value)
        const devicesChanged = !setsEqual(prevDevices, selectedDevicesIds.value)
        if (groupsChanged || devicesChanged) {
            markBaseline()
        }
    }
}

function getSelectionRefs() {
    if (isDeviceSheetActive.value) {
        return {
            groupsRef: deviceSelectionDraftGroups,
            devicesRef: deviceSelectionDraftDevices
        }
    }
    return {
        groupsRef: selectedGroupIds,
        devicesRef: selectedDevicesIds
    }
}

function handleGroupToggle(group, checked) {
    const groupId = typeof group === 'object' ? group.id : group
    if (!groupId) return
    const { groupsRef, devicesRef } = getSelectionRefs()
    const groupSet = new Set(groupsRef.value)
    const deviceSet = new Set(devicesRef.value)
    const members = groupMembers.value.get(groupId) || []
    if (checked) {
        groupSet.add(groupId)
        members.forEach((memberId) => deviceSet.add(memberId))
    } else {
        groupSet.delete(groupId)
        members.forEach((memberId) => deviceSet.delete(memberId))
    }
    groupsRef.value = groupSet
    devicesRef.value = deviceSet
    if (!isDeviceSheetActive.value) {
        sanitizeSelectionSets()
        selectionDirty.value = true
    }
}

function handleDeviceToggle(payload, checked) {
    const device = payload?.device
    if (!device?.id) return
    const { groupsRef, devicesRef } = getSelectionRefs()
    const deviceSet = new Set(devicesRef.value)
    const groupSet = new Set(groupsRef.value)
    if (checked) deviceSet.add(device.id)
    else deviceSet.delete(device.id)
    if (payload.group?.id) {
        const members = groupMembers.value.get(payload.group.id) || []
        const allSelected = members.every((memberId) => (memberId === device.id ? checked : deviceSet.has(memberId)))
        if (allSelected) groupSet.add(payload.group.id)
        else groupSet.delete(payload.group.id)
    }
    devicesRef.value = deviceSet
    groupsRef.value = groupSet
    if (!isDeviceSheetActive.value) {
        selectionDirty.value = true
    }
}

function applyDeviceSelectionChanges() {
    if (activeModal.value !== 'devices') return
    const nextGroups = new Set(deviceSelectionDraftGroups.value)
    const nextDevices = new Set(deviceSelectionDraftDevices.value)
    const groupsChanged = !setsEqual(nextGroups, selectedGroupIds.value)
    const devicesChanged = !setsEqual(nextDevices, selectedDevicesIds.value)
    selectedGroupIds.value = nextGroups
    selectedDevicesIds.value = nextDevices
    sanitizeSelectionSets()
    if ((groupsChanged || devicesChanged) && !selectionDirty.value) {
        selectionDirty.value = true
    }
    closeModal()
}

watch(
    () => routeScenarioId.value,
    (id, prev) => {
        if (!scenarioApiReady.value) return
        if (id === prev) return
        loadScenarioById(id)
    }
)

watch(
    scenarioStatus,
    (value) => {
        scenario.disabled = value === 'off'
    },
    { immediate: true }
)

function setBaselineDisabled(nextDisabled) {
    if (!baselineComparable.value) return
    try {
        const payload = JSON.parse(baselineComparable.value)
        payload.disabled = nextDisabled
        baselineComparable.value = JSON.stringify(payload)
    } catch {
        baselineComparable.value = baselineComparable.value
    }
}

async function toggleScenarioPower() {
    if (!scenario.id) {
        scenarioError.value = 'Сценарий еще не сохранен'
        return
    }
    if (powerToggling.value) return
    powerToggling.value = true
    scenarioError.value = ''
    const prevDisabled = scenario.disabled === true
    const nextDisabled = !prevDisabled
    const prevBaseline = baselineComparable.value
    scenario.disabled = nextDisabled
    scenarioStatus.value = nextDisabled ? 'off' : 'running'
    setBaselineDisabled(nextDisabled)
    try {
        const payload = baselineComparable.value ? JSON.parse(baselineComparable.value) : getScenarioPayload()
        payload.disabled = nextDisabled
        await scenarioRequest('/scenario/save', { method: 'POST', body: { scenario: payload } })
        if (!nextDisabled) {
            await refreshScenarioStatus()
        }
    } catch (err) {
        scenario.disabled = prevDisabled
        scenarioStatus.value = prevDisabled ? 'off' : 'running'
        baselineComparable.value = prevBaseline
        scenarioError.value = err?.message || 'Не удалось изменить состояние сценария'
    } finally {
        powerToggling.value = false
    }
}

const timeTicker = ref(Date.now())
let timeTickerInterval = null

const currentWorldMinute = computed(() => {
    const date = new Date(timeTicker.value)
    return date.getHours() * 60 + date.getMinutes()
})

const scenarioRuntimeStatus = computed(() => {
    const derived = deriveScenarioListStatus(
        {
            pause: scenarioPauseInfo.value,
            disabled: scenario.disabled,
            status: scenarioStatusSummary.value
        },
        timeTicker.value
    )
    if (derived) return derived
    if (scenario.disabled) return { kind: 'off', label: 'Выключен' }
    return { kind: 'waiting', label: 'Нет данных' }
})

const scenarioStatusText = computed(() => scenarioRuntimeStatus.value?.label || '')
const scenarioStatusLabel = computed(() =>
    scenarioRuntimeStatus.value?.kind === 'running' ? '' : scenarioRuntimeStatus.value?.label || ''
)
const scenarioStatusColor = computed(() => {
    const kind = scenarioRuntimeStatus.value?.kind
    if (kind === 'off') return '#94a3b8'
    if (kind === 'paused') return '#facc15'
    if (kind === 'waiting') return '#93c5fd'
    return '#34d399'
})
const scenarioDialStatus = computed(() => {
    const kind = scenarioRuntimeStatus.value?.kind
    if (kind === 'off') return 'off'
    if (kind === 'paused') return 'paused'
    if (kind === 'waiting') return 'waiting'
    return 'running'
})

const dialFaceRatio = 0.74
const autoBrightnessActive = computed(
    () => autoBrightness.enabled && (startStop.useBrightness || endStop.useBrightness)
)

const config = reactive({
    base: '',
    keyHeader: 'x-api-key',
    keyValue: ''
})
const catalog = reactive({
    devices: [],
    rooms: [],
    groups: []
})
const scenarioSaving = ref(false)
const scenarioMessage = ref('')
const scenarioError = ref('')
const powerToggling = ref(false)
const saveToastMessage = ref('')
const saveToastId = ref(0)
let saveToastTimer = null
const catalogLoading = ref(false)
const catalogError = ref('')
const events = ref([])
const eventsError = ref('')
const eventsLoading = ref(false)
let eventsInterval = null
let catalogInterval = null
const EVENT_POLL_INTERVAL_MS = 5 * 60 * 1000
const CATALOG_POLL_INTERVAL_MS = 5 * 60 * 1000
const catalogGroupSignature = computed(() =>
    (catalog.groups || [])
        .map((group) => {
            const deviceList = Array.isArray(group?.devices) ? group.devices.join(',') : ''
            return `${group?.id || 'unknown'}:${deviceList}`
        })
        .join('|')
)

watch(catalogGroupSignature, () => {
    if (!selectionDirty.value) syncSelectedDevicesFromSources(false)
})

function showSaveToast(message) {
    saveToastMessage.value = message
    saveToastId.value += 1
    if (saveToastTimer) clearTimeout(saveToastTimer)
    saveToastTimer = setTimeout(() => {
        saveToastMessage.value = ''
    }, 2400)
}

async function loadConfig() {
    try {
        const raw = await getConfig()
        const apiBase =
            raw.api ||
            raw.apiBase ||
            raw.scenariosUrl ||
            raw.scenariosURL ||
            raw.scenariosBase ||
            raw.scenarioUrl ||
            ''
        config.base = (apiBase || '').replace(/\/+$/, '')
        config.keyHeader = raw.keyHeader || raw['x-api-key-header'] || 'x-api-key'
        config.keyValue = raw.keyValue || raw.apiKey || raw['x-api-key'] || ''
    } catch (err) {
        catalogError.value = `config.json: ${err}`
    }
}

async function loadCatalog() {
    if (!config.base) return
    catalogLoading.value = true
    catalogError.value = ''
    try {
        const data = await apiFetch('/catalog')
        catalog.devices = Array.isArray(data?.devices) ? data.devices : []
        catalog.rooms = Array.isArray(data?.rooms) ? data.rooms : []
        catalog.groups = Array.isArray(data?.groups) ? data.groups : []
        if (!selectionDirty.value) syncSelectedDevicesFromSources(false)
    } catch (err) {
        catalogError.value = `catalog: ${err}`
    } finally {
        catalogLoading.value = false
    }
}

async function apiFetch(path, options = {}) {
    if (!config.base) throw new Error('API base не задан в config.json')
    const headers = { ...(options.headers || {}) }
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    if (config.keyValue) headers[config.keyHeader || 'x-api-key'] = config.keyValue
    trackFunctionCall()
    const res = await fetch(`${config.base}${path}`, {
        ...options,
        headers,
        credentials: options.credentials ?? 'include',
        body: options.body ? JSON.stringify(options.body) : undefined
    })
    const text = await res.text()
    let json
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        json = null
    }
    if (!res.ok) {
        throw new Error(json?.error || text || res.statusText || 'Request failed')
    }
    return json
}

const eventsScenarioIndex = computed(() => {
    const byId = new Map()
    const byName = new Map()
    const nameKey = normalizeEventScenarioName(scenario.name || '')
    const scenarioId = scenario.id ? String(scenario.id) : ''
    if (scenarioId) {
        byId.set(scenarioId, { id: scenarioId, name: scenario.name || '', type: scenario.type || null })
    }
    if (nameKey) {
        byName.set(nameKey, { id: scenarioId, name: scenario.name || '', type: scenario.type || null })
    }
    return { byId, byName }
})

async function loadScenarioEvents() {
    if (!config.base) return
    if (!events.value.length) eventsLoading.value = true
    eventsError.value = ''
    try {
        const data = await apiFetch('/events')
        events.value = normalizeEvents(data?.events || [], eventsScenarioIndex.value)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        eventsError.value = `Ошибка загрузки истории: ${message}`
    } finally {
        eventsLoading.value = false
    }
}

function startEventsPolling() {
    if (eventsInterval) return
    eventsInterval = setInterval(() => {
        loadScenarioEvents()
    }, EVENT_POLL_INTERVAL_MS)
}

function stopEventsPolling() {
    if (!eventsInterval) return
    clearInterval(eventsInterval)
    eventsInterval = null
}

function startCatalogPolling() {
    if (catalogInterval) return
    catalogInterval = setInterval(() => {
        loadCatalog()
    }, CATALOG_POLL_INTERVAL_MS)
}

function stopCatalogPolling() {
    if (!catalogInterval) return
    clearInterval(catalogInterval)
    catalogInterval = null
}

const shouldPollEvents = computed(
    () => canControlRuntime.value && scenarioRuntimeStatus.value?.kind === 'running'
)

const shouldPollCatalog = computed(
    () => canControlRuntime.value && scenarioRuntimeStatus.value?.kind === 'running'
)

const latestScenarioEvent = computed(() => {
    const list = events.value || []
    if (!list.length) return null
    const scenarioId = scenario.id ? String(scenario.id) : ''
    const nameKey = normalizeEventScenarioName(scenario.name || '')
    return (
        list.find((event) => {
            if (scenarioId && event.scenarioId === scenarioId) return true
            if (nameKey && normalizeEventScenarioName(event.scenarioName) === nameKey) return true
            return false
        }) || null
    )
})

const scenarioHistoryEvents = computed(() => {
    const list = Array.isArray(events.value) ? events.value.slice() : []
    if (!list.length) return []
    const scenarioId = scenario.id ? String(scenario.id) : ''
    const nameKey = normalizeEventScenarioName(scenario.name || '')
    const matched = list.filter((event) => {
        if (scenarioId && event.scenarioId === scenarioId) return true
        if (nameKey && normalizeEventScenarioName(event.scenarioName) === nameKey) return true
        return false
    })
    return matched.sort((a, b) => a.timestamp - b.timestamp)
})

const dialCurrentState = computed(() => {
    const event = latestScenarioEvent.value
    if (!event) return null
    const brightness = event.brightnessDisplay || ''
    const temperature = Number.isFinite(event.colorTemperature) ? Math.round(event.colorTemperature) : null
    const colorHex = event.colorHexDisplay || (temperature != null ? temperatureToHex(temperature) : null)
    if (!brightness && !colorHex) return null
    return { brightness, colorHex, temperature }
})

function getScenarioPayload() {
    return buildScenarioPayload({
        scenario,
        selectedGroupIds: selectedGroupIds.value,
        selectedDeviceIds: selectedDevicesIds.value,
        selectedDays: selectedDays.value,
        startStop,
        endStop,
        autoBrightness,
        presenceMode: presenceMode.value
    })
}

const startStateSummary = computed(() => summarizeStopState(startStop, autoBrightness.enabled))
const endStateSummary = computed(() => summarizeStopState(endStop, autoBrightness.enabled))

const baselineComparable = ref('')
const currentComparable = computed(() => {
    try {
        return JSON.stringify(getScenarioPayload())
    } catch {
        return ''
    }
})
const hasUnsavedChanges = computed(
    () => Boolean(baselineComparable.value) && currentComparable.value !== baselineComparable.value
)

function markBaseline() {
    baselineComparable.value = currentComparable.value
}

function resetScenarioState() {
    Object.assign(scenario, createDefaultScenario())
    scenario.id = ''
    scenario.name = ''
    scenario.type = 'scenario-v1'
    selectedDevicesIds.value = new Set()
    selectionDirty.value = false
    clearSelectionSources()
    captureSelectionSourcesFromScenario()
    resetAutoBrightness()
    presenceMode.value = 'any'
    scenarioStatus.value = 'running'
    scenarioStatusSummary.value = null
    scenarioPauseInfo.value = null
    editingName.value = false
    scenarioOverlaps.value = []
    applyStopsFromScenario()
    syncSelectedDevicesFromSources(true)
    markBaseline()
}

function applyScenarioResponse(payload, { skipScenario = false, skipCache = false } = {}) {
    const data = payload?.scenario
    if (!skipScenario && data) {
        Object.assign(scenario, createDefaultScenario(), data)
        normalizeScenarioStruct(scenario)
        scenario.id = data.id || ''
        scenario.name = data.name || ''
        presenceMode.value = scenario.runtime?.presence === 'onlyWhenHome' ? 'home' : 'any'
        scenarioStatus.value = scenario.disabled ? 'off' : 'running'
        captureSelectionSourcesFromScenario()
        selectionDirty.value = false
        applyStopsFromScenario()
        syncSelectedDevicesFromSources(true)
        editingName.value = false
        markBaseline()
    }
    scenarioPauseInfo.value = payload?.pause || null
    scenarioStatusSummary.value = summarizeStatusRecord(payload?.statusSummary || payload?.status || null)
    scenarioOverlaps.value = Array.isArray(payload?.overlaps) ? payload.overlaps : []
    if (!skipScenario && !skipCache && data) {
        const meta = payload?.meta || null
        const mergedMeta = payload?.etag
            ? { ...(meta || {}), etag: payload.etag }
            : meta
        cacheScenarioUpdate(data, mergedMeta)
    }
}

const overlapNameMap = computed(() => {
    const map = {}
    const overlaps = scenarioOverlaps.value || []
    overlaps.forEach((entry) => {
        const id = entry?.scenarioId
        if (!id) return
        const cached = getCachedScenarioById(String(id))
        map[id] = cached?.scenario?.name || String(id)
    })
    return map
})

async function loadScenarioById(id) {
    if (!scenarioApiReady.value) return
    if (!id) {
        scenarioLoading.value = false
        resetScenarioState()
        return
    }
    const cached = getCachedScenarioById(id)
    if (cached?.scenario) {
        applyScenarioResponse(
            { scenario: cached.scenario, statusSummary: cached.statusSummary || null },
            { skipScenario: false, skipCache: true }
        )
        scenarioLoading.value = false
    }
    scenarioError.value = ''
    if (!cached?.scenario) scenarioLoading.value = true
    try {
        const query = new URLSearchParams({ id })
        const headers = {}
        if (cached?.meta?.etag) {
            headers['If-None-Match'] = cached.meta.etag
        }
        const response = await scenarioRequest(`/scenario?${query.toString()}`, { headers })
        if (response?.notModified && cached?.scenario) {
            if (response?.etag && cached?.meta) {
                cacheScenarioUpdate(cached.scenario, { ...cached.meta, etag: response.etag })
            }
            return
        }
        if (!response?.scenario) {
            resetScenarioState()
            return
        }
        applyScenarioResponse(response, { skipScenario: false })
    } catch (err) {
        console.error('Failed to load scenario', err)
        scenarioError.value = err?.message || 'Не удалось загрузить сценарий'
    } finally {
        scenarioLoading.value = false
    }
}

async function refreshScenarioStatus() {
    if (!scenarioApiReady.value) return
    const scenarioId = scenario.id ? String(scenario.id) : ''
    if (!scenarioId) return
    try {
        const query = new URLSearchParams({ id: scenarioId })
        const response = await scenarioRequest(`/scenario?${query.toString()}`)
        if (response?.notModified) return
        applyScenarioResponse(response, { skipScenario: true, skipCache: true })
    } catch (err) {
        console.warn('Failed to refresh scenario status', err)
    }
}

async function saveScenario() {
    scenarioSaving.value = true
    scenarioError.value = ''
    scenarioMessage.value = ''
    try {
        const payload = getScenarioPayload()
        console.info('[ScenarioView] sending scenario payload', payload)
        const response = await scenarioRequest('/scenario/save', { method: 'POST', body: { scenario: payload } })
        if (response?.scenario) {
            Object.assign(scenario, createDefaultScenario(), response.scenario)
            normalizeScenarioStruct(scenario)
            scenario.id = response.scenario.id || scenario.id
            scenario.name = response.scenario.name || scenario.name
            captureSelectionSourcesFromScenario()
            selectionDirty.value = false
            cacheScenarioUpdate(response.scenario, response?.meta || null)
        }
        scenarioStatus.value = scenario.disabled ? 'off' : 'running'
        applyStopsFromScenario()
        if (!selectionDirty.value) syncSelectedDevicesFromSources(false)
        showSaveToast('Сценарий сохранён')
        editingName.value = false
        markBaseline()
        if (!scenario.disabled) {
            await refreshScenarioStatus()
        } else {
            scenarioStatusSummary.value = null
        }
        const savedId = response?.scenario?.id || scenario.id
        if (savedId && (isCreateMode.value || routeScenarioId.value !== savedId)) {
            router.replace({ name: 'scenario-edit', params: { id: savedId } })
        }
    } catch (err) {
        console.error('Failed to save scenario', err)
        scenarioError.value = err?.message || 'Не удалось сохранить сценарий'
    } finally {
        scenarioSaving.value = false
    }
}

async function handleCancel() {
    if (scenarioSaving.value) return
    if (isCreateMode.value || !routeScenarioId.value) {
        resetScenarioState()
        return
    }
    await loadScenarioById(routeScenarioId.value)
}

async function deleteScenario() {
    if (!scenario.id) return
    const ok = window.confirm(`Удалить сценарий "${normalizeScenarioName(scenario.name) || 'Без названия'}"?`)
    if (!ok) return
    try {
        await scenarioRequest('/scenario/delete', { method: 'POST', body: { id: scenario.id } })
        scenarioMessage.value = 'Сценарий удалён'
        resetScenarioState()
        router.replace({ name: 'scenarios-list' })
    } catch (err) {
        console.error('Failed to delete scenario', err)
        scenarioError.value = err?.message || 'Не удалось удалить сценарий'
    }
}

watch(hasUnsavedChanges, (dirty) => {
    if (dirty) scenarioMessage.value = ''
})

onMounted(async () => {
    await loadConfig()
    loadCatalog()
    try {
        const env = computeEnvironment({})
        envInfo.value = env
        sunriseTime.value = env.sunriseMin
        sunsetTime.value = env.sunsetMin
    } catch (err) {
        console.warn('Failed to compute sun times', err)
    }
    try {
        await loadScenarioConfig()
        scenarioApiReady.value = true
        await loadScenarioById(routeScenarioId.value)
        await loadScenarioEvents()
    } catch (err) {
        console.warn('Scenario config failed', err)
    }
    timeTickerInterval = setInterval(() => {
        timeTicker.value = Date.now()
    }, 60 * 1000)
})

watch(
    () => presenceConfigured.value,
    (ready) => {
        if (!ready && presenceMode.value !== 'any') {
            presenceMode.value = 'any'
        }
    },
    { immediate: true }
)

onUnmounted(() => {
    if (timeTickerInterval) {
        clearInterval(timeTickerInterval)
        timeTickerInterval = null
    }
    if (saveToastTimer) {
        clearTimeout(saveToastTimer)
        saveToastTimer = null
    }
    stopEventsPolling()
    stopCatalogPolling()
})

const roomsById = computed(() => {
    const map = new Map()
    catalog.rooms.forEach((room) => {
        if (room?.id) map.set(room.id, room)
    })
    return map
})

const availableLamps = computed(() =>
    catalog.devices
        .filter((device) => isDimmableLamp(device))
        .map((device) => ({
            id: device.id,
            name: device.name || 'Лампа',
            roomId: device.room || '',
            roomName: roomsById.value.get(device.room)?.name || 'Без комнаты'
        }))
)

const groupedDeviceIds = computed(() => {
    const set = new Set()
    groupMembers.value.forEach((members) => members.forEach((id) => set.add(id)))
    return set
})

const availableDeviceIds = computed(() => new Set(availableLamps.value.map((device) => device.id)))
const availableDeviceMap = computed(() => {
    const map = new Map()
    availableLamps.value.forEach((device) => {
        if (device?.id) map.set(device.id, device)
    })
    return map
})
const catalogGroupsById = computed(() => {
    const map = new Map()
        ; (catalog.groups || []).forEach((group) => {
            if (group?.id) map.set(group.id, group)
        })
    return map
})
const groupMembers = computed(() => {
    const map = new Map()
    const validIds = availableDeviceIds.value
        ; (catalog.groups || []).forEach((group) => {
            if (!group?.id) return
            const members = (Array.isArray(group.devices) ? group.devices : []).filter((id) => validIds.has(id))
            if (members.length) map.set(group.id, members)
        })
    return map
})

function applyGroupMembersToDevices(deviceSet, groupIds) {
    if (!deviceSet || !groupIds) return false
    let added = false
    groupIds.forEach((groupId) => {
        const members = groupMembers.value.get(groupId) || []
        members.forEach((memberId) => {
            if (!deviceSet.has(memberId)) {
                deviceSet.add(memberId)
                added = true
            }
        })
    })
    return added
}

function sanitizeSelectionSets() {
    const validGroupIds = new Set(groupMembers.value.keys())
    const validDeviceIds = availableDeviceIds.value
    const nextGroups = new Set(Array.from(selectedGroupIds.value).filter((id) => validGroupIds.has(id)))
    const nextDevices = new Set(Array.from(selectedDevicesIds.value).filter((id) => validDeviceIds.has(id)))
    let changed = nextGroups.size !== selectedGroupIds.value.size || nextDevices.size !== selectedDevicesIds.value.size

    if (applyGroupMembersToDevices(nextDevices, nextGroups)) {
        changed = true
    }

    if (!selectionDirty.value && !nextGroups.size && !nextDevices.size && availableLamps.value.length) {
        const defaults = availableLamps.value.slice(0, 2).map((item) => item.id)
        defaults.forEach((id) => nextDevices.add(id))
        changed = true
    }

    if (changed) {
        selectedGroupIds.value = nextGroups
        selectedDevicesIds.value = nextDevices
        if (!selectionDirty.value && baselineComparable.value) {
            markBaseline()
        }
    }
}

watch([groupMembers, availableDeviceIds], () => {
    sanitizeSelectionSets()
}, { immediate: true })

function isDimmableLamp(device) {
    return (
        isTargetDevice(device) &&
        (hasBrightnessCapability(device) || supportsColorCapability(device)) &&
        /light|lamp|bulb|strip|ламп|свет/i.test(
            [device.type, device.kind, device.icon, device.name].map((value) => value || '').join(' ')
        )
    )
}

const selectedTargetsLabel = computed(() => {
    const parts = []
    const groupDeviceIds = new Set()
    selectedGroupIds.value.forEach((groupId) => {
        const group = catalogGroupsById.value.get(groupId)
        parts.push(group?.name || 'Группа без имени')
            ; (groupMembers.value.get(groupId) || []).forEach((deviceId) => {
                groupDeviceIds.add(deviceId)
            })
    })
    selectedDevicesIds.value.forEach((deviceId) => {
        if (groupDeviceIds.has(deviceId)) return
        const device = availableDeviceMap.value.get(deviceId)
        parts.push(device?.name || 'Лампа')
    })
    if (!parts.length) return 'Нет выбранных ламп'
    if (parts.length <= 2) return parts.join(', ')
    return `${parts.slice(0, 2).join(', ')} +${parts.length - 2}`
})

const deviceSections = computed(() => {
    const sectionMap = new Map()
    const roomOrder = new Map()
    catalog.rooms.forEach((room, index) => {
        if (room?.id) roomOrder.set(room.id, index)
    })

    const ensureSection = (key, name) => {
        if (!sectionMap.has(key)) {
            sectionMap.set(key, {
                id: key,
                name: name || 'Без комнаты',
                groups: [],
                devices: [],
                order: roomOrder.get(key) ?? Number.MAX_SAFE_INTEGER
            })
        }
        const section = sectionMap.get(key)
        if (name && !section.name) section.name = name
        return section
    }

        ; (catalog.groups || []).forEach((group) => {
            if (!group?.id) return
            const members = (groupMembers.value.get(group.id) || [])
                .map((id) => availableDeviceMap.value.get(id))
                .filter(Boolean)
            if (!members.length) return
            const roomIds = Array.from(new Set(members.map((device) => device.roomId).filter(Boolean)))
            let sectionKey = ''
            let sectionName = ''
            if (roomIds.length === 1) {
                sectionKey = roomIds[0]
                sectionName = members[0]?.roomName || roomsById.value.get(sectionKey)?.name || 'Без комнаты'
            } else {
                sectionKey = `__group-${group.id}`
                sectionName = 'Разные комнаты'
            }
            const section = ensureSection(sectionKey, sectionName)
            section.groups.push({
                id: group.id,
                name: group.name || 'Группа без имени',
                devices: members.map((device) => ({ id: device.id, name: device.name || 'Лампа' }))
            })
        })

    availableLamps.value.forEach((device) => {
        if (groupedDeviceIds.value.has(device.id)) return
        const sectionKey = device.roomId || '__no-room__'
        const sectionName = device.roomName || 'Без комнаты'
        const section = ensureSection(sectionKey, sectionName)
        section.devices.push({ id: device.id, name: device.name || 'Лампа' })
    })

    const list = Array.from(sectionMap.values()).filter((section) => section.groups.length || section.devices.length)
    list.forEach((section) => {
        section.groups.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))
        section.devices.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'))
    })

    list.sort((a, b) => {
        if (a.order !== b.order) return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        return (a.name || '').localeCompare(b.name || '', 'ru')
    })
    return list
})

const deviceSelectionDraftGroups = ref(new Set())
const deviceSelectionDraftDevices = ref(new Set())
const activeModal = ref(null)
const isDeviceSheetActive = computed(() => activeModal.value === 'devices')
const deviceSelectionForSheet = computed(() => ({
    groups: isDeviceSheetActive.value ? deviceSelectionDraftGroups.value : selectedGroupIds.value,
    devices: isDeviceSheetActive.value ? deviceSelectionDraftDevices.value : selectedDevicesIds.value
}))
const prioritizedDeviceSections = computed(() => {
    const selection = deviceSelectionForSheet.value
    const cloned = deviceSections.value.map((section) => ({
        ...section,
        groups: section.groups.map((group) => ({ ...group })),
        devices: section.devices.map((device) => ({ ...device }))
    }))

    const hasSelection = (section) =>
        section.groups.some((group) => selection.groups.has(group.id)) ||
        section.devices.some((device) => selection.devices.has(device.id))

    cloned.forEach((section) => {
        section.groups.sort((a, b) => {
            const aPriority = selection.groups.has(a.id) ? 0 : 1
            const bPriority = selection.groups.has(b.id) ? 0 : 1
            if (aPriority !== bPriority) return aPriority - bPriority
            return (a.name || '').localeCompare(b.name || '', 'ru')
        })
        section.devices.sort((a, b) => {
            const aPriority = selection.devices.has(a.id) ? 0 : 1
            const bPriority = selection.devices.has(b.id) ? 0 : 1
            if (aPriority !== bPriority) return aPriority - bPriority
            return (a.name || '').localeCompare(b.name || '', 'ru')
        })
    })

    cloned.sort((a, b) => {
        const aPriority = hasSelection(a) ? 0 : 1
        const bPriority = hasSelection(b) ? 0 : 1
        if (aPriority !== bPriority) return aPriority - bPriority
        if (a.order !== b.order) return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        return (a.name || '').localeCompare(b.name || '', 'ru')
    })
    return cloned
})

const deviceSheetSections = ref(prioritizedDeviceSections.value)
const prioritizeSelectionOnNextOpen = ref(true)
watch(
    () => activeModal.value,
    (next, prev) => {
        if (next === 'devices') {
            deviceSelectionDraftGroups.value = new Set(selectedGroupIds.value)
            deviceSelectionDraftDevices.value = new Set(selectedDevicesIds.value)
            deviceSheetSections.value = prioritizeSelectionOnNextOpen.value
                ? prioritizedDeviceSections.value
                : deviceSections.value
            prioritizeSelectionOnNextOpen.value = false
        }
        if (next === 'schedule') {
            resetScheduleDrafts()
        }
        if (prev === 'devices') {
            prioritizeSelectionOnNextOpen.value = true
        }
    }
)
const shouldPollCatalogActive = computed(
    () => shouldPollCatalog.value && isDeviceSheetActive.value
)

watch(shouldPollEvents, (enabled) => {
    if (enabled) {
        startEventsPolling()
    } else {
        stopEventsPolling()
    }
}, { immediate: true })

watch(shouldPollCatalogActive, (enabled) => {
    if (enabled) {
        startCatalogPolling()
    } else {
        stopCatalogPolling()
    }
}, { immediate: true })
const modalPayload = ref(null)
const stopStateSheetRef = ref(null)
const stopStateSheetTitle = computed(() =>
    modalPayload.value === 'end' ? 'Конец сценария' : 'Начало сценария'
)

function openModal(type, payload = null) {
    activeModal.value = type
    modalPayload.value = payload
}

function closeModal() {
    activeModal.value = null
    modalPayload.value = null
}

const currentStopForModal = computed(() => {
    if (modalPayload.value === 'start') return startStop
    if (modalPayload.value === 'end') return endStop
    return null
})

function handleStopStateApply() {
    stopStateSheetRef.value?.applyChanges()
    closeModal()
}

const SENSOR_MAX_LIMIT = 100000

function toFiniteNumber(value) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
}

function findIlluminationProperty(device) {
    const props = Array.isArray(device?.properties) ? device.properties : []
    return props.find((prop) => {
        const instance = String(prop?.parameters?.instance || prop?.state?.instance || '').toLowerCase()
        return instance.includes('illumination') || instance.includes('lux')
    })
}

function deriveSensorBounds(device) {
    const property = findIlluminationProperty(device)
    if (!property) return { minValue: null, maxValue: null }
    const range = property?.parameters?.range || property?.parameters?.bounds || {}
    const minCandidate = toFiniteNumber(range.min ?? property?.parameters?.min ?? property?.state?.min)
    const maxCandidate = toFiniteNumber(range.max ?? property?.parameters?.max ?? property?.state?.max)
    const cappedMin = Number.isFinite(minCandidate)
        ? Math.min(Math.max(0, minCandidate), SENSOR_MAX_LIMIT - 1)
        : null
    let cappedMax = Number.isFinite(maxCandidate)
        ? Math.max(0, Math.min(maxCandidate, SENSOR_MAX_LIMIT))
        : null
    if (cappedMin != null && cappedMax != null && cappedMax <= cappedMin) {
        cappedMax = Math.min(SENSOR_MAX_LIMIT, cappedMin + 1)
    }
    return {
        minValue: cappedMin,
        maxValue: cappedMax
    }
}

function looksLikeSensor(device) {
    if (findIlluminationProperty(device)) return true
    const payload = JSON.stringify(device || {})
    return /sensor|датчик|illumination|lux/i.test(payload)
}

function deriveSensorCurrentLux(device) {
    const property = findIlluminationProperty(device)
    if (!property) return null
    const candidate = toFiniteNumber(
        property?.state?.value ??
        property?.state?.val ??
        property?.state?.current ??
        property?.state?.lux ??
        property?.state?.illumination
    )
    if (!Number.isFinite(candidate)) return null
    return Math.max(0, Math.round(candidate))
}

const sensorOptions = computed(() =>
    catalog.devices
        .filter((device) => Boolean(findIlluminationProperty(device)))
        .map((device) => {
            const bounds = deriveSensorBounds(device)
            const minValue = bounds.minValue ?? 1
            const maxValue = bounds.maxValue ?? SENSOR_MAX_LIMIT
            return {
                id: device.id,
                name: device.name || 'Датчик',
                maxValue,
                minValue,
                currentLux: deriveSensorCurrentLux(device)
            }
        })
)

watch(
    sensorOptions,
    (list) => {
        if (!autoBrightness.enabled) return
        if (autoBrightness.sensorId && list.some((item) => item.id === autoBrightness.sensorId)) return
        autoBrightness.sensorId = list[0]?.id || ''
    },
    { immediate: true }
)

async function handleSave() {
    await saveScenario()
}

async function handleDelete() {
    await deleteScenario()
}

const pausing = ref(false)
const runtimePaused = computed(() => !!scenarioPauseInfo.value)

async function toggleRuntimePause() {
    if (!canControlRuntime.value) return
    if (scenario.disabled || scenarioDisplayStatus.value === 'off') {
        scenarioError.value = 'Сценарий отключен — включите его, чтобы управлять паузой'
        return
    }
    if (pausing.value) return
    pausing.value = true
    scenarioError.value = ''
    scenarioMessage.value = ''
    try {
        if (runtimePaused.value) {
            const res = await scenarioRequest('/scenario/resume', { method: 'POST', body: { id: scenario.id } })
            scenarioPauseInfo.value = res?.result?.pause ?? res?.pause ?? null
            if (res?.status) scenarioStatusSummary.value = summarizeStatusRecord(res.status)
            const pauseReason = res?.result?.reason
            scenarioMessage.value = (pauseReason === 'app_button_pause' || pauseReason === 'autopause')
                ? 'Сценарий по-прежнему на паузе'
                : 'Пауза снята'
        } else {
            const res = await scenarioRequest('/scenario/pause', { method: 'POST', body: { id: scenario.id } })
            scenarioPauseInfo.value =
                res?.pause ?? res?.result?.pause ?? { setAt: Date.now(), reason: { source: 'app_button_pause' } }
            if (res?.status) scenarioStatusSummary.value = summarizeStatusRecord(res.status)
            scenarioMessage.value = 'Сценарий поставлен на паузу'
        }
    } catch (err) {
        scenarioError.value = err?.message || 'Не удалось изменить паузу'
    } finally {
        pausing.value = false
    }
}

function handleResumeFromDial() {
    if (!canControlRuntime.value) return
    if (!runtimePaused.value) return
    toggleRuntimePause()
}
</script>

<template>
    <main class="scenario-dial-page" :class="{ 'scenario-disabled': scenarioDisabled }">
        <div v-if="scenarioLoading" class="scenario-loading">
            <div class="scenario-loading-card" role="status" aria-live="polite">
                <span class="scenario-loading-spinner" aria-hidden="true"></span>
                <p>Загружаем сценарий…</p>
            </div>
        </div>
        <template v-else>
            <div class="title-row">
                <div class="scenario-name-wrap">
                    <input v-if="editingName" ref="nameInputRef" v-model="scenarioNameValue" maxlength="30"
                        class="scenario-name-input" type="text" placeholder="Название сценария"
                        @blur="finishEditingName" @keyup.enter="finishEditingName" />
                    <button v-else :class="['scenario-name-display', { placeholder: !scenarioNameValue }]" type="button"
                        @click="editingName = true">
                        {{ scenarioNameUiLabel }}
                    </button>
                </div>
                <div class="status-text" :style="{ color: scenarioStatusColor }">
                    <span>{{ isCreateMode ? 'Новый сценарий (не сохранен)' : scenarioStatusText }}</span>
                </div>
                <div class="status-actions">
                    <button v-if="canControlRuntime && (runtimePaused || scenarioRuntimeStatus?.kind === 'running')"
                        type="button" class="status-icon-btn" :title="runtimePaused ? 'Возобновить' : 'Пауза'"
                        @click="toggleRuntimePause" :disabled="scenarioDisplayStatus === 'off' || pausing">
                        <span v-if="runtimePaused">▶</span>
                        <span v-else>⏸</span>
                    </button>
                    <button type="button" class="status-icon-btn power" :disabled="powerToggling"
                        :title="scenarioDisplayStatus === 'off' ? 'Включить' : 'Выключить'"
                        @click="toggleScenarioPower">
                        <span>{{ scenarioDisplayStatus === 'off' ? '⏻' : '⏼' }}</span>
                    </button>
                </div>
            </div>

            <div class="dial-layout">
                <div class="dial-column">
                    <div class="dial-card">
                        <ScenarioDialCircle :start-stop="startStop" :end-stop="endStop"
                            :auto-brightness="autoBrightnessActive" :current-status-label="scenarioStatusLabel"
                            :scenario-status="scenarioDialStatus" :sunrise-minute="sunriseTime"
                            :sunset-minute="sunsetTime" :dial-face-ratio="dialFaceRatio"
                            :current-minute="currentWorldMinute" :scenario-segment-radius="130"
                            :current-state="dialCurrentState" :overlaps="scenarioOverlaps"
                            :overlap-names="overlapNameMap" :time-zone="scenario.time?.tz"
                            @update:start-stop="handleStartStopUpdate" @update:end-stop="handleEndStopUpdate"
                            @change="handleDialChange" @open-start-editor="openModal('state', 'start')"
                            @open-end-editor="openModal('state', 'end')" @resume="handleResumeFromDial" />
                    </div>
                </div>
                <div class="settings-column">
                    <section class="compact-section">
                        <StopPreviewList :start-summary="startStateSummary" :end-summary="endStateSummary"
                            :auto-brightness-active="autoBrightnessActive" @open-start="openModal('state', 'start')"
                            @open-end="openModal('state', 'end')" />

                        <TargetDevicesCard :loading="catalogLoading" :error="catalogError"
                            :summary="selectedTargetsLabel" @open="openModal('devices')" />

                        <RunScheduleCard :summary="scheduleSummary" @open="openModal('schedule')" />
                    </section>

                    <div class="scenario-feedback">
                        <p v-if="scenarioError" class="status-info error">{{ scenarioError }}</p>
                        <button v-if="scenario.id" type="button" class="scenario-delete-text" @click="handleDelete">
                            Удалить сценарий
                        </button>
                    </div>

                    <ScenarioActionsFooter v-if="hasUnsavedChanges || scenarioSaving" class="scenario-actions-footer"
                        :create-mode="isCreateMode" :saving="scenarioSaving" :dirty="hasUnsavedChanges"
                        @save="handleSave" @cancel="handleCancel" />
                </div>
            </div>

            <section class="scenario-history-section">
                <ScenarioHistoryChart :events="scenarioHistoryEvents" :default-color="historyDefaultColor" />
                <p v-if="eventsError" class="scenario-history-error">{{ eventsError }}</p>
                <p v-else-if="eventsLoading && !scenarioHistoryEvents.length" class="scenario-history-loading">
                    Загружаем историю событий…
                </p>
            </section>

            <ScenarioSheet :open="activeModal === 'state'" v-if="currentStopForModal" :title="stopStateSheetTitle"
                @close="closeModal" @apply="handleStopStateApply">
                <StopStateSheet ref="stopStateSheetRef" :open="activeModal === 'state'" :stop="currentStopForModal"
                    :palette="colorPalette" :time="scenario.time" :context="modalPayload === 'start' ? 'start' : 'end'"
                    :auto-brightness="autoBrightness" :sensor-options="sensorOptions"
                    @update:stop="handleStopModalUpdate" @update:autoBrightness="handleAutoBrightnessUpdate" />
            </ScenarioSheet>

            <ScenarioSheet :open="activeModal === 'devices'" title="Выбор устройств" @close="closeModal"
                @apply="applyDeviceSelectionChanges">
                <DeviceSelectorSheet :sections="deviceSheetSections" :selected-ids="deviceSelectionForSheet.devices"
                    :selected-groups="deviceSelectionForSheet.groups" @toggle-group="handleGroupToggle"
                    @toggle-device="handleDeviceToggle" />
            </ScenarioSheet>

            <ScenarioSheet :open="activeModal === 'schedule'" title="Запускать" @close="closeModal"
                @apply="applyScheduleChanges">
                <div class="weekday-picker">
                    <p>Дни запуска</p>
                    <div class="weekday-grid">
                        <button v-for="day in weekdayOptions" :key="day.value" type="button" class="weekday-btn"
                            :class="{ active: scheduleDraftDays.has(day.value) }"
                            @click="toggleScheduleDraftDay(day.value)">
                            {{ day.label }}
                        </button>
                    </div>
                </div>
                <div class="presence-inline-controls">
                    <div class="presence-inline-header">
                        <span>Когда запускать</span>
                    </div>
                    <SegmentedControl aria-label="Режим присутствия" dense :model-value="scheduleDraftPresence"
                        :options="presenceOptions.map((option) => ({ value: option.id, label: option.label, disabled: option.disabled, warning: option.warning, tooltip: option.tooltip }))"
                        @update:model-value="setScheduleDraftPresence" />
                </div>
            </ScenarioSheet>

            <div v-if="saveToastMessage" :key="saveToastId" class="save-toast" role="status" aria-live="polite">
                {{ saveToastMessage }}
            </div>
        </template>
    </main>
</template>

<style scoped>
.scenario-dial-page {
    padding: 24px 16px 40px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    background: var(--bg-primary);
    min-height: 100vh;
    color: var(--text-primary);
    width: 100%;
    max-width: 1000px;
    margin: 0 auto;
}

.scenario-loading {
    min-height: 60vh;
    display: flex;
    align-items: center;
    justify-content: center;
}

.scenario-loading-card {
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 18px;
    padding: 18px 24px;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: var(--text-primary);
    font-weight: 600;
    box-shadow: 0 16px 30px rgba(2, 9, 25, 0.3);
}

.scenario-loading-spinner {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid rgba(148, 163, 184, 0.4);
    border-top-color: rgba(248, 250, 252, 0.9);
    animation: scenario-spin 0.8s linear infinite;
}

@keyframes scenario-spin {
    to {
        transform: rotate(360deg);
    }
}



.title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
}

.scenario-name-wrap {
    flex: 0 1 30ch;
    min-width: 220px;
    max-width: 30ch;
}

@media (max-width: 600px) {
    .title-row {
        display: grid;
        grid-template-columns: 1fr auto;
        grid-template-areas:
            'name actions'
            'status actions';
        align-items: start;
        column-gap: 12px;
        row-gap: 6px;
    }

    .scenario-name-wrap {
        grid-area: name;
        min-width: 0;
        max-width: none;
    }

    .status-text {
        grid-area: status;
    }

    .status-actions {
        grid-area: actions;
        align-self: center;
        justify-self: center;
    }

    .status-text strong {
        font-size: 13px;
    }

    .status-text {
        margin-left: 0;
    }
}

.scenario-name-input {
    width: 100%;
    border-radius: 12px;
    background: var(--surface-card);
    color: var(--text-primary);
    border: 1px solid rgba(148, 163, 184, 0.5);
    padding: 10px 14px;
    font-size: 16px;
    font-weight: 600;
}

.scenario-name-display {
    width: 100%;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    text-align: left;
    cursor: text;
    font-size: 16px;
    font-weight: 600;
    color: #f8fafc;
}

.scenario-name-display.placeholder {
    color: rgba(248, 250, 252, 0.5);
}

.status-text {
    font-size: 14px;
    line-height: 1.15;
}

.status-actions {
    display: flex;
    gap: 8px;
}

@media (min-width: 600px) {
    .status-text {
        margin-left: auto;
    }
}

.status-icon-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.4);
    color: #f8fafc;
    font-size: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.status-icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.status-icon-btn.power {
    font-size: 18px;
}

.dial-layout {
    display: flex;
    flex-direction: column;
    gap: 18px;
    transition: filter 0.25s ease, opacity 0.25s ease;
}

.scenario-dial-page.scenario-disabled .dial-layout {
    filter: grayscale(0.4) brightness(0.82);
    opacity: 0.88;
    pointer-events: none;
}

.dial-column {
    width: 100%;
    max-width: 500px;
}

.dial-card {
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 28px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-shadow: 0 20px 40px rgba(2, 9, 25, 0.35);
}

@media (max-width: 499px) {
    .dial-card {
        padding: 16px;
    }
}

.presence-inline-controls {
    margin-top: 24px;
    padding-top: 18px;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.presence-inline-header {
    font-size: 0.9rem;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.85);
}

.weekday-picker p {
    margin: 0 0 8px;
    font-weight: 600;
    font-size: 0.9rem;
}

.presence-inline-controls :deep(.segmented) {
    width: 100%;
}

.presence-inline-controls :deep(.segmented button) {
    white-space: nowrap;
    flex: 1 1 0;
    min-width: 0;
}

.scenario-history-section {
    width: 100%;
    min-width: 250px;
    max-width: 400px;
    gap: 8px;
}

.scenario-history-error,
.scenario-history-loading {
    margin: 0;
    font-size: 13px;
    text-align: center;
}

.scenario-history-error {
    color: #f87171;
}

.scenario-history-loading {
    color: rgba(226, 232, 240, 0.8);
}

.settings-column {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.compact-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.weekday-picker {
    margin: 0;
}

.weekday-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
}

.weekday-btn {
    border: none;
    background: transparent;
    color: var(--text-primary);
    border-radius: 999px;
    padding: 12px 0;
    font-weight: 600;
    font-size: 12px;
    transition: background var(--transition-base), color var(--transition-base);
}

.weekday-btn.active {
    background: rgba(168, 85, 247, 0.16);
    border-color: rgba(168, 85, 247, 0.4);
    color: var(--primary);
}

@media (min-width: 570px) {
    .dial-layout {
        flex-direction: row;
        align-items: stretch;
        gap: 16px;
    }

    .dial-column {
        flex: 0 1 500px;
        min-width: 250px;
        max-width: 400px;
    }

    .settings-column {
        flex: 1 1 auto;
        min-width: 250px;
    }

    .scenario-actions-footer {
        margin-top: auto;
    }
}


.status-info {
    margin: 4px 0 0;
    font-size: 13px;
}

.status-info.success {
    color: #34d399;
}

.status-info.error {
    color: #f87171;
}

.scenario-delete-text {
    margin: 6px 0 0;
    font-size: 14px;
    color: rgba(248, 113, 113, 0.9);
    cursor: pointer;
    letter-spacing: normal;
    text-transform: none;
    background: transparent;
    border: none;
    padding: 0;
    display: block;
    width: 100%;
    text-align: center;
}

.scenario-delete-text:hover {
    color: #f87171;
}

.save-toast {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    background: #16a34a;
    color: #ffffff;
    padding: 12px 18px;
    border-radius: 14px;
    border: 1px solid rgba(22, 163, 74, 0.7);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
    font-size: 14px;
    font-weight: 600;
    animation: toast-pop 0.25s ease;
    z-index: 30;
}

@keyframes toast-pop {
    from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.98);
    }

    to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }
}
</style>
