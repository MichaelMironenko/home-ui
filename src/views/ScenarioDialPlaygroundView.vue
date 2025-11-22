<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { getConfig } from '../lib/api'
import { trackFunctionCall } from '../lib/requestMetrics'
import {
    hasBrightnessCapability,
    supportsColorCapability,
    isTargetDevice
} from '../utils/deviceCapabilities'
import ScenarioStatusBar from '../components/dial/ScenarioStatusBar.vue'
import ScenarioDialCircle from '../components/dial/ScenarioDialCircle.vue'
import TargetDevicesCard from '../components/dial/TargetDevicesCard.vue'
import StopPreviewList from '../components/dial/StopPreviewList.vue'
import AutoBrightnessCard from '../components/dial/AutoBrightnessCard.vue'
import PresenceFooter from '../components/dial/PresenceFooter.vue'
import DeviceSelectorSheet from '../components/dial/DeviceSelectorSheet.vue'
import StopStateSheet from '../components/dial/StopStateSheet.vue'
import AutoBrightnessSheet from '../components/dial/AutoBrightnessSheet.vue'

const scenarioStatusOptions = [
    { id: 'running', label: 'Работает' },
    { id: 'paused', label: 'Пауза' },
    { id: 'off', label: 'Выкл.' }
]
const scenarioStatus = ref('running')

const presenceOptions = [
    { id: 'any', label: 'Всегда' },
    { id: 'home', label: 'Дома' },
    { id: 'away', label: 'Не дома' }
]
const presenceMode = ref('any')

const sunriseTime = ref(7 * 60 + 10)
const sunsetTime = ref(16 * 60 + 25)

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
const offsetHandleSize = computed(() => 34 * dialScale.value)
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

function describeArc(startMin, endMin, radius) {
    const startAngle = minutesToAngle(startMin)
    let endAngle = minutesToAngle(endMin)
    let sweep = endAngle - startAngle
    if (sweep <= 0) sweep += 360
    const start = polarToCartesian(startAngle, radius)
    const end = polarToCartesian(endAngle, radius)
    const arcFlag = sweep > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${arcFlag} 1 ${end.x} ${end.y}`
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
const scenarioArc = computed(() => describeArc(startMinutes.value, endMinutes.value, mainArcRadius.value))

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
    const labelRadius = Math.max(r - offsetArcWidth.value * 0.6, 0)

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
    return '#38bdf8'
})

const dialGradientStops = computed(() => ({
    start: startStop.colorMode === 'rgb' ? startStop.colorHex : '#ffd88f',
    end: endStop.colorMode === 'rgb' ? endStop.colorHex : '#8cb7ff'
}))

function temperatureToHex(kelvin) {
    const clamped = Math.max(2000, Math.min(6500, kelvin))
    const ratio = (clamped - 2000) / (6500 - 2000)
    const warm = { r: 255, g: 181, b: 107 }
    const cool = { r: 147, g: 193, b: 255 }
    const r = Math.round(warm.r + (cool.r - warm.r) * ratio)
    const g = Math.round(warm.g + (cool.g - warm.g) * ratio)
    const b = Math.round(warm.b + (cool.b - warm.b) * ratio)
    return `#${[r, g, b]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')}`
}

