<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getConfig } from '../lib/api'
import { computeEnvironment, createDefaultScenario, normalizeScenarioStruct } from '../utils/scenarioUtils'
import { trackFunctionCall } from '../lib/requestMetrics'
import {
    hasBrightnessCapability,
    supportsColorCapability,
    isTargetDevice
} from '../utils/deviceCapabilities'
import { lockColorUsage, lockColorMode, lockBrightnessUsage } from '../utils/stopStateRules'
import ScenarioDialCircle from '../components/dial/ScenarioDialCircle.vue'
import BottomSheet from '../components/dial/BottomSheet.vue'
import TargetDevicesCard from '../components/dial/TargetDevicesCard.vue'
import StopPreviewList from '../components/dial/StopPreviewList.vue'
import RunScheduleCard from '../components/dial/RunScheduleCard.vue'
import ScenarioActionsFooter from '../components/dial/ScenarioActionsFooter.vue'
import DeviceSelectorSheet from '../components/dial/DeviceSelectorSheet.vue'
import StopStateSheet from '../components/dial/StopStateSheet.vue'
import SegmentedControl from '../components/dial/SegmentedControl.vue'
import { useScenarioApi } from '../composables/useScenarioApi'
import {
    hexToHsv,
    hsvToHex,
    stopColorHex,
    temperatureToHex
} from '../utils/colorUtils'
import { summarizeStatusRecord, deriveScenarioListStatus } from '../utils/scenarioStatusDisplay'
import { setDocumentDescription, setDocumentTitle, SCENARIOS_TITLE } from '../utils/pageTitle'

const scenarioStatus = ref('running')
const scenarioDisplayStatus = computed(() => {
    if (scenarioStatus.value === 'off' || scenario.disabled) return 'off'
    return scenarioStatus.value
})
const scenarioStatusSummary = ref(null)
const scenarioPauseInfo = ref(null)
const route = useRoute()
const router = useRouter()
const routeScenarioId = computed(() => {
    const id = route.params.id
    return typeof id === 'string' ? id : ''
})
const isCreateMode = computed(() => route.name === 'scenario-create')
const scenarioApiReady = ref(false)

const presenceOptions = [
    { id: 'any', label: 'Всегда' },
    { id: 'home', label: 'Когда кто-то дома' }
]
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

const scenarioNameDisplay = computed(() => scenarioNameValue.value || 'Название сценария')

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
    if (!scenario.name) scenario.name = 'Новый сценарий'
}

function clampNumberLocal(value, min = 0, max = 100) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return min
    return Math.max(min, Math.min(max, numeric))
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
    return presenceOptions.find((option) => option.id === presenceMode.value)?.label || 'Всегда'
})

const scheduleSummary = computed(() => `${scheduleDaysSummary.value} · ${schedulePresenceSummary.value}`)

