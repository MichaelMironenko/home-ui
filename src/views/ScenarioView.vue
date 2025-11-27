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
import TargetDevicesCard from '../components/dial/TargetDevicesCard.vue'
import StopPreviewList from '../components/dial/StopPreviewList.vue'
import PresenceFooter from '../components/dial/PresenceFooter.vue'
import DeviceSelectorSheet from '../components/dial/DeviceSelectorSheet.vue'
import StopStateSheet from '../components/dial/StopStateSheet.vue'
import { useScenarioApi } from '../composables/useScenarioApi'

const scenarioStatusOptions = [
    { id: 'running', label: 'Работает' },
    { id: 'paused', label: 'Пауза' },
    { id: 'off', label: 'Выкл.' }
]
const scenarioStatus = ref('running')
const remotePauseActive = computed(() => scenario.autoLight?.state?.status === 'PAUSE')
const scenarioDisplayStatus = computed(() => {
    if (scenarioStatus.value === 'off' || scenario.disabled) return 'off'
    if (remotePauseActive.value && scenarioStatus.value !== 'paused') return 'paused'
    return scenarioStatus.value
})
const scenarioStatusText = computed(
    () => scenarioStatusOptions.find((option) => option.id === scenarioDisplayStatus.value)?.label || ''
)
const scenarioStatusLabel = computed(() => (scenarioDisplayStatus.value === 'running' ? '' : scenarioStatusText.value))
const scenarioStatusColor = computed(() => {
    if (scenarioDisplayStatus.value === 'off') return '#94a3b8'
    if (scenarioDisplayStatus.value === 'paused') return '#facc15'
    return '#34d399'
})
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
const scenarioHasAutoState = ref(true)
const selectionDirty = ref(false)
const selectionSources = reactive({
    targetDevices: [],
    targetGroups: [],
    stateDevices: []
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
        scenario.name = value
        if (scenario.autoLight?.state) {
            scenario.autoLight.state.name = value
        }
    }
})

const scenarioNameDisplay = computed(() => scenarioNameValue.value || 'Название сценария')

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

function hsvToHex({ h = 0, s = 0, v = 0 }) {
    const saturation = clampNumberLocal(s, 0, 100) / 100
    const value = clampNumberLocal(v, 0, 100) / 100
    const chroma = value * saturation
    const hp = (clampNumberLocal(h, 0, 360) % 360) / 60
    const x = chroma * (1 - Math.abs((hp % 2) - 1))
    let r1 = 0
    let g1 = 0
    let b1 = 0
    if (hp >= 0 && hp < 1) [r1, g1, b1] = [chroma, x, 0]
    else if (hp < 2) [r1, g1, b1] = [x, chroma, 0]
    else if (hp < 3) [r1, g1, b1] = [0, chroma, x]
    else if (hp < 4) [r1, g1, b1] = [0, x, chroma]
    else if (hp < 5) [r1, g1, b1] = [x, 0, chroma]
    else[r1, g1, b1] = [chroma, 0, x]
    const m = value - chroma
    const r = Math.round((r1 + m) * 255)
    const g = Math.round((g1 + m) * 255)
    const b = Math.round((b1 + m) * 255)
    return `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`
}

const selectedDays = computed(() => {
    const days = scenario.time?.days
    if (Array.isArray(days) && days.length) return days
    return [1, 2, 3, 4, 5, 6, 7]
})

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
    if (scenario.autoLight?.state) {
        scenario.autoLight.state.time = {
            ...(scenario.autoLight.state.time || {}),
            start: timeFromStop(startStop),
            end: timeFromStop(endStop)
        }
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
        1,
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
    const hasState = Boolean(scenarioHasAutoState.value && scenario.autoLight?.state)
    const state = hasState ? scenario.autoLight.state : {}
    if (hasState && state.startStop) applyStop(startStop, state.startStop)
    if (hasState && state.endStop) applyStop(endStop, state.endStop)
    const startSource = hasState && state.time?.start ? state.time.start : scenario.time?.start
    const endSource = hasState && state.time?.end ? state.time.end : scenario.time?.end
    if (startSource) updateStopFromTime(startStop, startSource)
    if (endSource) updateStopFromTime(endStop, endSource)
    if (hasState) {
        if ('autoBrightness' in state) {
            if (!applyAutoBrightnessState(state.autoBrightness)) resetAutoBrightness()
        } else {
            resetAutoBrightness()
        }
    }
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
                1,
                autoBrightness.brightnessMax
            )
            autoBrightness.brightnessMax = clampNumberLocal(
                brightnessAction.source.outputMax ?? autoBrightness.brightnessMax,
                autoBrightness.brightnessMin,
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
    selectionSources.stateDevices = []
}

function captureSelectionSourcesFromScenario(source = scenario) {
    selectionSources.targetDevices = Array.isArray(source.target?.devices) ? [...source.target.devices] : []
    selectionSources.targetGroups = Array.isArray(source.target?.groups) ? [...source.target.groups] : []
    const stateDevices = source.autoLight?.state?.selectedDevices
    selectionSources.stateDevices = Array.isArray(stateDevices) ? [...stateDevices] : []
}