function stopColorHex(stop) {
    if (stop.useColor) {
        if (stop.colorMode === 'rgb') return stop.colorHex
        return temperatureToHex(stop.temperature)
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

function stopLabel(stop) {
    if (stop.mode === 'clock') return minutesToTimeString(stopMinutes(stop))
    const anchorWord = stop.mode === 'sunrise' ? 'рассвета' : 'заката'
    const anchorLabel = stop.mode === 'sunrise' ? 'Рассвет' : 'Закат'
    const offset = stop.offset
    if (offset === 0) return anchorLabel
    const abs = Math.abs(offset)
    const hours = Math.floor(abs / 60)
    const minutes = abs % 60
    let unit = ''
    if (hours && minutes) unit = `${hours} ч ${minutes} мин`
    else if (hours) unit = `${hours} ч`
    else unit = `${minutes || abs} мин`
    return offset > 0 ? `Через ${unit} после ${anchorWord}` : `За ${unit} до ${anchorWord}`
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
    const brightness = stop.useBrightness ? `${Math.round(stop.brightness)}%` : 'Без изменения'
    let color = 'Без изменения'
    if (stop.useColor) {
        if (stop.colorMode === 'temperature') {
            color = `${stop.temperature}K · ${temperatureLabel(stop.temperature)}`
        } else {
            color = stop.colorHex.toUpperCase()
        }
    }
    return { brightness, color }
}

function temperatureLabel(value) {
    if (value <= 2800) return 'тёплый'
    if (value <= 4200) return 'нейтральный'
    return 'холодный'
}

const selectedDevicesIds = ref(new Set())

function toggleDeviceSelection(id) {
    const next = new Set(selectedDevicesIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedDevicesIds.value = next
}

const config = reactive({
    base: '',
    keyHeader: 'x-api-key',
    keyValue: ''
})
const catalog = reactive({
    devices: [],
    rooms: []
})
const catalogLoading = ref(false)
const catalogError = ref('')

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

onMounted(async () => {
    await loadConfig()
    loadCatalog()
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

const lampSections = computed(() => {
    const groups = new Map()
    availableLamps.value.forEach((device) => {
        if (!groups.has(device.roomId)) {
            groups.set(device.roomId, {
                id: device.roomId,
                name: device.roomName,
                devices: []
            })
        }
        groups.get(device.roomId).devices.push(device)
    })
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

const selectedDevices = computed(() =>
    availableLamps.value.filter((device) => selectedDevicesIds.value.has(device.id))
)

watch(
    availableLamps,
    (list) => {
        if (!list.length) return
        const validIds = new Set(list.map((item) => item.id))
        const next = new Set(Array.from(selectedDevicesIds.value).filter((id) => validIds.has(id)))
        if (!next.size) {
            list.slice(0, 2).forEach((item) => next.add(item.id))
        }
        selectedDevicesIds.value = next
    },
    { immediate: true }
)

function isDimmableLamp(device) {
    return (
        isTargetDevice(device) &&
        (hasBrightnessCapability(device) || supportsColorCapability(device)) &&
        /light|lamp|bulb|strip|ламп|свет/i.test(
            [device.type, device.kind, device.icon, device.name].map((value) => value || '').join(' ')
        )
    )
}

const selectedDevicesLabel = computed(() => {
    if (!selectedDevices.value.length) return 'Нет выбранных ламп'
    const names = selectedDevices.value.map((device) => device.name)
    if (names.length <= 2) return names.join(', ')
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
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
watch(activeModal, (value, prev) => {
    if (value && !prev) {
        bodyOverflow.value = document.body.style.overflow
        document.body.style.overflow = 'hidden'
    } else if (!value && prev) {
        document.body.style.overflow = bodyOverflow.value || ''
    }
})

const currentStopForModal = computed(() => {
    if (modalPayload.value === 'start') return startStop
    if (modalPayload.value === 'end') return endStop
    return null
})

const autoBrightness = reactive({
    enabled: true,
    sensorId: '',
    luxMin: 30,
    luxMax: 350,
    brightnessMin: 15,
    brightnessMax: 85
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

const autoBrightnessDescription = computed(() => {
    if (!autoBrightness.enabled) return 'Выключено'
    const sensorName = sensorOptions.value.find((item) => item.id === autoBrightness.sensorId)?.name || '—'
    return `Датчик ${sensorName} · ${autoBrightness.luxMin}-${autoBrightness.luxMax} лк`
})

function handleSave() {
    console.info('Save scenario (placeholder)')
}

function handleDelete() {
    console.info('Delete scenario (placeholder)')
}
</script>

<template>
    <main class="scenario-dial-page">
        <ScenarioStatusBar :status="scenarioStatus" :options="scenarioStatusOptions"
            @update:status="scenarioStatus = $event" />

        <ScenarioDialCircle :dial-ref="assignDialRef" :dial-metrics="dialMetrics" :day-night-gradient="dayNightGradient"
            :scenario-arc="scenarioArc" :scenario-arc-color="scenarioArcColor" :scenario-arc-width="scenarioArcWidth"
            :base-ring-width="baseRingWidth" :offset-arc-width="offsetArcWidth" :offset-arcs="offsetArcs"
            :ring-radius="trackRadius" :arc-radius="mainArcRadius" :offset-arc-radius="offsetArcRadius"
            :offset-labels="offsetArcLabels" :tick-marks="tickMarks" :hour-number-items="hourNumberItems"
            :sun-icon-coord="sunIconCoord" :moon-icon-coord="moonIconCoord" :start-label="startLabel"
            :end-label="endLabel" :start-handle-style="startHandleStyle" :end-handle-style="endHandleStyle"
            :show-start-offset="showStartOffset" :start-offset-style="startOffsetStyle" :show-end-offset="showEndOffset"
            :end-offset-style="endOffsetStyle" :gradient-start-color="dialGradientStops.start"
            :gradient-end-color="dialGradientStops.end" :gradient-coords="scenarioGradientCoords"
            :dial-face-ratio="dialFaceRatio" :sunrise-marker="sunriseMarker" :sunset-marker="sunsetMarker"
            @open-start-editor="openModal('state', 'start')" @open-end-editor="openModal('state', 'end')"
            @pointer-move="handlePointerMove" @pointer-up="stopDragging" @pointer-cancel="stopDragging"
            @pointer-leave="stopDragging" @start-pointerdown="(event) => handlePointerDown('start', event)"
            @end-pointerdown="(event) => handlePointerDown('end', event)"
            @start-offset-pointerdown="(event) => handlePointerDown('start-offset', event)"
            @end-offset-pointerdown="(event) => handlePointerDown('end-offset', event)" />

        <section class="compact-section">
            <TargetDevicesCard :loading="catalogLoading" :error="catalogError" :summary="selectedDevicesLabel"
                @open="openModal('devices')" />

            <StopPreviewList :start-summary="startStateSummary" :end-summary="endStateSummary"
                @open-start="openModal('state', 'start')" @open-end="openModal('state', 'end')" />

            <AutoBrightnessCard :description="autoBrightnessDescription" @open="openModal('sensor')" />
        </section>

        <PresenceFooter :options="presenceOptions" :value="presenceMode" @update:value="presenceMode = $event"
            @save="handleSave" @delete="handleDelete" />

        <Teleport to="body">
            <div v-if="activeModal" class="sheet-overlay">
                <div class="sheet-backdrop" @click="closeModal" />
                <div class="sheet-panel">
                    <header class="sheet-header">
                        <button type="button" class="sheet-close" @click="closeModal">Закрыть</button>
                        <h3 v-if="activeModal === 'devices'">Выбор устройств</h3>
                        <h3 v-else-if="activeModal === 'state'">
                            {{ modalPayload === 'start' ? 'Стартовое состояние' : 'Финальное состояние' }}
                        </h3>
                        <h3 v-else>Автояркость по датчику</h3>
                    </header>
                    <div class="sheet-content">
                        <DeviceSelectorSheet v-if="activeModal === 'devices'" :sections="lampSections"
                            :selected-ids="selectedDevicesIds" :selected-count="selectedDevicesIds.size"
                            @toggle="toggleDeviceSelection" />
                        <StopStateSheet v-else-if="activeModal === 'state' && currentStopForModal"
                            :stop="currentStopForModal" :palette="colorPalette" />
                        <AutoBrightnessSheet v-else :model-value="autoBrightness" :sensor-options="sensorOptions" />
                    </div>
                </div>
            </div>
        </Teleport>
    </main>
</template>

<style scoped>
.scenario-dial-page {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    background: #050915;
    min-height: 100vh;
    color: #f8fafc;
}

.compact-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    background: #050915;
    border-top-left-radius: 28px;
    border-top-right-radius: 28px;
    padding-bottom: 24px;
    overflow-y: auto;
}

.sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.sheet-header h3 {
    margin: 0;
    color: #f1f5f9;
    font-weight: 600;
}

.sheet-close {
    border: none;
    background: transparent;
    color: #a5b4fc;
    font-weight: 600;
}

.sheet-content {
    padding: 16px 20px 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}
</style>