function toggleDay(value) {
    const current = new Set(selectedDays.value)
    if (current.has(value)) current.delete(value)
    else current.add(value)
    if (!current.size) current.add(value)
    const nextDays = Array.from(current).sort((a, b) => a - b)
    scenario.time = {
        ...(scenario.time || {}),
        days: nextDays
    }
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

const AUTO_BRIGHTNESS_DEFAULTS = {
    enabled: false,
    sensorId: '',
    luxMin: 30,
    luxMax: 350,
    brightnessMin: 15,
    brightnessMax: 85
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

function serializeStop(stop) {
    return {
        mode: stop.mode,
        clockMinutes: stop.clockMinutes,
        offset: stop.offset,
        colorMode: stop.colorMode,
        temperature: stop.temperature,
        colorHex: stop.colorHex,
        brightness: stop.brightness,
        useColor: stop.useColor,
        useBrightness: stop.useBrightness
    }
}

function applyStop(runStop, stored) {
    if (!stored) return
    runStop.mode = stored.mode || 'clock'
    runStop.clockMinutes = Number.isFinite(stored.clockMinutes) ? stored.clockMinutes : runStop.clockMinutes
    runStop.offset = Number.isFinite(stored.offset) ? stored.offset : runStop.offset
    runStop.colorMode = stored.colorMode || 'temperature'
    runStop.temperature = Number.isFinite(stored.temperature) ? stored.temperature : runStop.temperature
    runStop.colorHex = stored.colorHex || runStop.colorHex
    runStop.brightness = Number.isFinite(stored.brightness) ? stored.brightness : runStop.brightness
    runStop.useColor = stored.useColor ?? runStop.useColor
    runStop.useBrightness = stored.useBrightness ?? runStop.useBrightness
}

function handleStartStopUpdate(snapshot) {
    applyStop(startStop, snapshot)
}

function handleEndStopUpdate(snapshot) {
    applyStop(endStop, snapshot)
}

function handleDialChange(payload) {
    if (payload?.start) applyStop(startStop, payload.start)
    if (payload?.end) applyStop(endStop, payload.end)
}

function timeFromStop(stop) {
    if (stop.mode === 'clock') {
        return {
            type: 'clock',
            time: minutesToTimeString(stop.clockMinutes)
        }
    }
    return {
        type: 'sun',
        anchor: stop.mode,
        offsetMin: Number.isFinite(stop.offset) ? stop.offset : 0
    }
}

function applyStopsFromScenario() {
    const startSource = scenario.time?.start
    const endSource = scenario.time?.end
    if (startSource) updateStopFromTime(startStop, startSource)
    if (endSource) updateStopFromTime(endStop, endSource)
    hydrateStopsFromActions(scenario.actions || [])
}

function hydrateStopsFromActions(actions) {
    resetAutoBrightness()
    if (!Array.isArray(actions)) {
        startStop.useBrightness = false
        endStop.useBrightness = false
        startStop.useColor = false
        endStop.useColor = false
        return
    }
    const brightnessAction = actions.find((action) => action?.type?.includes('light.brightness'))
    if (brightnessAction?.source) {
        startStop.useBrightness = true
        endStop.useBrightness = true
        if (brightnessAction.source.type === 'sensorMap') {
            autoBrightness.enabled = true
            autoBrightness.sensorId = brightnessAction.source.sensorId || ''
            const luxMin = clampNumberLocal(brightnessAction.source.sensorMin ?? autoBrightness.luxMin, 0, autoBrightness.luxMax)
            const luxMax = clampNumberLocal(
                brightnessAction.source.sensorMax ?? autoBrightness.luxMax,
                Math.max(luxMin + 1, 1),
                100000
            )
            autoBrightness.luxMin = Math.min(luxMin, luxMax - 1)
            autoBrightness.luxMax = luxMax
            autoBrightness.brightnessMin = clampNumberLocal(
                brightnessAction.source.outputMin ?? autoBrightness.brightnessMin,
                0,
                autoBrightness.brightnessMax
            )
            autoBrightness.brightnessMax = clampNumberLocal(
                brightnessAction.source.outputMax ?? autoBrightness.brightnessMax,
                Math.max(autoBrightness.brightnessMin, 0),
                100
            )
        } else {
            autoBrightness.enabled = false
            if (brightnessAction.source.from != null) {
                startStop.brightness = clampNumberLocal(brightnessAction.source.from, 1, 100)
            }
            if (brightnessAction.source.to != null) {
                endStop.brightness = clampNumberLocal(brightnessAction.source.to, 1, 100)
            }
        }
    } else {
        startStop.useBrightness = false
        endStop.useBrightness = false
        autoBrightness.enabled = false
    }

    const colorAction = actions.find((action) => action?.type?.startsWith('light.color'))
    if (colorAction?.type === 'light.color.cct') {
        startStop.useColor = true
        endStop.useColor = true
        startStop.colorMode = 'temperature'
        endStop.colorMode = 'temperature'
        if (colorAction.source?.fromK) startStop.temperature = clampNumberLocal(colorAction.source.fromK, 1700, 6500)
        if (colorAction.source?.toK) endStop.temperature = clampNumberLocal(colorAction.source.toK, 1700, 6500)
        startStop.colorHex = temperatureToHex(startStop.temperature)
        endStop.colorHex = temperatureToHex(endStop.temperature)
    } else if (colorAction?.type?.includes('hsv')) {
        startStop.useColor = true
        endStop.useColor = true
        startStop.colorMode = 'rgb'
        endStop.colorMode = 'rgb'
        if (colorAction.source?.from) startStop.colorHex = hsvToHex(colorAction.source.from)
        if (colorAction.source?.to) endStop.colorHex = hsvToHex(colorAction.source.to)
    } else {
        startStop.useColor = false
        endStop.useColor = false
    }
}

function updateStopFromTime(stop, time) {
    if (!time) return
    if (time.type === 'clock' && typeof time.time === 'string') {
        const [hh, mm] = time.time.split(':').map((value) => Number(value))
        if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
            stop.mode = 'clock'
            stop.clockMinutes = hh * 60 + mm
            stop.offset = 0
            return
        }
    }
    if (time.anchor === 'sunrise' || time.anchor === 'sunset') {
        stop.mode = time.anchor
        stop.offset = Number.isFinite(time.offsetMin) ? time.offsetMin : 0
    }
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

function syncSelectedDevicesFromSources(force = false) {
    if (!force && selectionDirty.value) return
    const resolved = resolveScenarioSelection()
    selectedGroupIds.value = new Set(resolved.groups)
    selectedDevicesIds.value = new Set(resolved.devices)
    sanitizeSelectionSets()
}

function handleGroupToggle(group, checked) {
    const groupId = typeof group === 'object' ? group.id : group
    if (!groupId) return
    const groupSet = new Set(selectedGroupIds.value)
    const deviceSet = new Set(selectedDevicesIds.value)
    const members = groupMembers.value.get(groupId) || []
    if (checked) {
        groupSet.add(groupId)
        members.forEach((memberId) => deviceSet.add(memberId))
    } else {
        groupSet.delete(groupId)
        members.forEach((memberId) => deviceSet.delete(memberId))
    }
    selectedGroupIds.value = groupSet
    selectedDevicesIds.value = deviceSet
    sanitizeSelectionSets()
    selectionDirty.value = true
}

function handleDeviceToggle(payload, checked) {
    const device = payload?.device
    if (!device?.id) return
    const deviceSet = new Set(selectedDevicesIds.value)
    const groupSet = new Set(selectedGroupIds.value)
    if (checked) deviceSet.add(device.id)
    else deviceSet.delete(device.id)
    if (payload.group?.id) {
        const members = groupMembers.value.get(payload.group.id) || []
        const allSelected = members.every((memberId) => memberId === device.id ? checked : deviceSet.has(memberId))
        if (allSelected) groupSet.add(payload.group.id)
        else groupSet.delete(payload.group.id)
    }
    selectedDevicesIds.value = deviceSet
    selectedGroupIds.value = groupSet
    selectionDirty.value = true
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

function toggleScenarioPause() {
    if (scenarioDisplayStatus.value === 'off') {
        scenarioStatus.value = 'running'
        return
    }
    scenarioStatus.value = scenarioDisplayStatus.value === 'paused' ? 'running' : 'paused'
}

function toggleScenarioPower() {
    scenarioStatus.value = scenarioDisplayStatus.value === 'off' ? 'running' : 'off'
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
    return 'running'
})

const dialFaceRatio = 0.74
const autoBrightnessActive = computed(
    () => autoBrightness.enabled && (startStop.useBrightness || endStop.useBrightness)
)
function minutesToTimeString(minute) {
    const value = ((minute % 1440) + 1440) % 1440
    const hours = Math.floor(value / 60)
    const mins = value % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

const startStateSummary = computed(() => summarizeStopState(startStop))
const endStateSummary = computed(() => summarizeStopState(endStop))

function summarizeStopState(stop) {
    const hasColor = !!stop.useColor
    let colorHex = stopColorHex(stop)
    if (autoBrightness.enabled && hasColor) {
        const baseColor =
            stop.colorMode === 'rgb' ? (stop.colorHex || colorHex) : temperatureToHex(stop.temperature)
        colorHex = baseColor
    }
    const values = []
    if (hasColor && stop.colorMode === 'temperature') values.push(`${stop.temperature}K`)
    if (stop.useBrightness) values.push(autoBrightness.enabled ? 'Автояркость' : `${Math.round(stop.brightness)}%`)
    return {
        colorHex,
        values,
        hasColor,
        hasBrightness: !!stop.useBrightness,
        brightness: Number.isFinite(stop.brightness) ? stop.brightness : 0,
        temperature: Number.isFinite(stop.temperature) ? stop.temperature : 0,
        colorMode: stop.colorMode === 'rgb' ? 'rgb' : 'temperature',
        placeholder: hasColor || stop.useBrightness ? '' : 'Не меняем'
    }
}

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
const catalogLoading = ref(false)
const catalogError = ref('')
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

async function loadConfig() {
    try {
        const raw = await getConfig()
        const apiBase =
            raw.api || raw.apiBase || raw.scenariosUrl || raw.scenariosURL || raw.scenariosBase || raw.scenarioUrl || ''
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

function buildScenarioPayload() {
    const payload = JSON.parse(JSON.stringify(scenario))
    payload.name = payload.name || 'Сценарий с кругом'
    payload.target = payload.target || {}
    payload.target.groups = Array.from(selectedGroupIds.value)
    payload.target.devices = Array.from(selectedDevicesIds.value)
    payload.time = payload.time || {}
    payload.time.start = timeFromStop(startStop)
    payload.time.end = timeFromStop(endStop)
    payload.actions = buildScenarioActions()
    const scenarioType = typeof payload.type === 'string' ? payload.type : ''
    const isAutoLightScenario = /auto-light/i.test(scenarioType)
    if (isAutoLightScenario) {
        payload.autoLight = payload.autoLight || {}
        payload.autoLight.state = {
            startStop: serializeStop(startStop),
            endStop: serializeStop(endStop),
            time: {
                start: payload.time.start,
                end: payload.time.end
            },
            selectedDevices: Array.from(selectedDevicesIds.value),
            autoBrightness: {
                enabled: !!autoBrightness.enabled,
                sensorId: autoBrightness.sensorId || '',
                luxMin: autoBrightness.luxMin,
                luxMax: autoBrightness.luxMax,
                brightnessMin: autoBrightness.brightnessMin,
                brightnessMax: autoBrightness.brightnessMax
            }
        }
        if (autoBrightness.sensorId) payload.autoLight.sensorId = autoBrightness.sensorId
    } else {
        delete payload.autoLight
    }
    payload.runtime = payload.runtime || {}
    payload.runtime.presence = presenceMode.value === 'home' ? 'onlyWhenHome' : 'always'
    payload.disabled = scenarioStatus.value === 'off'
    return payload
}

function buildScenarioActions() {
    const preserved = Array.isArray(scenario.actions)
        ? scenario.actions.filter(
            (action) => !['light.brightness', 'light.color.cct', 'light.color.hsv'].includes(action?.type)
        )
        : []
    const actions = []
    const brightnessAction = buildBrightnessAction()
    if (brightnessAction) actions.push(brightnessAction)
    const colorAction = buildColorAction()
    if (colorAction) actions.push(colorAction)
    return preserved.concat(actions)
}

function buildBrightnessAction() {
    if (!startStop.useBrightness && !endStop.useBrightness) return null
    if (autoBrightness.enabled) {
        const sensorMin = clampNumberLocal(autoBrightness.luxMin, 0, autoBrightness.luxMax)
        const sensorMax = Math.max(sensorMin + 1, clampNumberLocal(autoBrightness.luxMax, sensorMin + 1, 100000))
        return {
            type: 'light.brightness',
            source: {
                type: 'sensorMap',
                sensorId: autoBrightness.sensorId || '',
                sensorMin,
                sensorMax,
                outputMin: clampNumberLocal(autoBrightness.brightnessMin, 0, 100),
                outputMax: clampNumberLocal(autoBrightness.brightnessMax, 0, 100)
            }
        }
    }
    const from = clampNumberLocal(startStop.brightness ?? endStop.brightness ?? 0, 1, 100)
    const to = clampNumberLocal(endStop.brightness ?? startStop.brightness ?? from, 1, 100)
    return {
        type: 'light.brightness',
        source: {
            type: 'manualRamp',
            from,
            to
        }
    }
}

function buildColorAction() {
    if (!startStop.useColor || !endStop.useColor) return null
    if (startStop.colorMode === 'temperature' && endStop.colorMode === 'temperature') {
        return {
            type: 'light.color.cct',
            applyOnlyIfOn: true,
            source: {
                type: 'manualRamp',
                fromK: clampNumberLocal(startStop.temperature, 1700, 6500),
                toK: clampNumberLocal(endStop.temperature, 1700, 6500)
            }
        }
    }
    return {
        type: 'light.color.hsv',
        applyOnlyIfOn: true,
        source: {
            type: 'manualRamp',
            from: hexToHsv(startStop.colorHex),
            to: hexToHsv(endStop.colorHex)
        }
    }
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
    applyStopsFromScenario()
    syncSelectedDevicesFromSources(true)
}

async function loadScenarioById(id) {
    if (!scenarioApiReady.value) return
    if (!id) {
        resetScenarioState()
        return
    }
    scenarioError.value = ''
    try {
        const response = await scenarioRequest(`/scenario?id=${encodeURIComponent(id)}`)
        const data = response?.scenario
        if (!data) {
            resetScenarioState()
            return
        }
        Object.assign(scenario, createDefaultScenario(), data)
        normalizeScenarioStruct(scenario)
        scenario.id = data.id || ''
        scenario.name = data.name || ''
        scenarioPauseInfo.value = response?.pause || null
        scenarioStatusSummary.value = summarizeStatusRecord(response?.statusSummary || response?.status || null)
        presenceMode.value = scenario.runtime?.presence === 'onlyWhenHome' ? 'home' : 'any'
        scenarioStatus.value = scenario.disabled ? 'off' : 'running'
        captureSelectionSourcesFromScenario()
        selectionDirty.value = false
        applyStopsFromScenario()
        syncSelectedDevicesFromSources(true)
        editingName.value = false
    } catch (err) {
        console.error('Failed to load scenario', err)
        scenarioError.value = err?.message || 'Не удалось загрузить сценарий'
    }
}

async function saveScenario() {
    scenarioSaving.value = true
    scenarioError.value = ''
    scenarioMessage.value = ''
    try {
        const payload = buildScenarioPayload()
        console.info('[ScenarioView] sending scenario payload', payload)
        const response = await scenarioRequest('/save', { method: 'POST', body: { scenario: payload } })
        if (response?.scenario) {
            Object.assign(scenario, createDefaultScenario(), response.scenario)
            normalizeScenarioStruct(scenario)
            scenario.id = response.scenario.id || scenario.id
            scenario.name = response.scenario.name || scenario.name
            captureSelectionSourcesFromScenario()
        }
        scenarioStatus.value = scenario.disabled ? 'off' : 'running'
        applyStopsFromScenario()
        if (!selectionDirty.value) syncSelectedDevicesFromSources(false)
        scenarioMessage.value = 'Сценарий сохранен'
        editingName.value = false
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

async function deleteScenario() {
    if (!scenario.id) return
    try {
        await scenarioRequest('/delete', { method: 'POST', body: { id: scenario.id } })
        scenarioMessage.value = 'Сценарий удалён'
        resetScenarioState()
        router.replace({ name: 'scenarios-list' })
    } catch (err) {
        console.error('Failed to delete scenario', err)
        scenarioError.value = err?.message || 'Не удалось удалить сценарий'
    }
}

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
    } catch (err) {
        console.warn('Scenario config failed', err)
    }
    timeTickerInterval = setInterval(() => {
        timeTicker.value = Date.now()
    }, 30 * 1000)
})

onUnmounted(() => {
    if (timeTickerInterval) {
        clearInterval(timeTickerInterval)
        timeTickerInterval = null
    }
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
    const hasSelection = (section) =>
        section.groups.some((group) => selectedGroupIds.value.has(group.id)) ||
        section.devices.some((device) => selectedDevicesIds.value.has(device.id))

    list.forEach((section) => {
        section.groups.sort((a, b) => {
            const aPriority = selectedGroupIds.value.has(a.id) ? 0 : 1
            const bPriority = selectedGroupIds.value.has(b.id) ? 0 : 1
            if (aPriority !== bPriority) return aPriority - bPriority
            return a.name.localeCompare(b.name, 'ru')
        })
        section.devices.sort((a, b) => {
            const aPriority = selectedDevicesIds.value.has(a.id) ? 0 : 1
            const bPriority = selectedDevicesIds.value.has(b.id) ? 0 : 1
            if (aPriority !== bPriority) return aPriority - bPriority
            return a.name.localeCompare(b.name, 'ru')
        })
    })

    list.sort((a, b) => {
        const aPriority = hasSelection(a) ? 0 : 1
        const bPriority = hasSelection(b) ? 0 : 1
        if (aPriority !== bPriority) return aPriority - bPriority
        if (a.order !== b.order) return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
        return a.name.localeCompare(b.name, 'ru')
    })
    return list
})

const activeModal = ref(null)
const modalPayload = ref(null)

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
</script>

<template>
    <main class="scenario-dial-page">
        <div class="title-row">
            <div class="scenario-name-wrap">
                <input v-if="editingName" ref="nameInputRef" v-model="scenarioNameValue" maxlength="30"
                    class="scenario-name-input" type="text" placeholder="Название сценария" @blur="finishEditingName"
                    @keyup.enter="finishEditingName" />
                <button v-else :class="['scenario-name-display', { placeholder: !scenarioNameValue }]" type="button"
                    @click="editingName = true">
                    {{ scenarioNameDisplay }}
                </button>
            </div>
            <div class="status-text" :style="{ color: scenarioStatusColor }">
                <span>{{ scenarioStatusText }}</span>
            </div>
            <div class="status-actions">
                <button type="button" class="status-icon-btn"
                    :title="scenarioDisplayStatus === 'paused' ? 'Возобновить' : 'Пауза'" @click="toggleScenarioPause"
                    :disabled="scenarioDisplayStatus === 'off'">
                    <span v-if="scenarioDisplayStatus === 'paused'">▶</span>
                    <span v-else>⏸</span>
                </button>
                <button type="button" class="status-icon-btn power"
                    :title="scenarioDisplayStatus === 'off' ? 'Включить' : 'Выключить'" @click="toggleScenarioPower">
                    <span>{{ scenarioDisplayStatus === 'off' ? '⏻' : '⏼' }}</span>
                </button>
            </div>
        </div>

        <div class="dial-layout">
            <div class="dial-column">
                <div class="dial-card">
                    <ScenarioDialCircle :start-stop="startStop" :end-stop="endStop"
                        :auto-brightness="autoBrightnessActive" :current-status-label="scenarioStatusLabel"
                        :scenario-status="scenarioDialStatus" :sunrise-minute="sunriseTime" :sunset-minute="sunsetTime"
                        :dial-face-ratio="dialFaceRatio" :current-minute="currentWorldMinute"
                        :scenario-segment-radius="130" @update:start-stop="handleStartStopUpdate"
                        @update:end-stop="handleEndStopUpdate" @change="handleDialChange"
                        @open-start-editor="openModal('state', 'start')" @open-end-editor="openModal('state', 'end')"
                        @resume="scenarioStatus = 'running'" />
                </div>
            </div>
            <div class="settings-column">
                <section class="compact-section">
                    <StopPreviewList :start-summary="startStateSummary" :end-summary="endStateSummary"
                        :auto-brightness-active="autoBrightnessActive" @open-start="openModal('state', 'start')"
                        @open-end="openModal('state', 'end')" />

                    <TargetDevicesCard :loading="catalogLoading" :error="catalogError" :summary="selectedTargetsLabel"
                        @open="openModal('devices')" />

                    <RunScheduleCard :summary="scheduleSummary" @open="openModal('schedule')" />
                </section>

                <div class="scenario-feedback">
                    <p v-if="scenarioMessage" class="status-info success">{{ scenarioMessage }}</p>
                    <p v-if="scenarioError" class="status-info error">{{ scenarioError }}</p>
                </div>

                <ScenarioActionsFooter class="scenario-actions-footer" @save="handleSave" @delete="handleDelete" />
            </div>
        </div>

        <StopStateSheet :open="activeModal === 'state'" v-if="currentStopForModal" :stop="currentStopForModal"
            :palette="colorPalette" :time="scenario.time" :context="modalPayload === 'start' ? 'start' : 'end'"
            :auto-brightness="autoBrightness" :sensor-options="sensorOptions" @close="closeModal" />

        <BottomSheet :open="activeModal === 'devices'" title="Выбор устройств" @close="closeModal">
            <DeviceSelectorSheet :sections="deviceSections" :selected-ids="selectedDevicesIds"
                :selected-groups="selectedGroupIds" @toggle-group="handleGroupToggle"
                @toggle-device="handleDeviceToggle" />
        </BottomSheet>

        <BottomSheet :open="activeModal === 'schedule'" title="Запускать" @close="closeModal">
            <div class="weekday-picker">
                <p>Дни запуска</p>
                <div class="weekday-grid">
                    <button v-for="day in weekdayOptions" :key="day.value" type="button" class="weekday-btn"
                        :class="{ active: selectedDays.includes(day.value) }" @click="toggleDay(day.value)">
                        {{ day.label }}
                    </button>
                </div>
            </div>
            <div class="presence-inline-controls">
                <div class="presence-inline-header">
                    <span>Когда запускать</span>
                </div>
                <SegmentedControl aria-label="Режим присутствия" dense :model-value="presenceMode"
                    :options="presenceOptions.map((option) => ({ value: option.id, label: option.label }))"
                    @update:model-value="presenceMode = $event" />
            </div>
        </BottomSheet>
    </main>
</template>

<style scoped>
.scenario-dial-page {
    padding: 24px 24px 40px;
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
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 8px;
    }
}

.presence-inline-controls {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.presence-inline-header {
    font-size: 0.9rem;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.85);
}

.presence-inline-controls :deep(.segmented) {
    width: 100%;
}

.presence-inline-controls :deep(.segmented button) {
    white-space: nowrap;
}

.presence-inline-controls :deep(.segmented button:first-child) {
    flex: 1 1 auto;
    min-width: 0;
}

.presence-inline-controls :deep(.segmented button:last-child) {
    flex: 0 0 auto;
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

.weekday-picker p {
    margin: 0 0 8px;
    font-weight: 600;
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
</style>