function resolveScenarioSelection() {
    const groupSet = new Set(selectionSources.targetGroups || [])
    const deviceSet = new Set(selectionSources.targetDevices || [])
        ; (selectionSources.stateDevices || []).forEach((id) => deviceSet.add(id))
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

const currentState = computed(() => {
    if (scenarioDisplayStatus.value !== 'running') return null
    const nowMinute = currentWorldMinute.value
    const startMin = stopMinutes(startStop)
    const endMin = stopMinutes(endStop)
    const totalSpan = minutesDiff(endMin, startMin) || 1
    let ratio = minutesDiff(nowMinute, startMin) / totalSpan
    ratio = Math.max(0, Math.min(1, ratio))
    const brightnessValue = startStop.brightness + (endStop.brightness - startStop.brightness) * ratio
    const startColor = stopColorHex(startStop)
    const endColor = stopColorHex(endStop)
    const blendedColor = blendHex(startColor, endColor, ratio)
    const coords = minutesToCoords(nowMinute, 0, trackRadius.value)
    let temperatureValue = null
    if (startStop.colorMode === 'temperature' && endStop.colorMode === 'temperature') {
        temperatureValue = Math.round(startStop.temperature + (endStop.temperature - startStop.temperature) * ratio)
    }
    const colorDot = !temperatureValue && startStop.useColor && endStop.useColor ? blendedColor : ''
    const colorLabel = temperatureValue ? `${temperatureValue}K` : ''
    const brightnessText = autoBrightnessActive.value ? 'Автояркость' : `${Math.round(brightnessValue)}%`
    return {
        cx: coords.x,
        cy: coords.y,
        color: blendedColor,
        brightnessText,
        colorLabel,
        colorDot
    }
})

const dialRef = ref(null)
const assignDialRef = (el) => {
    dialRef.value = el
}
const dialMetrics = reactive({
    size: 320,
    radius: 160,
    centerX: 0,
    centerY: 0
})
let activeDialSnapshot = null
const dialVectorState = reactive({
    centerX: 0,
    centerY: 0,
    zeroX: 0,
    zeroY: 0,
    baseLength: 1
})
const baseDialSize = 320

function readDialMetrics() {
    const el = dialRef.value
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const size = Math.min(rect.width, rect.height)
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    dialMetrics.size = size
    dialMetrics.radius = size / 2
    dialMetrics.centerX = centerX
    dialMetrics.centerY = centerY
    return {
        size,
        radius: dialMetrics.radius,
        centerX,
        centerY
    }
}

function updateDialVector(metrics) {
    const snapshot = metrics || dialMetrics
    if (!snapshot) return
    const radius = snapshot.radius || baseDialSize / 2
    dialVectorState.centerX = snapshot.centerX || 0
    dialVectorState.centerY = snapshot.centerY || 0
    dialVectorState.zeroX = radius
    dialVectorState.zeroY = 0
    dialVectorState.baseLength = Math.max(radius, 1)
}

const resizeObserver = ref(null)

onMounted(() => {
    readDialMetrics()
    resizeObserver.value = new ResizeObserver(() => readDialMetrics())
    if (dialRef.value) resizeObserver.value.observe(dialRef.value)
    window.addEventListener('scroll', readDialMetrics, { passive: true })
    window.addEventListener('resize', readDialMetrics)
})

onUnmounted(() => {
    resizeObserver.value?.disconnect()
    window.removeEventListener('scroll', readDialMetrics)
    window.removeEventListener('resize', readDialMetrics)
    if (timeTickerInterval) {
        clearInterval(timeTickerInterval)
        timeTickerInterval = null
    }
})

watch(
    () => dialRef.value,
    (el) => {
        if (el && resizeObserver.value) {
            resizeObserver.value.observe(el)
            readDialMetrics()
        }
    }
)

const draggingHandle = ref(null)
const suppressedSnapHandle = ref(null)
const dragState = reactive({
    activePointerMinutes: 0,
    accumulatedMinutes: 0,
    handleStartMinutes: 0
})
const dialScale = computed(() => {
    const size = dialMetrics.size || baseDialSize
    const scale = size / baseDialSize
    return Math.min(Math.max(scale, 0.55), 1.6)
})
const mainHandleSize = computed(() => 40 * dialScale.value)
const offsetHandleSize = computed(() => 17 * dialScale.value)
const handleBorderWidth = computed(() => 2 * Math.max(0.75, dialScale.value * 0.85))
const offsetHandleBorderWidth = computed(() => Math.max(0.75, dialScale.value * 0.8))
const scenarioArcWidth = computed(() => Math.max(mainHandleSize.value * 0.8, 8))
const baseRingWidth = computed(() => Math.max(scenarioArcWidth.value + mainHandleSize.value * 0.2, scenarioArcWidth.value + 6))
const arcSpacing = computed(() => Math.max(10, 14 * dialScale.value))
const trackRadius = computed(() => Math.max((dialMetrics.radius || 0) - arcSpacing.value - Math.max(baseRingWidth.value, scenarioArcWidth.value) / 2, 0))
const offsetArcWidth = computed(() => Math.max(scenarioArcWidth.value / 3, 3))
const offsetHandleRingOffset = computed(() => arcSpacing.value + Math.max(mainHandleSize.value * 0.35, 24))
const minuteStep = 5
const snapMinutes = (value) => {
    if (!Number.isFinite(value)) return 0
    return Math.round(value / minuteStep) * minuteStep
}

function handlePointerDown(type, event) {
    event.preventDefault()
    const snapshot = readDialMetrics()
    activeDialSnapshot = snapshot
    updateDialVector(snapshot)
    draggingHandle.value = type
    if (type === 'start' && startStop.mode !== 'clock') suppressedSnapHandle.value = 'start'
    else if (type === 'end' && endStop.mode !== 'clock') suppressedSnapHandle.value = 'end'
    else suppressedSnapHandle.value = null
    const pointerMinutes = pointerToMinutes(event)
    if (type === 'start' || type === 'end') {
        dragState.activePointerMinutes = pointerMinutes
        dragState.accumulatedMinutes = 0
        dragState.handleStartMinutes = type === 'start' ? startAnchorMinutes.value : endAnchorMinutes.value
    } else {
        dragState.activePointerMinutes = pointerMinutes
        dragState.accumulatedMinutes = 0
        dragState.handleStartMinutes = 0
    }
    event.target.setPointerCapture?.(event.pointerId)
}

function handlePointerMove(event) {
    if (!draggingHandle.value) return
    if (event.pointerType === 'touch') event.preventDefault()
    const pointerMinutes = pointerToMinutes(event)
    if (!Number.isFinite(pointerMinutes)) return
    const pointerDelta = minutesDiff(pointerMinutes, dragState.activePointerMinutes)
    dragState.activePointerMinutes = pointerMinutes
    dragState.accumulatedMinutes += pointerDelta
    const nextMinutes = normalizeMinutes(dragState.handleStartMinutes + dragState.accumulatedMinutes)
    const snappedMinutes = snapMinutes(nextMinutes)
    if (draggingHandle.value === 'start') {
        if (suppressedSnapHandle.value === 'start') {
            toClockMode(startStop, snappedMinutes)
            suppressedSnapHandle.value = null
            return
        }
        applyMinutes(startStop, snappedMinutes)
    } else if (draggingHandle.value === 'end') {
        if (suppressedSnapHandle.value === 'end') {
            toClockMode(endStop, snappedMinutes)
            suppressedSnapHandle.value = null
            return
        }
        applyMinutes(endStop, snappedMinutes)
    } else if (draggingHandle.value === 'start-offset') {
        updateOffset(startStop, event)
    } else if (draggingHandle.value === 'end-offset') {
        updateOffset(endStop, event)
    }
}

function stopDragging(event) {
    if (!draggingHandle.value) return
    event?.target?.releasePointerCapture?.(event.pointerId)
    draggingHandle.value = null
    suppressedSnapHandle.value = null
    activeDialSnapshot = null
    dragState.activePointerMinutes = 0
    dragState.accumulatedMinutes = 0
    dragState.handleStartMinutes = 0
}

function updateOffset(stop, event) {
    if (stop.mode === 'clock') return
    const anchor = stop.mode === 'sunrise' ? sunriseTime.value : sunsetTime.value
    const offset = pointerToOffsetMinutes(event, anchor)
    stop.offset = Math.max(-60, Math.min(60, offset))
}

function toClockMode(stop, minutes) {
    stop.mode = 'clock'
    stop.clockMinutes = normalizeMinutes(snapMinutes(minutes))
    stop.offset = 0
}

function applyMinutes(stop, minutes) {
    const snapped = detectAnchor(minutes)
    if (snapped) {
        stop.mode = snapped.mode
        stop.offset = snapped.offset
    } else {
        toClockMode(stop, minutes)
    }
}

function detectAnchor(minutes) {
    const sunriseDiff = minutesDiff(minutes, sunriseTime.value)
    if (Math.abs(sunriseDiff) <= 15) {
        return { mode: 'sunrise', offset: 0 }
    }
    const sunsetDiff = minutesDiff(minutes, sunsetTime.value)
    if (Math.abs(sunsetDiff) <= 15) {
        return { mode: 'sunset', offset: 0 }
    }
    return null
}

function pointerToMinutes(event) {
    const vector = dialVectorState
    const centerX = vector.centerX || activeDialSnapshot?.centerX || dialMetrics.centerX
    const centerY = vector.centerY || activeDialSnapshot?.centerY || dialMetrics.centerY
    const zeroX = vector.zeroX || activeDialSnapshot?.radius || dialMetrics.radius
    const zeroY = vector.zeroY || 0
    const baseLength = vector.baseLength || Math.max(activeDialSnapshot?.radius || dialMetrics.radius || 1, 1)
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return 0

    const currentVectorX = event.clientX - centerX
    const currentVectorY = event.clientY - centerY
    const currentLength = Math.sqrt(currentVectorX ** 2 + currentVectorY ** 2)
    if (!currentLength) return 0
    let cosValue = (zeroX * currentVectorX + zeroY * currentVectorY) / (baseLength * currentLength)
    if (!Number.isFinite(cosValue)) return 0
    cosValue = Math.min(1, Math.max(-1, cosValue))
    let angle = (Math.acos(cosValue) * 180) / Math.PI
    if (event.clientY < centerY) angle = 360 - angle
    let minutes = Math.round(((angle + 90) / 360) * 1440)
    minutes %= 1440
    if (minutes < 0) minutes += 1440
    return minutes
}

function pointerToOffsetMinutes(event, anchorMinutes) {
    const minutes = pointerToMinutes(event)
    return minutesDiff(minutes, anchorMinutes)
}

function minutesDiff(a, b) {
    let diff = a - b
    while (diff > 720) diff -= 1440
    while (diff < -720) diff += 1440
    return diff
}

function normalizeMinutes(value) {
    let next = value % 1440
    if (next < 0) next += 1440
    return next
}

const startMinutes = computed(() => stopMinutes(startStop))
const endMinutes = computed(() => stopMinutes(endStop))

function stopMinutes(stop) {
    if (stop.mode === 'sunrise') return normalizeMinutes(sunriseTime.value + stop.offset)
    if (stop.mode === 'sunset') return normalizeMinutes(sunsetTime.value + stop.offset)
    return normalizeMinutes(stop.clockMinutes)
}

function stopAnchorMinutes(stop) {
    if (stop.mode === 'sunrise') return normalizeMinutes(sunriseTime.value)
    if (stop.mode === 'sunset') return normalizeMinutes(sunsetTime.value)
    return stopMinutes(stop)
}

function minutesToAngle(min) {
    return (min / 1440) * 360 - 90
}

function minutesToCoords(min, radiusOffset = 30, radiusOverride = null) {
    const r = radiusOverride != null ? radiusOverride : dialMetrics.radius - radiusOffset
    const angle = (minutesToAngle(min) * Math.PI) / 180
    const x = r * Math.cos(angle) + dialMetrics.radius
    const y = r * Math.sin(angle) + dialMetrics.radius
    return { x, y }
}

function describeArc(startMin, endMin, radius, reverse = false) {
    if (!Number.isFinite(radius) || radius <= 0) return ''
    const startAngle = minutesToAngle(startMin)
    let endAngle = minutesToAngle(endMin)
    let sweep = endAngle - startAngle
    if (sweep <= 0) sweep += 360
    const arcFlag = sweep > 180 ? 1 : 0
    const sweepFlag = reverse ? 0 : 1
    const start = polarToCartesian(reverse ? endAngle : startAngle, radius)
    const end = polarToCartesian(reverse ? startAngle : endAngle, radius)
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${arcFlag} ${sweepFlag} ${end.x} ${end.y}`
}

function describeOffsetArcPath(anchorMin, targetMin, radius) {
    const diff = minutesDiff(targetMin, anchorMin)
    if (!diff || radius <= 0) return ''
    const startAngle = minutesToAngle(anchorMin)
    const endAngle = minutesToAngle(targetMin)
    const start = polarToCartesian(startAngle, radius)
    const end = polarToCartesian(endAngle, radius)
    const largeArcFlag = Math.abs(diff) > 720 ? 1 : 0
    const sweepFlag = diff >= 0 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`
}

function polarToCartesian(angle, radius) {
    const rad = (angle * Math.PI) / 180
    const x = radius * Math.cos(rad) + dialMetrics.radius
    const y = radius * Math.sin(rad) + dialMetrics.radius
    return { x, y }
}

const mainArcRadius = computed(() => trackRadius.value)
const scenarioArc = computed(() => describeArc(startMinutes.value, endMinutes.value, mainArcRadius.value - 4))
const autoArcText = computed(() => describeArc(startMinutes.value, endMinutes.value, mainArcRadius.value, true))

const scenarioGradientCoords = computed(() => ({
    start: minutesToCoords(startMinutes.value, 0, mainArcRadius.value),
    end: minutesToCoords(endMinutes.value, 0, mainArcRadius.value)
}))

function buildOffsetArc(anchorMinutes, actualMinutes, key, stop, radius) {
    if (!Number.isFinite(anchorMinutes) || !Number.isFinite(actualMinutes)) return null
    if (stop?.mode === 'clock') return null
    const diff = minutesDiff(actualMinutes, anchorMinutes)
    if (!diff || radius <= 0) return null
    return {
        key,
        path: describeOffsetArcPath(anchorMinutes, actualMinutes, radius)
    }
}

const offsetArcRadius = computed(() => {
    const r = mainArcRadius.value
    if (!r) return 0
    const spacing = 2
    const innerRadius = r - scenarioArcWidth.value / 2 - spacing - offsetArcWidth.value / 2
    return Math.max(innerRadius, 0)
})

const startOffsetArc = computed(() =>
    buildOffsetArc(startAnchorMinutes.value, startMinutes.value, 'start', startStop, offsetArcRadius.value)
)
const endOffsetArc = computed(() =>
    buildOffsetArc(endAnchorMinutes.value, endMinutes.value, 'end', endStop, offsetArcRadius.value)
)
const offsetArcs = computed(() => {
    const arcs = []
    if (startOffsetArc.value) arcs.push(startOffsetArc.value)
    if (endOffsetArc.value) arcs.push(endOffsetArc.value)
    return arcs
})

function formatOffsetLabel(diff) {
    const sign = diff >= 0 ? '+' : '-'
    const minutes = Math.abs(Math.round(diff))
    return `${sign}${minutes} мин`
}

const offsetArcLabels = computed(() => {
    const labels = []
    const r = offsetArcRadius.value
    if (r <= 0) return labels
    const labelRadius = Math.max(r - offsetArcWidth.value * 0.4, 0)

    const addLabel = (key, anchorMinutes, actualMinutes, stop) => {
        if (stop?.mode === 'clock') return
        const diff = minutesDiff(actualMinutes, anchorMinutes)
        if (!diff) return
        const midMinutes = normalizeMinutes(anchorMinutes + diff / 2)
        const coord = minutesToCoords(midMinutes, 0, labelRadius)
        labels.push({
            key,
            text: formatOffsetLabel(diff),
            x: coord.x,
            y: coord.y
        })
    }

    addLabel('start', startAnchorMinutes.value, startMinutes.value, startStop)
    addLabel('end', endAnchorMinutes.value, endMinutes.value, endStop)
    return labels
})

const scenarioArcColor = computed(() => {
    if (scenarioStatus.value === 'off') return '#3b4254'
    if (scenarioStatus.value === 'paused') return '#fbd38d'
    if (startStop.useColor && endStop.useColor) return 'url(#dialGradient)'
    return 'url(#neutralGradient)'
})

const dialInactive = computed(() => ['off', 'paused'].includes(scenarioDisplayStatus.value))

const dialGradientStops = computed(() => ({
    start: stopColorHex(startStop),
    end: stopColorHex(endStop)
}))

function temperatureToHex(kelvin) {
    const clamped = Math.max(1700, Math.min(6500, kelvin))
    const pivot = 5500
    const warm = { r: 255, g: 165, b: 70 }
    const neutral = { r: 255, g: 255, b: 255 }
    const cool = { r: 200, g: 225, b: 255 }
    let r
    let g
    let b
    if (clamped <= pivot) {
        const ratio = (clamped - 1700) / (pivot - 1700)
        r = Math.round(warm.r + (neutral.r - warm.r) * ratio)
        g = Math.round(warm.g + (neutral.g - warm.g) * ratio)
        b = Math.round(warm.b + (neutral.b - warm.b) * ratio)
    } else {
        const ratio = (clamped - pivot) / (6500 - pivot)
        r = Math.round(neutral.r + (cool.r - neutral.r) * ratio)
        g = Math.round(neutral.g + (cool.g - neutral.g) * ratio)
        b = Math.round(neutral.b + (cool.b - neutral.b) * ratio)
    }
    return rgbToHex(r, g, b)
}

function rgbToHex(r, g, b) {
    return `#${[r, g, b]
        .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
        .join('')}`
}

function hexToRgb(hex) {
    const value = (hex || '').trim().replace('#', '')
    if (value.length !== 6) return { r: 255, g: 255, b: 255 }
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return { r: 255, g: 255, b: 255 }
    return { r, g, b }
}

function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex)
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
        if (max === rn) {
            h = ((gn - bn) / delta) % 6
        } else if (max === gn) {
            h = (bn - rn) / delta + 2
        } else {
            h = (rn - gn) / delta + 4
        }
        h *= 60
        if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : delta / max
    const v = max
    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        v: Math.round(v * 100)
    }
}

function applyBrightnessHex(hex, brightness, enabled) {
    if (!enabled || !Number.isFinite(brightness) || brightness >= 100) return hex
    const normalized = Math.max(1, Math.min(100, brightness))
    const factor = 0.5 + 0.5 * (normalized / 100)
    const { r, g, b } = hexToRgb(hex)
    return rgbToHex(Math.round(r * factor), Math.round(g * factor), Math.round(b * factor))
}

function blendHex(first, second, ratio = 0) {
    const normalizedRatio = Math.max(0, Math.min(1, ratio))
    const a = hexToRgb(first)
    const b = hexToRgb(second)
    const r = Math.round(a.r + (b.r - a.r) * normalizedRatio)
    const g = Math.round(a.g + (b.g - a.g) * normalizedRatio)
    const bl = Math.round(a.b + (b.b - a.b) * normalizedRatio)
    return rgbToHex(r, g, bl)
}

function stopColorHex(stop) {
    if (stop.useColor) {
        const baseHex = stop.colorMode === 'rgb' ? stop.colorHex : temperatureToHex(stop.temperature)
        return applyBrightnessHex(baseHex, stop.brightness, stop.useBrightness)
    }
    if (stop.useBrightness) {
        return applyBrightnessHex('#94a3b8', stop.brightness, true)
    }
    return '#94a3b8'
}

const handleShadowScale = computed(() => Math.max(0.65, dialScale.value))

function buildHandleStyle(coords, { size = 40, color, borderWidth } = {}) {
    const style = {
        width: `${size}px`,
        height: `${size}px`,
        transform: `translate(${coords.x - size / 2}px, ${coords.y - size / 2}px)`
    }
    if (color) style.background = color
    if (borderWidth != null) style.borderWidth = `${borderWidth}px`
    style.boxShadow = `0 ${10 * handleShadowScale.value}px ${25 * handleShadowScale.value}px rgba(0, 0, 0, 0.45)`
    return style
}

const startAnchorMinutes = computed(() => stopAnchorMinutes(startStop))
const endAnchorMinutes = computed(() => stopAnchorMinutes(endStop))

const startHandleStyle = computed(() =>
    buildHandleStyle(minutesToCoords(startAnchorMinutes.value, 0, trackRadius.value), {
        color: stopColorHex(startStop),
        size: mainHandleSize.value,
        borderWidth: handleBorderWidth.value
    })
)
const endHandleStyle = computed(() =>
    buildHandleStyle(minutesToCoords(endAnchorMinutes.value, 0, trackRadius.value), {
        color: stopColorHex(endStop),
        size: mainHandleSize.value,
        borderWidth: handleBorderWidth.value
    })
)
const showStartOffset = computed(() => startStop.mode !== 'clock')
const showEndOffset = computed(() => endStop.mode !== 'clock')
const startOffsetStyle = computed(() =>
    buildHandleStyle(minutesToCoords(stopMinutes(startStop), 0, offsetArcRadius.value), {
        size: offsetHandleSize.value,
        borderWidth: offsetHandleBorderWidth.value
    })
)
const endOffsetStyle = computed(() =>
    buildHandleStyle(minutesToCoords(stopMinutes(endStop), 0, offsetArcRadius.value), {
        size: offsetHandleSize.value,
        borderWidth: offsetHandleBorderWidth.value
    })
)

function minutesToGradientAngle(minutes) {
    const normalized = ((minutes % 1440) + 1440) % 1440
    return (normalized / 1440) * 360
}

const dayNightGradient = computed(() => {
    const night = '#050910'
    const day = '#bab397'
    const sunriseAngle = minutesToGradientAngle(sunriseTime.value)
    const sunsetAngle = minutesToGradientAngle(sunsetTime.value)
    const dawnStartAngle = minutesToGradientAngle(sunriseTime.value - 60)
    const duskEndAngle = minutesToGradientAngle(sunsetTime.value + 60)

    return `conic-gradient(from 0deg,
    ${night} 0deg,
    ${night} ${dawnStartAngle}deg,
    ${day} ${sunriseAngle}deg,
    ${day} ${sunsetAngle}deg,
    ${night} ${duskEndAngle}deg,
    ${night} 360deg)`
})

const hourLabels = computed(() => Array.from({ length: 12 }, (_, i) => i * 2))
const tickMarks = computed(() => {
    const total = 96
    const items = []
    for (let index = 0; index < total; index++) {
        const angle = (index / total) * 360
        const major = index % 4 === 0
        const start = faceCoord(angle, 94)
        const end = faceCoord(angle, major ? 88 : 92)
        items.push({
            index,
            major,
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y
        })
    }
    return items
})

function faceCoord(angleDeg, radius = 70) {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return {
        x: 100 + radius * Math.cos(rad),
        y: 100 + radius * Math.sin(rad)
    }
}

const hourNumberItems = computed(() =>
    hourLabels.value.map((hour) => {
        const angle = (hour / 24) * 360
        const coord = faceCoord(angle, 76)
        return {
            hour,
            angle,
            x: coord.x,
            y: coord.y
        }
    })
)

const sunIconCoord = computed(() => faceCoord((12 / 24) * 360, 52))
const moonIconCoord = computed(() => faceCoord(0, 52))
const sunriseMarker = computed(() => faceCoord((sunriseTime.value / 1440) * 360, 90))
const sunsetMarker = computed(() => faceCoord((sunsetTime.value / 1440) * 360, 90))
const dialFaceRatio = 0.62
const startLabel = computed(() => stopLabel(startStop))
const endLabel = computed(() => stopLabel(endStop))
const startLabelCompact = computed(() => startStop.mode !== 'clock' && startStop.offset !== 0)
const endLabelCompact = computed(() => endStop.mode !== 'clock' && endStop.offset !== 0)
const autoBrightnessActive = computed(
    () => autoBrightness.enabled && (startStop.useBrightness || endStop.useBrightness)
)

function stopLabel(stop) {
    if (stop.mode === 'clock') return minutesToTimeString(stopMinutes(stop))
    const isSunrise = stop.mode === 'sunrise'
    const anchorWord = isSunrise ? 'рассвета' : 'заката'
    const anchorLabel = isSunrise ? 'Рассвет' : 'Закат'
    const anchorMinutes = isSunrise ? sunriseTime.value : sunsetTime.value
    const anchorTime = minutesToTimeString(anchorMinutes)
    const offset = stop.offset
    const actualTime = minutesToTimeString(normalizeMinutes(anchorMinutes + offset))
    if (offset === 0) return `${anchorLabel} (${anchorTime})`
    const abs = Math.abs(offset)
    const hours = Math.floor(abs / 60)
    const minutes = abs % 60
    let unit = ''
    if (hours && minutes) unit = `${hours} ч ${minutes} мин`
    else if (hours) unit = `${hours} ч`
    else unit = `${minutes || abs} мин`
    const phrase = offset > 0 ? `Через ${unit} после ${anchorWord}` : `За ${unit} до ${anchorWord}`
    return `${phrase} (${actualTime})`
}

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
    if (hasColor) {
        if (stop.colorMode === 'temperature') values.push(`${stop.temperature}K`)
        else values.push('Цвет')
    }
    if (stop.useBrightness) {
        if (autoBrightness.enabled) values.push('Автояркость')
        else values.push(`${Math.round(stop.brightness)}%`)
    }
    return {
        colorHex,
        values,
        hasColor,
        hasBrightness: !!stop.useBrightness,
        brightness: Number.isFinite(stop.brightness) ? stop.brightness : 0,
        placeholder: values.length ? '' : 'Не меняем'
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
                outputMin: clampNumberLocal(autoBrightness.brightnessMin, 1, 100),
                outputMax: clampNumberLocal(autoBrightness.brightnessMax, 1, 100)
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
    selectedDevicesIds.value = new Set()
    selectionDirty.value = false
    scenarioHasAutoState.value = true
    clearSelectionSources()
    captureSelectionSourcesFromScenario()
    resetAutoBrightness()
    presenceMode.value = 'any'
    scenarioStatus.value = 'running'
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
        presenceMode.value = scenario.runtime?.presence === 'onlyWhenHome' ? 'home' : 'any'
        const remoteStatus = scenario.autoLight?.state?.status === 'PAUSE' ? 'paused' : 'running'
        scenarioStatus.value = scenario.disabled ? 'off' : remoteStatus
        const hasAutoState = Boolean(data?.autoLight?.state && typeof data.autoLight.state === 'object')
        scenarioHasAutoState.value = hasAutoState
        captureSelectionSourcesFromScenario()
        selectionDirty.value = false
        if (!hasAutoState) hydrateStopsFromActions(scenario.actions || [])
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
        const response = await scenarioRequest('/save', { method: 'POST', body: { scenario: payload } })
        if (response?.scenario) {
            Object.assign(scenario, createDefaultScenario(), response.scenario)
            normalizeScenarioStruct(scenario)
            scenario.id = response.scenario.id || scenario.id
            scenario.name = response.scenario.name || scenario.name
            const hasState = Boolean(response.scenario.autoLight?.state && typeof response.scenario.autoLight.state === 'object')
            scenarioHasAutoState.value = hasState
            captureSelectionSourcesFromScenario()
            if (!hasState) hydrateStopsFromActions(scenario.actions || [])
        }
        const remoteStatus = scenario.autoLight?.state?.status === 'PAUSE' ? 'paused' : 'running'
        scenarioStatus.value = scenario.disabled ? 'off' : remoteStatus
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

const bodyOverflow = ref('')
const sheetClosing = ref(false)
const sheetTranslate = ref(0)
const sheetDragStartY = ref(null)
const sheetDragActive = ref(false)
const sheetDragElement = ref(null)

watch(activeModal, (value, prev) => {
    if (value && !prev) {
        bodyOverflow.value = document.body.style.overflow
        document.body.style.overflow = 'hidden'
    } else if (!value && prev) {
        document.body.style.overflow = bodyOverflow.value || ''
        sheetTranslate.value = 0
        sheetClosing.value = false
    }
})

function closeSheetWithAnimation() {
    sheetClosing.value = true
    sheetTranslate.value = 200
    setTimeout(() => {
        closeModal()
        sheetTranslate.value = 0
        sheetClosing.value = false
    }, 250)
}

function startSheetDrag(event) {
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    sheetDragStartY.value = event.clientY
    sheetDragActive.value = true
    sheetDragElement.value = event.currentTarget
    sheetDragElement.value?.setPointerCapture?.(event.pointerId)
}

function handleSheetDrag(event) {
    if (!sheetDragActive.value || sheetDragStartY.value == null) return
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    const delta = event.clientY - sheetDragStartY.value
    sheetTranslate.value = Math.max(0, delta)
}

function endSheetDrag(event) {
    if (!sheetDragActive.value) return
    sheetDragElement.value?.releasePointerCapture?.(event.pointerId)
    if (sheetTranslate.value > 120) {
        closeSheetWithAnimation()
    } else {
        sheetTranslate.value = 0
    }
    sheetDragActive.value = false
    sheetDragStartY.value = null
    sheetDragElement.value = null
}

const sheetTransform = computed(() => {
    const translate = Math.max(sheetTranslate.value, 0)
    return `translateY(${translate}px)`
})

const currentStopForModal = computed(() => {
    if (modalPayload.value === 'start') return startStop
    if (modalPayload.value === 'end') return endStop
    return null
})

const sensorOptions = computed(() =>
    catalog.devices
        .filter((device) => /sensor|датчик|illumination|lux/i.test(JSON.stringify(device)))
        .map((device) => ({
            id: device.id,
            name: device.name || 'Датчик'
        }))
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
                <input v-if="editingName" ref="nameInputRef" v-model="scenarioNameValue" maxlength="40"
                    class="scenario-name-input" type="text" placeholder="Название сценария" @blur="finishEditingName"
                    @keyup.enter="finishEditingName" />
                <button v-else :class="['scenario-name-display', { placeholder: !scenarioNameValue }]" type="button"
                    @click="editingName = true">
                    {{ scenarioNameDisplay }}
                </button>
            </div>
            <div class="status-panel">
                <div class="status-text" :style="{ color: scenarioStatusColor }">
                    <strong>{{ scenarioStatusText }}</strong>
                </div>
                <div class="status-actions">
                    <button type="button" class="status-icon-btn"
                        :title="scenarioDisplayStatus === 'paused' ? 'Возобновить' : 'Пауза'"
                        @click="toggleScenarioPause" :disabled="scenarioDisplayStatus === 'off'">
                        <span v-if="scenarioDisplayStatus === 'paused'">▶</span>
                        <span v-else>⏸</span>
                    </button>
                    <button type="button" class="status-icon-btn power"
                        :title="scenarioDisplayStatus === 'off' ? 'Включить' : 'Выключить'"
                        @click="toggleScenarioPower">
                        <span>{{ scenarioDisplayStatus === 'off' ? '⏻' : '⏼' }}</span>
                    </button>
                </div>
            </div>
        </div>

        <div class="dial-layout">
            <div class="dial-column">
                <ScenarioDialCircle :dial-ref="assignDialRef" :dial-metrics="dialMetrics"
                    :day-night-gradient="dayNightGradient" :scenario-arc="scenarioArc"
                    :scenario-arc-color="scenarioArcColor" :scenario-arc-width="scenarioArcWidth"
                    :base-ring-width="baseRingWidth" :offset-arc-width="offsetArcWidth" :offset-arcs="offsetArcs"
                    :ring-radius="trackRadius" :arc-radius="mainArcRadius" :offset-arc-radius="offsetArcRadius"
                    :offset-labels="offsetArcLabels" :inactive="dialInactive"
                    :paused="scenarioDisplayStatus === 'paused'" :tick-marks="tickMarks"
                    :hour-number-items="hourNumberItems" :sun-icon-coord="sunIconCoord" :moon-icon-coord="moonIconCoord"
                    :start-label="startLabel" :end-label="endLabel" :start-label-compact="startLabelCompact"
                    :end-label-compact="endLabelCompact" :auto-brightness="autoBrightnessActive"
                    :auto-arc-text="autoArcText" :current-state="currentState"
                    :current-status-label="scenarioStatusLabel" :start-handle-style="startHandleStyle"
                    :end-handle-style="endHandleStyle" :show-start-offset="showStartOffset"
                    :start-offset-style="startOffsetStyle" :show-end-offset="showEndOffset"
                    :end-offset-style="endOffsetStyle" :gradient-start-color="dialGradientStops.start"
                    :gradient-end-color="dialGradientStops.end" :gradient-coords="scenarioGradientCoords"
                    :dial-face-ratio="dialFaceRatio" :sunrise-marker="sunriseMarker" :sunset-marker="sunsetMarker"
                    @open-start-editor="openModal('state', 'start')" @open-end-editor="openModal('state', 'end')"
                    @resume="scenarioStatus = 'running'" @pointer-move="handlePointerMove" @pointer-up="stopDragging"
                    @pointer-cancel="stopDragging" @pointer-leave="stopDragging"
                    @start-pointerdown="(event) => handlePointerDown('start', event)"
                    @end-pointerdown="(event) => handlePointerDown('end', event)"
                    @start-offset-pointerdown="(event) => handlePointerDown('start-offset', event)"
                    @end-offset-pointerdown="(event) => handlePointerDown('end-offset', event)" />
                <div class="weekday-picker">
                    <p>Дни недели</p>
                    <div class="weekday-grid">
                        <button v-for="day in weekdayOptions" :key="day.value" type="button" class="weekday-btn"
                            :class="{ active: selectedDays.includes(day.value) }" @click="toggleDay(day.value)">
                            {{ day.label }}
                        </button>
                    </div>
                </div>
            </div>
            <div class="settings-column">
                <section class="compact-section">
                    <TargetDevicesCard :loading="catalogLoading" :error="catalogError" :summary="selectedTargetsLabel"
                        @open="openModal('devices')" />

                    <StopPreviewList :start-summary="startStateSummary" :end-summary="endStateSummary"
                        :auto-brightness-active="autoBrightnessActive" @open-start="openModal('state', 'start')"
                        @open-end="openModal('state', 'end')" />
                </section>

                <PresenceFooter :options="presenceOptions" :value="presenceMode" @update:value="presenceMode = $event"
                    @save="handleSave" @delete="handleDelete" />
                <div class="scenario-feedback">
                    <p v-if="scenarioMessage" class="status-info success">{{ scenarioMessage }}</p>
                    <p v-if="scenarioError" class="status-info error">{{ scenarioError }}</p>
                </div>
            </div>
        </div>

        <Teleport to="body">
            <div v-if="activeModal" class="sheet-overlay" @touchmove.passive>
                <div class="sheet-backdrop" @click="closeModal" />
                <div class="sheet-panel" :class="{ closing: sheetClosing }" :style="{ transform: sheetTransform }">
                    <header class="sheet-header" @pointerdown="startSheetDrag" @pointermove="handleSheetDrag"
                        @pointerup="endSheetDrag" @pointercancel="endSheetDrag">
                        <button type="button" class="sheet-close" @click="closeModal">Закрыть</button>
                        <h3 v-if="activeModal === 'devices'">Выбор устройств</h3>
                        <h3 v-else>
                            {{ modalPayload === 'start' ? 'Стартовое состояние' : 'Финальное состояние' }}
                        </h3>
                    </header>
                    <div class="sheet-content">
                        <DeviceSelectorSheet v-if="activeModal === 'devices'" :sections="deviceSections"
                            :selected-ids="selectedDevicesIds" :selected-groups="selectedGroupIds"
                            @toggle-group="handleGroupToggle" @toggle-device="handleDeviceToggle" />
                        <StopStateSheet v-else-if="activeModal === 'state' && currentStopForModal"
                            :stop="currentStopForModal" :palette="colorPalette"
                            :context="modalPayload === 'start' ? 'start' : 'end'" :auto-brightness="autoBrightness"
                            :sensor-options="sensorOptions" />
                    </div>
                </div>
            </div>
        </Teleport>
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

.title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.scenario-name-wrap {
    flex: 0 1 40ch;
    min-width: 220px;
    max-width: 40ch;
}

.scenario-name-input {
    width: 100%;
    border-radius: 12px;
    background: var(--surface-card);
    color: var(--text-primary);
    border: 1px solid rgba(148, 163, 184, 0.5);
    padding: 10px 14px;
    font-size: 18px;
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
    font-size: 18px;
    font-weight: 600;
    color: #f8fafc;
}

.scenario-name-display.placeholder {
    color: rgba(248, 250, 252, 0.5);
}

.status-panel {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}

.status-text strong {
    font-size: 16px;
}

.status-actions {
    display: flex;
    gap: 8px;
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
    margin-top: 18px;
    padding: 12px;
    background: var(--surface-card);
    border-radius: 16px;
    border: 1px solid var(--surface-border);
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
    padding: 6px 0;
    font-weight: 600;
    font-size: 12px;
    transition: background var(--transition-base), color var(--transition-base);
}

.weekday-btn.active {
    background: rgba(168, 85, 247, 0.16);
    border-color: rgba(168, 85, 247, 0.4);
    color: var(--primary);
}

@media (min-width: 500px) {
    .dial-layout {
        flex-direction: row;
        align-items: flex-start;
        gap: 32px;
    }

    .dial-column {
        flex: 1 1 auto;
        max-width: 500px;
        min-width: 0;
    }

    .settings-column {
        flex: 0 1 360px;
        min-width: 360px;
    }
}

.scenario-feedback {
    min-height: 1.4em;
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

.sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: flex-end;
    justify-content: center;
}

.sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
}

.sheet-panel {
    position: relative;
    width: min(520px, 100%);
    max-height: 90vh;
    background: var(--surface-card);
    border-top-left-radius: 28px;
    border-top-right-radius: 28px;
    padding-bottom: 24px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-primary);
    transform: translateY(100%);
    animation: sheet-slide-in 0.3s ease-out forwards;
    touch-action: pan-y;
}

.sheet-panel.closing {
    animation: sheet-slide-out 0.25s ease-in forwards;
}

@keyframes sheet-slide-in {
    from {
        transform: translateY(100%);
    }
    to {
        transform: translateY(0);
    }
}

@keyframes sheet-slide-out {
    from {
        transform: translateY(var(--sheet-current-translate, 0));
    }
    to {
        transform: translateY(100%);
    }
}

.sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--surface-border);
    touch-action: none;
    cursor: grab;
}

.sheet-header h3 {
    margin: 0;
    color: #f1f5f9;
    font-weight: 600;
}

.sheet-close {
    border: none;
    background: transparent;
    color: var(--primary);
    font-weight: 600;
}

.sheet-content {
    padding: 16px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    max-height: calc(90vh - 80px);
}
</style>
