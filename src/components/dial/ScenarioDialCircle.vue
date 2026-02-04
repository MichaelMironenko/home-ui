<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { stopColorHex } from '../../utils/colorUtils'
import { useConflictPopup } from '../../composables/useConflictPopup'
import DialFace from './DialFace.vue'

const props = defineProps({
    startStop: {
        type: Object,
        required: true
    },
    endStop: {
        type: Object,
        required: true
    },
    autoBrightness: {
        type: Boolean,
        default: false
    },
    currentStatusLabel: {
        type: String,
        default: ''
    },
    scenarioStatus: {
        type: String,
        default: 'running'
    },
    sunriseMinute: {
        type: Number,
        default: 0
    },
    sunsetMinute: {
        type: Number,
        default: 0
    },
    dialFaceRatio: {
        type: Number,
        default: 0.62
    },
    scenarioSegmentRadius: {
        type: Number,
        default: null
    },
    currentMinute: {
        type: Number,
        default: null
    },
    currentState: {
        type: Object,
        default: null
    },
    overlaps: {
        type: Array,
        default: () => []
    },
    overlapNames: {
        type: Object,
        default: () => ({})
    },
    timeZone: {
        type: String,
        default: ''
    }
})

const emit = defineEmits([
    'open-start-editor',
    'open-end-editor',
    'resume',
    'update:start-stop',
    'update:end-stop',
    'change'
])

const BASE_DIAL_SIZE = 320
const FACE_CENTER = 100
const SCENARIO_SEGMENT_INSET = 4
const DEFAULT_SEGMENT_OUTER_RADIUS = FACE_CENTER - SCENARIO_SEGMENT_INSET
const FACE_RADIUS = DEFAULT_SEGMENT_OUTER_RADIUS
const DIAL_FACE_MIN_GAP_PX = 48
const DIAL_FACE_GAP_FRACTION = 0.25
const ARC_PADDING_PX = 5
const SUN_TIME_EDGE_RATIO = 20
const MIN_SCENARIO_SPAN_MINUTES = 10
const MAX_SCENARIO_SPAN_MINUTES = 23 * 60
const ANCHOR_SNAP_WINDOW_MINUTES = 5
const HANDLE_TAP_HOLD_MS = 300
const HANDLE_TAP_MOVE_TOLERANCE = 6
const minuteStep = 5
const MINUTES_PER_DAY = 1440
const HALF_DAY_MINUTES = MINUTES_PER_DAY / 2
const FULL_CIRCLE_DEG = 360
const HANDLE_EMIT_THROTTLE_MS = 80
const AUTO_BRIGHTNESS_WARM_HEX = '#fff4dd'
const CONFLICT_STROKE = '#00000022'

const dialElement = ref(null)
const dialMetrics = reactive({
    size: BASE_DIAL_SIZE,
    radius: BASE_DIAL_SIZE / 2
})
let dialCenterX = 0
let dialCenterY = 0
let metricsReadHandle = 0
const resizeObserver = ref(null)

const draggingHandle = ref('')
const suppressedSnapHandle = ref('')
const dragState = reactive({
    activePointerMinutes: 0,
    accumulatedMinutes: 0,
    handleStartMinutes: 0
})
const handleTapGuards = {
    start: createTapGuard(),
    end: createTapGuard()
}

const localStartStop = reactive({})
const localEndStop = reactive({})

watch(
    () => props.startStop,
    (value) => syncStopState(localStartStop, value),
    { deep: true, immediate: true }
)

watch(
    () => props.endStop,
    (value) => syncStopState(localEndStop, value),
    { deep: true, immediate: true }
)

const stopEmitState = {
    start: { dirty: false, lastEmit: 0 },
    end: { dirty: false, lastEmit: 0 }
}

const gradientId = `scenario-arc-gradient-${Math.random().toString(36).slice(2, 9)}`

const dialScale = computed(() => {
    const size = dialMetrics.size || BASE_DIAL_SIZE
    const scale = size / BASE_DIAL_SIZE
    return Math.min(Math.max(scale, 0.55), 1.6)
})
const mainHandleSize = computed(() => 40 * dialScale.value)

const ratioToInsetPercent = (ratio) => `${(((1 - ratio) / 2) * 100).toFixed(4)}%`


const geom = computed(() => {
    const dialRadiusPx = dialMetrics.radius || BASE_DIAL_SIZE / 2
    const unitsPerPx = FACE_CENTER / Math.max(1, dialRadiusPx)
    const gapPx = Math.max(DIAL_FACE_MIN_GAP_PX, dialRadiusPx * DIAL_FACE_GAP_FRACTION)
    const dialFaceRadiusUnits = Math.max(40, Math.min(FACE_RADIUS, FACE_CENTER - gapPx * unitsPerPx))
    const arcPaddingUnits = ARC_PADDING_PX * unitsPerPx
    const arcOuterEdgeUnits = FACE_CENTER - arcPaddingUnits
    const arcInnerEdgeUnits = dialFaceRadiusUnits + arcPaddingUnits
    const scheduleRadius = (arcOuterEdgeUnits + arcInnerEdgeUnits) / 2
    const scheduleStrokeWidth = Math.max(6, arcOuterEdgeUnits - arcInnerEdgeUnits)
    const dialFaceInsetRatio = Math.max(0.2, Math.min(0.95, dialFaceRadiusUnits / FACE_CENTER))
    const scheduleBlurPx = Math.max(6, (scheduleStrokeWidth / unitsPerPx) * 0.35)
    const sunTimeRadiusUnits = dialFaceRadiusUnits - dialFaceRadiusUnits / SUN_TIME_EDGE_RATIO
    return {
        dialFaceInsetRatio,
        scheduleRadius,
        scheduleStrokeWidth,
        scheduleBlurPx,
        sunTimeRadiusUnits
    }
})

const startMinutes = computed(() => stopMinutes(localStartStop))
const endMinutes = computed(() => stopMinutes(localEndStop))
const startLabel = computed(() => stopLabelData(localStartStop))
const endLabel = computed(() => stopLabelData(localEndStop))
const startAnchorActive = computed(() => isAnchoredStop(localStartStop))
const endAnchorActive = computed(() => isAnchoredStop(localEndStop))
const startAnchorTarget = computed(() => {
    if (!startAnchorActive.value) return ''
    return localStartStop?.mode === 'sunrise' ? 'рассвета' : 'заката'
})
const endAnchorTarget = computed(() => {
    if (!endAnchorActive.value) return ''
    return localEndStop?.mode === 'sunrise' ? 'рассвета' : 'заката'
})
const startAnchorTitle = computed(() =>
    startAnchorTarget.value ? `Измените смещение от ${startAnchorTarget.value}` : ''
)
const endAnchorTitle = computed(() =>
    endAnchorTarget.value ? `Измените смещение от ${endAnchorTarget.value}` : ''
)
const gradientStartColor = computed(() => stopColorHex(localStartStop))
const gradientEndColor = computed(() => stopColorHex(localEndStop))
const dialInactive = computed(() => ['off', 'paused'].includes(props.scenarioStatus))
const isPaused = computed(() => props.scenarioStatus === 'paused')
const isRunning = computed(() => props.scenarioStatus === 'running')
const dialCenterState = computed(() => props.currentState || null)
const showDialCenter = computed(() => {
    if (!isRunning.value) return false
    const state = dialCenterState.value
    return Boolean(state && (state.brightness || state.colorHex))
})
const showDialCenterColor = computed(() => Boolean(showDialCenter.value && dialCenterState.value?.colorHex))
const showDialCenterTemp = computed(
    () => showDialCenterColor.value && Number.isFinite(dialCenterState.value?.temperature)
)
const showDialCenterLabel = computed(() => showDialCenterColor.value && !showDialCenterTemp.value)
const dialCenterSwatchStyle = computed(() => {
    const colorHex = dialCenterState.value?.colorHex
    return colorHex ? { backgroundColor: colorHex } : {}
})

function readDialMetrics() {
    const el = dialElement.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const size = Math.min(rect.width, rect.height)
    dialMetrics.size = size
    dialMetrics.radius = size / 2
    dialCenterX = rect.left + rect.width / 2
    dialCenterY = rect.top + rect.height / 2
}

function scheduleReadDialMetrics() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        readDialMetrics()
        return
    }
    if (metricsReadHandle) return
    metricsReadHandle = window.requestAnimationFrame(() => {
        metricsReadHandle = 0
        readDialMetrics()
    })
}

onMounted(() => {
    readDialMetrics()
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver.value = new ResizeObserver(() => scheduleReadDialMetrics())
        if (dialElement.value) {
            resizeObserver.value.observe(dialElement.value)
        }
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', scheduleReadDialMetrics)
        window.addEventListener('scroll', scheduleReadDialMetrics, { passive: true })
    }
})

onUnmounted(() => {
    if (metricsReadHandle && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(metricsReadHandle)
        metricsReadHandle = 0
    }
    resizeObserver.value?.disconnect()
    if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleReadDialMetrics)
        window.removeEventListener('scroll', scheduleReadDialMetrics)
    }
})

watch(
    () => dialElement.value,
    (el, prev) => {
        if (prev && resizeObserver.value) {
            resizeObserver.value.unobserve(prev)
        }
        if (el && resizeObserver.value) {
            resizeObserver.value.observe(el)
        }
        if (el) readDialMetrics()
    }
)

const autoOnlyBrightnessArc = computed(
    () => props.autoBrightness && !localStartStop?.useColor && !localEndStop?.useColor
)
const arcPulse = computed(
    () => props.autoBrightness && (autoOnlyBrightnessArc.value || localStartStop?.useColor || localEndStop?.useColor)
)
const scenarioSpanMinutes = computed(() =>
    clampScenarioSpan(clockwiseDuration(startMinutes.value, endMinutes.value))
)

function clampScenarioSpan(spanMinutes) {
    const span = Number(spanMinutes) || 0
    if (span <= 0) return MIN_SCENARIO_SPAN_MINUTES
    return Math.min(MAX_SCENARIO_SPAN_MINUTES, Math.max(MIN_SCENARIO_SPAN_MINUTES, span))
}

const scenarioArc = computed(() => {
    const radius = geom.value.scheduleRadius
    const strokeWidth = geom.value.scheduleStrokeWidth
    const spanMinutes = scenarioSpanMinutes.value
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(strokeWidth) || strokeWidth <= 0) return null
    const sweep = Math.min(
        Math.max(0.5, (Number(spanMinutes) / MINUTES_PER_DAY) * FULL_CIRCLE_DEG),
        FULL_CIRCLE_DEG - 0.001
    )
    const stroke = autoOnlyBrightnessArc.value ? AUTO_BRIGHTNESS_WARM_HEX : `url(#${gradientId})`
    const startAngle = minuteToAngle(startMinutes.value)
    if (sweep >= FULL_CIRCLE_DEG - 0.01) {
        return { kind: 'circle', radius, width: strokeWidth, stroke, pulse: arcPulse.value }
    }
    const pieces = splitArcIntoPieces(startAngle, sweep)
    return {
        kind: 'path',
        path: describeArcPathFromPieces(radius, pieces),
        width: strokeWidth,
        stroke,
        pulse: arcPulse.value
    }
})


const scenarioArcGradientVector = computed(() => {
    if (autoOnlyBrightnessArc.value) return null
    const arc = scenarioArc.value
    if (!arc) return null
    const radius = arc.radius ?? geom.value.scheduleRadius
    const startPoint = angleToPoint(minuteToAngle(startMinutes.value), radius)
    const endPoint = angleToPoint(minuteToAngle(endMinutes.value), radius)
    const dx = (endPoint.x ?? 0) - (startPoint.x ?? 0)
    const dy = (endPoint.y ?? 0) - (startPoint.y ?? 0)
    if (Math.hypot(dx, dy) < 0.001) {
        return { x1: 0, y1: 0, x2: 200, y2: 200 }
    }
    return { x1: startPoint.x, y1: startPoint.y, x2: endPoint.x, y2: endPoint.y }
})

const conflictPopupEl = ref(null)
const conflictFormatterCache = new Map()

function getConflictFormatter(tzOverride = '') {
    const tz = tzOverride || props.timeZone || ''
    const key = tz || 'local'
    if (conflictFormatterCache.has(key)) return conflictFormatterCache.get(key)
    const opts = {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }
    if (tz) opts.timeZone = tz
    const fmt = new Intl.DateTimeFormat('ru-RU', opts)
    conflictFormatterCache.set(key, fmt)
    return fmt
}

function minutesFromTimestamp(ts, tz) {
    const date = ts != null ? new Date(ts) : null
    if (!date || Number.isNaN(date.getTime())) return null
    const parts = getConflictFormatter(tz).formatToParts(date)
    const hours = Number(parts.find((p) => p.type === 'hour')?.value)
    const minutes = Number(parts.find((p) => p.type === 'minute')?.value)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
    return ((hours * 60 + minutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

function formatOverlapWindow(window, tz) {
    if (!window?.start || !window?.end) return ''
    const fmt = getConflictFormatter(tz)
    return `${fmt.format(new Date(window.start))}–${fmt.format(new Date(window.end))}`
}

function formatConflictLabel(overlap) {
    const types = Array.isArray(overlap?.types) ? overlap.types : []
    if (types.includes('light.brightness')) return 'Наложение по яркости'
    if (types.includes('light.color.cct')) return 'Наложение по температуре'
    if (types.includes('light.color.hsv')) return 'Наложение по цвету'
    return 'Наложение'
}

const conflictSegments = computed(() => {
    const overlaps = Array.isArray(props.overlaps) ? props.overlaps : []
    if (!overlaps.length) return []
    const radius = geom.value.scheduleRadius
    const strokeWidth = Math.max(3, geom.value.scheduleStrokeWidth * 0.7)
    const minSpanMinutes = 6
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(strokeWidth) || strokeWidth <= 0) return []
    const segments = []
    overlaps.forEach((overlap) => {
        const windows = Array.isArray(overlap?.windows) ? overlap.windows : []
        windows.forEach((window) => {
            const startMin = minutesFromTimestamp(window.start, props.timeZone)
            const endMin = minutesFromTimestamp(window.end, props.timeZone)
            if (startMin == null || endMin == null) return
            const spanMinutes = Math.max(1, Math.round((window.end - window.start) / 60000))
            if (spanMinutes >= MINUTES_PER_DAY - 1) {
                segments.push({
                    kind: 'circle',
                    radius,
                    width: strokeWidth,
                    overlap,
                    window,
                    tz: props.timeZone
                })
                return
            }
            const adjustedEnd = startMin + Math.max(spanMinutes, minSpanMinutes)
            const startAngle = minuteToAngle(startMin)
            const endAngle = minuteToAngle(adjustedEnd)
            segments.push({
                kind: 'path',
                path: describeArcPath(radius, startAngle, endAngle),
                width: strokeWidth,
                overlap,
                window,
                tz: props.timeZone
            })
        })
    })
    return segments
})

const {
    conflictPopup,
    conflictPopupStyle,
    handleConflictHover,
    handleConflictClick,
    clearConflictPopup
} = useConflictPopup({
    orbitDialEl: dialElement,
    conflictPopupEl,
    formatOverlapWindow,
    formatConflictLabel
})

const scenarioBoundaryMarks = computed(() => {
    const radius = geom.value.scheduleRadius
    const width = geom.value.scheduleStrokeWidth
    if (!Number.isFinite(radius) || !Number.isFinite(width) || width <= 0) return null
    const span = scenarioSpanMinutes.value
    if (span >= MINUTES_PER_DAY - minuteStep) return null
    const startAngle = minuteToAngle(startMinutes.value)
    const endAngle = minuteToAngle(endMinutes.value)
    const markHalf = width / 6
    const inner = Math.max(0, radius - markHalf)
    const outer = radius + markHalf
    const autoColor = autoOnlyBrightnessArc.value ? AUTO_BRIGHTNESS_WARM_HEX : null
    return {
        start: {
            angle: startAngle,
            inner: angleToPoint(startAngle, inner),
            outer: angleToPoint(startAngle, outer),
            color: autoColor ?? gradientStartColor.value
        },
        end: {
            angle: endAngle,
            inner: angleToPoint(endAngle, inner),
            outer: angleToPoint(endAngle, outer),
            color: autoColor ?? gradientEndColor.value
        }
    }
})


const dialStyleVars = computed(() => {
    return {
        '--dial-face-inset': ratioToInsetPercent(geom.value.dialFaceInsetRatio),
        '--schedule-blur': `${geom.value.scheduleBlurPx}px`
    }
})

const currentNeedle = computed(() => {
    if (!Number.isFinite(props.currentMinute)) return null
    const angle = minuteToAngle(props.currentMinute)
    const needleOuter = geom.value.sunTimeRadiusUnits
    const needleInner = Math.max(needleOuter - 3, 40)
    return {
        start: angleToPoint(angle, needleInner),
        end: angleToPoint(angle, needleOuter)
    }
})

const evenHourGuides = computed(() => {
    const radius = geom.value.scheduleRadius
    const strokeWidth = geom.value.scheduleStrokeWidth
    if (!Number.isFinite(radius) || !Number.isFinite(strokeWidth)) return []
    const inner = radius - strokeWidth / 2
    const outer = radius + strokeWidth / 2
    const guides = []
    for (let hour = 0; hour < 24; hour += 2) {
        const minute = hour * 60
        const angle = minuteToAngle(minute)
        guides.push({
            minute,
            start: angleToPoint(angle, inner),
            end: angleToPoint(angle, outer)
        })
    }
    return guides
})

const handleOrbitRadius = computed(() => {
    const dialRadius = dialMetrics.radius
    if (!Number.isFinite(dialRadius) || dialRadius <= 0) return 0
    return (geom.value.scheduleRadius / FACE_CENTER) * dialRadius
})
const startHandleStyle = computed(() =>
    buildHandleStyle(positionForMinute(startMinutes.value, handleOrbitRadius.value, 0))
)
const endHandleStyle = computed(() =>
    buildHandleStyle(positionForMinute(endMinutes.value, handleOrbitRadius.value, 0))
)

function minuteToAngle(minute) {
    const normalized = normalizeMinutes(minute)
    return (normalized / MINUTES_PER_DAY) * FULL_CIRCLE_DEG + 90
}

function angleToPoint(angle, radius = FACE_RADIUS) {
    const rad = (normalizeDegrees(angle) * Math.PI) / 180
    return {
        x: FACE_CENTER + radius * Math.cos(rad),
        y: FACE_CENTER + radius * Math.sin(rad)
    }
}

function normalizeDegrees(angle) {
    const normalized = Number.isFinite(angle) ? angle % FULL_CIRCLE_DEG : 0
    return normalized < 0 ? normalized + FULL_CIRCLE_DEG : normalized
}

function splitArcIntoPieces(startAngle, sweep) {
    const normalizedStart = normalizeDegrees(startAngle)
    const normalizedSweep = Math.max(0, sweep)
    const endAngle = normalizedStart + normalizedSweep
    if (endAngle <= FULL_CIRCLE_DEG) {
        return [{ start: normalizedStart, end: endAngle }]
    }
    return [
        { start: normalizedStart, end: FULL_CIRCLE_DEG },
        { start: 0, end: endAngle - FULL_CIRCLE_DEG }
    ]
}

function describeArcPath(radius, startAngle, endAngle) {
    if (!Number.isFinite(radius) || radius <= 0) return ''
    const start = angleToPoint(startAngle, radius)
    const end = angleToPoint(endAngle, radius)
    const sweep = normalizeDegrees(endAngle - startAngle)
    const largeArc = sweep > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

function describeArcPathFromPieces(radius, pieces) {
    if (!Array.isArray(pieces) || pieces.length === 0) return ''
    if (pieces.length === 1) return describeArcPath(radius, pieces[0].start, pieces[0].end)
    const start = angleToPoint(pieces[0].start, radius)
    const end1 = angleToPoint(pieces[0].end, radius)
    const end2 = angleToPoint(pieces[1].end, radius)
    const sweep1 = normalizeDegrees(pieces[0].end - pieces[0].start)
    const sweep2 = normalizeDegrees(pieces[1].end - pieces[1].start)
    const large1 = sweep1 > 180 ? 1 : 0
    const large2 = sweep2 > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large1} 1 ${end1.x} ${end1.y} A ${radius} ${radius} 0 ${large2} 1 ${end2.x} ${end2.y}`
}

function minutesDiff(a, b) {
    let diff = Number(a) - Number(b)
    while (diff > HALF_DAY_MINUTES) diff -= MINUTES_PER_DAY
    while (diff < -HALF_DAY_MINUTES) diff += MINUTES_PER_DAY
    return diff
}

function clockwiseDuration(startMin, endMin) {
    let span = endMin - startMin
    if (span <= 0) span += MINUTES_PER_DAY
    if (!span || span <= 0) span = MINUTES_PER_DAY
    return span
}

function positionForMinute(minute, radiusOverride = null, radiusOffset = 30) {
    const dialRadius = dialMetrics.radius || 0
    if (!dialRadius || !Number.isFinite(minute)) return { x: dialRadius, y: dialRadius }
    const radius = radiusOverride != null ? radiusOverride : dialRadius - radiusOffset
    const angle = (minuteToAngle(minute) * Math.PI) / 180
    return {
        x: radius * Math.cos(angle) + dialRadius,
        y: radius * Math.sin(angle) + dialRadius
    }
}

function buildHandleStyle(coords) {
    if (!coords || !Number.isFinite(coords.x) || !Number.isFinite(coords.y)) return {}
    const size = mainHandleSize.value
    return {
        width: `${size}px`,
        height: `${size}px`,
        transform: `translate(${coords.x - size / 2}px, ${coords.y - size / 2}px)`
    }
}

function enqueueStopEmit(type, { immediate = false } = {}) {
    if (type !== 'start' && type !== 'end') return
    const state = stopEmitState[type]
    state.dirty = true
    maybeEmitStop(type, immediate)
}

function maybeEmitStop(type, immediate = false) {
    const state = stopEmitState[type]
    if (!state || !state.dirty) return
    const timestamp = now()
    if (!immediate && timestamp - state.lastEmit < HANDLE_EMIT_THROTTLE_MS) return
    state.lastEmit = timestamp
    state.dirty = false
    emitStopPayload(type)
}

function emitStopPayload(type) {
    if (type !== 'start' && type !== 'end') return
    const startSnapshot = snapshotStop(localStartStop)
    const endSnapshot = snapshotStop(localEndStop)
    if (type === 'start') emit('update:start-stop', startSnapshot)
    else emit('update:end-stop', endSnapshot)
    emit('change', { start: startSnapshot, end: endSnapshot })
}

function flushStopEmitForHandle(handle) {
    const type = handleToStopType(handle)
    if (!type) return
    maybeEmitStop(type, true)
}

function handleToStopType(handle) {
    if (handle === 'start') return 'start'
    if (handle === 'end') return 'end'
    return ''
}

function syncStopState(target, source) {
    const next = source ? { ...toRaw(source) } : {}
    Object.keys(target).forEach((key) => {
        if (!(key in next)) delete target[key]
    })
    Object.assign(target, next)
}

function snapshotStop(stop) {
    return { ...toRaw(stop) }
}

function now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now()
    }
    return Date.now()
}


function createTapGuard() {
    return {
        downAt: 0,
        moved: false,
        holdExceeded: false,
        timer: null,
        startX: 0,
        startY: 0
    }
}

function beginHandleTapTracking(type, event) {
    const guard = handleTapGuards[type]
    if (!guard) return
    if (guard.timer) {
        clearTimeout(guard.timer)
        guard.timer = null
    }
    guard.downAt = performance.now()
    guard.moved = false
    guard.holdExceeded = false
    guard.startX = event?.clientX ?? 0
    guard.startY = event?.clientY ?? 0
    guard.timer = setTimeout(() => {
        guard.holdExceeded = true
    }, HANDLE_TAP_HOLD_MS)
}

function markHandleTapMoved(type, event) {
    const guard = handleTapGuards[type]
    if (!guard || guard.moved || !event) return
    const dx = (event.clientX ?? 0) - (guard.startX ?? 0)
    const dy = (event.clientY ?? 0) - (guard.startY ?? 0)
    if (Math.hypot(dx, dy) >= HANDLE_TAP_MOVE_TOLERANCE) {
        guard.moved = true
    }
}

function releaseHandleTapTracking(type) {
    const guard = handleTapGuards[type]
    if (guard?.timer) {
        clearTimeout(guard.timer)
        guard.timer = null
    }
    guard.holdExceeded = false
    guard.moved = false
    guard.downAt = 0
    guard.startX = 0
    guard.startY = 0
}

function shouldOpenHandleEditor(type) {
    const guard = handleTapGuards[type]
    if (!guard) return true
    const downAt = guard.downAt
    const allow =
        downAt !== 0 && !guard.holdExceeded && !guard.moved && performance.now() - downAt <= HANDLE_TAP_HOLD_MS
    guard.downAt = 0
    guard.moved = false
    guard.holdExceeded = false
    if (guard.timer) {
        clearTimeout(guard.timer)
        guard.timer = null
    }
    return allow
}

function handleDialPointerDown(type, event) {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    readDialMetrics()
    draggingHandle.value = type
    const pointerMinutes = pointerToMinutes(event)
    dragState.activePointerMinutes = pointerMinutes
    dragState.accumulatedMinutes = 0
    dragState.handleStartMinutes =
        type === 'start' ? startMinutes.value : type === 'end' ? endMinutes.value : 0
    if (type === 'start' && localStartStop?.mode !== 'clock') suppressedSnapHandle.value = 'start'
    else if (type === 'end' && localEndStop?.mode !== 'clock') suppressedSnapHandle.value = 'end'
    else suppressedSnapHandle.value = ''
    if (type === 'start' || type === 'end') {
        beginHandleTapTracking(type, event)
    }
    event.target.setPointerCapture?.(event.pointerId)
}

function handleDialPointerMove(event) {
    if (!draggingHandle.value) return
    if (event.pointerType === 'touch') event.preventDefault()
    const pointerMinutes = pointerToMinutes(event)
    if (!Number.isFinite(pointerMinutes)) return
    const pointerDelta = minutesDiff(pointerMinutes, dragState.activePointerMinutes)
    dragState.activePointerMinutes = pointerMinutes
    dragState.accumulatedMinutes += pointerDelta
    const nextMinutes = normalizeMinutes(dragState.handleStartMinutes + dragState.accumulatedMinutes)
    let snappedMinutes = snapMinutes(nextMinutes, 'round')
    if (draggingHandle.value === 'start') {
        const end = endMinutes.value
        if (clockwiseDuration(snappedMinutes, end) < MIN_SCENARIO_SPAN_MINUTES) {
            snappedMinutes = normalizeMinutes(snapMinutes(end - MIN_SCENARIO_SPAN_MINUTES, 'floor'))
        }
        if (clockwiseDuration(snappedMinutes, end) > MAX_SCENARIO_SPAN_MINUTES) {
            snappedMinutes = normalizeMinutes(snapMinutes(end - MAX_SCENARIO_SPAN_MINUTES, 'ceil'))
        }
        markHandleTapMoved('start', event)
        if (suppressedSnapHandle.value === 'start') {
            toClockMode(localStartStop, snappedMinutes)
            suppressedSnapHandle.value = ''
            enqueueStopEmit('start')
            return
        }
        applyMinutes(localStartStop, snappedMinutes, 'start')
    } else if (draggingHandle.value === 'end') {
        const start = startMinutes.value
        if (clockwiseDuration(start, snappedMinutes) < MIN_SCENARIO_SPAN_MINUTES) {
            snappedMinutes = normalizeMinutes(snapMinutes(start + MIN_SCENARIO_SPAN_MINUTES, 'ceil'))
        }
        if (clockwiseDuration(start, snappedMinutes) > MAX_SCENARIO_SPAN_MINUTES) {
            snappedMinutes = normalizeMinutes(snapMinutes(start + MAX_SCENARIO_SPAN_MINUTES, 'floor'))
        }
        markHandleTapMoved('end', event)
        if (suppressedSnapHandle.value === 'end') {
            toClockMode(localEndStop, snappedMinutes)
            suppressedSnapHandle.value = ''
            enqueueStopEmit('end')
            return
        }
        applyMinutes(localEndStop, snappedMinutes, 'end')
    }
}

function handleDialPointerUp(event) {
    if (!draggingHandle.value) return
    const activeHandle = draggingHandle.value
    event?.target?.releasePointerCapture?.(event.pointerId)
    const isPrimary = activeHandle === 'start' || activeHandle === 'end'
    const tapAllowed = isPrimary && event?.type === 'pointerup' && shouldOpenHandleEditor(activeHandle)
    if (isPrimary) {
        releaseHandleTapTracking(activeHandle)
    }
    stopActiveDrag()
    flushStopEmitForHandle(activeHandle)
    if (tapAllowed) {
        const type = activeHandle === 'start' ? 'open-start-editor' : 'open-end-editor'
        requestAnimationFrame(() => emit(type))
    }
}

function handleDialPointerLeave() {
    if (!draggingHandle.value) return
    const activeHandle = draggingHandle.value
    if (activeHandle === 'start' || activeHandle === 'end') {
        releaseHandleTapTracking(activeHandle)
    }
    stopActiveDrag()
    flushStopEmitForHandle(activeHandle)
}

function handleDialPointerCancel(event) {
    if (!draggingHandle.value) return
    const activeHandle = draggingHandle.value
    event?.target?.releasePointerCapture?.(event.pointerId)
    if (activeHandle === 'start' || activeHandle === 'end') {
        releaseHandleTapTracking(activeHandle)
    }
    stopActiveDrag()
    flushStopEmitForHandle(activeHandle)
}

function stopActiveDrag() {
    draggingHandle.value = ''
    suppressedSnapHandle.value = ''
    dragState.activePointerMinutes = 0
    dragState.accumulatedMinutes = 0
    dragState.handleStartMinutes = 0
}

function pointerToMinutes(event) {
    const centerX = dialCenterX
    const centerY = dialCenterY
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return 0
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
    angleDeg = (angleDeg + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG
    const minutes = ((angleDeg - 90 + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG) * (MINUTES_PER_DAY / FULL_CIRCLE_DEG)
    return Math.round(minutes)
}

function normalizeMinutes(value) {
    let next = Number(value) % MINUTES_PER_DAY
    if (next < 0) next += MINUTES_PER_DAY
    return next
}

function snapMinutes(value, mode = 'round') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return 0
    const scaled = numeric / minuteStep
    if (mode === 'floor') return Math.floor(scaled) * minuteStep
    if (mode === 'ceil') return Math.ceil(scaled) * minuteStep
    return Math.round(scaled) * minuteStep
}

function toClockMode(stop, minutes) {
    if (!stop) return
    stop.mode = 'clock'
    stop.clockMinutes = normalizeMinutes(snapMinutes(minutes, 'round'))
    stop.offset = 0
}

function applyMinutes(stop, minutes, type) {
    if (!stop) return
    const snapped = detectAnchor(minutes)
    if (snapped) {
        stop.mode = snapped.mode
        stop.offset = snapped.offset
    } else {
        toClockMode(stop, minutes)
    }
    const adjusted = ensureMinScenarioSpan(type)
    const adjustedMax = ensureMaxScenarioSpan(type)
    if (type) enqueueStopEmit(type)
    if (adjusted && adjusted !== type) enqueueStopEmit(adjusted)
    if (adjustedMax && adjustedMax !== type) enqueueStopEmit(adjustedMax)
}

function isAnchoredStop(stop) {
    return stop?.mode === 'sunrise' || stop?.mode === 'sunset'
}

function setClockStop(type, minutes) {
    const normalized = normalizeMinutes(minutes)
    if (type === 'start') toClockMode(localStartStop, normalized)
    else if (type === 'end') toClockMode(localEndStop, normalized)
}

function ensureMinScenarioSpan(primaryType) {
    const start = stopMinutes(localStartStop)
    const end = stopMinutes(localEndStop)
    const span = clockwiseDuration(start, end)
    if (span >= MIN_SCENARIO_SPAN_MINUTES) return
    const startAnchored = isAnchoredStop(localStartStop)
    const endAnchored = isAnchoredStop(localEndStop)

    if (primaryType === 'end') {
        if (endAnchored && !startAnchored) {
            setClockStop('start', snapMinutes(end - MIN_SCENARIO_SPAN_MINUTES, 'floor'))
            return 'start'
        }
        setClockStop('end', snapMinutes(start + MIN_SCENARIO_SPAN_MINUTES, 'ceil'))
        return 'end'
    }

    if (primaryType === 'start') {
        if (startAnchored && !endAnchored) {
            setClockStop('end', snapMinutes(start + MIN_SCENARIO_SPAN_MINUTES, 'ceil'))
            return 'end'
        }
        setClockStop('start', snapMinutes(end - MIN_SCENARIO_SPAN_MINUTES, 'floor'))
        return 'start'
    }
}

function ensureMaxScenarioSpan(primaryType) {
    const start = stopMinutes(localStartStop)
    const end = stopMinutes(localEndStop)
    const span = clockwiseDuration(start, end)
    if (span <= MAX_SCENARIO_SPAN_MINUTES) return
    const startAnchored = isAnchoredStop(localStartStop)
    const endAnchored = isAnchoredStop(localEndStop)

    if (primaryType === 'end') {
        if (endAnchored && !startAnchored) {
            setClockStop('start', snapMinutes(end - MAX_SCENARIO_SPAN_MINUTES, 'ceil'))
            return 'start'
        }
        setClockStop('end', snapMinutes(start + MAX_SCENARIO_SPAN_MINUTES, 'floor'))
        return 'end'
    }

    if (primaryType === 'start') {
        if (startAnchored && !endAnchored) {
            setClockStop('end', snapMinutes(start + MAX_SCENARIO_SPAN_MINUTES, 'floor'))
            return 'end'
        }
        setClockStop('start', snapMinutes(end - MAX_SCENARIO_SPAN_MINUTES, 'ceil'))
        return 'start'
    }
}

function detectAnchor(minutes) {
    if (!Number.isFinite(minutes)) return null
    if (Number.isFinite(props.sunriseMinute)) {
        const sunriseDiff = minutesDiff(minutes, props.sunriseMinute)
        if (Math.abs(sunriseDiff) <= ANCHOR_SNAP_WINDOW_MINUTES) {
            return { mode: 'sunrise', offset: 0 }
        }
    }
    if (Number.isFinite(props.sunsetMinute)) {
        const sunsetDiff = minutesDiff(minutes, props.sunsetMinute)
        if (Math.abs(sunsetDiff) <= ANCHOR_SNAP_WINDOW_MINUTES) {
            return { mode: 'sunset', offset: 0 }
        }
    }
    return null
}

function stopMinutes(stop) {
    if (!stop) return 0
    if (stop.mode === 'sunrise') return normalizeMinutes((props.sunriseMinute || 0) + (stop.offset || 0))
    if (stop.mode === 'sunset') return normalizeMinutes((props.sunsetMinute || 0) + (stop.offset || 0))
    return normalizeMinutes(stop.clockMinutes || 0)
}

function stopLabelData(stop) {
    if (!stop) return { time: '', meta: '', isSun: false, anchor: '', isOffset: false }
    if (stop.mode === 'clock') {
        return { time: minutesToTimeString(stopMinutes(stop)), meta: '', isSun: false, anchor: '', isOffset: false }
    }
    const isSunrise = stop.mode === 'sunrise'
    const anchorWord = isSunrise ? 'рассвета' : 'заката'
    const anchorLabel = isSunrise ? 'Рассвет' : 'Закат'
    const anchorType = isSunrise ? 'sunrise' : 'sunset'
    const anchorMinutes = isSunrise ? props.sunriseMinute : props.sunsetMinute
    const offset = stop.offset || 0
    const actualTime = minutesToTimeString(normalizeMinutes((anchorMinutes || 0) + offset))
    if (offset === 0) {
        return { time: actualTime, meta: anchorLabel, isSun: true, anchor: anchorType, isOffset: false }
    }
    const abs = Math.abs(offset)
    const hours = Math.floor(abs / 60)
    const minutes = abs % 60
    let unit = ''
    if (hours && minutes) unit = `${hours} ч ${minutes} мин`
    else if (hours) unit = `${hours} ч`
    else unit = `${minutes || abs} мин`
    const phrase = offset > 0 ? `Через ${unit} после ${anchorWord}` : `За ${unit} до ${anchorWord}`
    return { time: actualTime, meta: phrase, isSun: true, anchor: anchorType, isOffset: true }
}

function minutesToTimeString(minute) {
    const value = normalizeMinutes(minute)
    const hours = Math.floor(value / 60)
    const mins = value % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}
</script>

<template>
    <section class="dial-section">
        <div class="time-header">
            <button type="button" class="time-chip start" @click="emit('open-start-editor')">
                <span class="time-chip-label">Старт</span>
                <div class="time-chip-value">
                    <div class="time-chip-main" :class="{ offset: startLabel.isSun }">
                        <strong class="time-chip-time">{{ startLabel.time }}</strong>

                    </div>
                    <span v-if="startLabel.meta" class="time-chip-meta">{{
                        startLabel.meta }}</span>
                </div>
            </button>
            <button type="button" class="time-chip end" @click="emit('open-end-editor')">
                <span class="time-chip-label">Финиш</span>
                <div class="time-chip-value">
                    <div class="time-chip-main" :class="{ offset: endLabel.isSun }">
                        <strong class="time-chip-time">{{ endLabel.time }}</strong>

                    </div>
                    <span v-if="endLabel.meta" class="time-chip-meta">{{
                        endLabel.meta }}</span>
                </div>
            </button>
        </div>

        <div ref="dialElement" :class="['dial', { inactive: dialInactive }]" :style="dialStyleVars"
            @pointermove="handleDialPointerMove" @pointerup="handleDialPointerUp"
            @pointercancel="handleDialPointerCancel" @pointerleave="handleDialPointerLeave">
            <button v-if="isPaused" type="button" class="pause-overlay" @click="emit('resume')">
                ▶
            </button>

            <div class="outer-ring"></div>

            <svg class="scenario-ring-overlay" viewBox="0 0 200 200">
                <defs>
                    <linearGradient v-if="scenarioArc && scenarioArcGradientVector" :id="gradientId"
                        gradientUnits="userSpaceOnUse" :x1="scenarioArcGradientVector.x1"
                        :y1="scenarioArcGradientVector.y1" :x2="scenarioArcGradientVector.x2"
                        :y2="scenarioArcGradientVector.y2">
                        <stop offset="0%" :stop-color="gradientStartColor" />
                        <stop offset="100%" :stop-color="gradientEndColor" />
                    </linearGradient>
                </defs>
                <g v-if="scenarioArc" class="scenario-ring-group">
                    <path v-if="scenarioArc.kind === 'path'" :d="scenarioArc.path" :stroke="scenarioArc.stroke"
                        :stroke-width="scenarioArc.width" :class="{ pulse: scenarioArc.pulse }" />
                    <circle v-else-if="scenarioArc.kind === 'circle'" cx="100" cy="100" :r="scenarioArc.radius"
                        fill="none" :stroke="scenarioArc.stroke" :stroke-width="scenarioArc.width"
                        :class="{ pulse: scenarioArc.pulse }" />
                </g>
                <g v-if="conflictSegments.length" class="scenario-conflicts" @pointerleave="clearConflictPopup">
                    <template v-for="(segment, idx) in conflictSegments" :key="`conflict-${idx}`">
                        <path v-if="segment.kind === 'path'" class="scenario-conflict-hit" :d="segment.path"
                            :stroke-width="segment.width" @pointerdown.stop
                            @pointerenter="(event) => handleConflictHover(segment, event)"
                            @pointerleave="clearConflictPopup"
                            @click.stop="(event) => handleConflictClick(segment, event)" />
                        <path v-if="segment.kind === 'path'" :d="segment.path" :stroke="CONFLICT_STROKE"
                            :stroke-width="segment.width" />
                        <circle v-else-if="segment.kind === 'circle'" class="scenario-conflict-hit" cx="100" cy="100"
                            :r="segment.radius" fill="none" :stroke-width="segment.width" @pointerdown.stop
                            @pointerenter="(event) => handleConflictHover(segment, event)"
                            @pointerleave="clearConflictPopup"
                            @click.stop="(event) => handleConflictClick(segment, event)" />
                        <circle v-else-if="segment.kind === 'circle'" cx="100" cy="100" :r="segment.radius" fill="none"
                            :stroke="CONFLICT_STROKE" :stroke-width="segment.width" />
                    </template>
                </g>
                <g v-if="scenarioBoundaryMarks" class="scenario-boundaries">
                    <line class="scenario-boundary" :x1="scenarioBoundaryMarks.start.inner.x"
                        :y1="scenarioBoundaryMarks.start.inner.y" :x2="scenarioBoundaryMarks.start.outer.x"
                        :y2="scenarioBoundaryMarks.start.outer.y" />
                    <line class="scenario-boundary" :x1="scenarioBoundaryMarks.end.inner.x"
                        :y1="scenarioBoundaryMarks.end.inner.y" :x2="scenarioBoundaryMarks.end.outer.x"
                        :y2="scenarioBoundaryMarks.end.outer.y" />
                </g>
            </svg>

            <svg class="sun-marker-overlay" viewBox="0 0 200 200">
                <line v-if="currentNeedle" class="current-needle" :x1="currentNeedle.start.x"
                    :y1="currentNeedle.start.y" :x2="currentNeedle.end.x" :y2="currentNeedle.end.y" />
            </svg>

            <div class="dial-face">
                <svg viewBox="0 0 200 200" class="dial-face-svg">
                    <DialFace :sunrise-minute="sunriseMinute" :sunset-minute="sunsetMinute" />
                </svg>
            </div>

            <div v-if="showDialCenter" class="dial-center-info">
                <div class="dial-center-title">Сейчас</div>
                <div v-if="showDialCenterColor" class="dial-center-color">
                    <span v-if="showDialCenterLabel" class="dial-center-label">Цвет:</span>
                    <span class="dial-center-swatch" :style="dialCenterSwatchStyle"></span>
                    <span v-if="showDialCenterTemp" class="dial-center-temp">
                        {{ dialCenterState.temperature }}K
                    </span>
                </div>
                <div v-if="dialCenterState?.brightness" class="dial-center-brightness">
                    {{ dialCenterState.brightness }}
                </div>
            </div>

            <div v-if="conflictPopup" ref="conflictPopupEl" class="conflict-hint" :style="conflictPopupStyle">
                <span>{{ conflictPopup.time }}</span>
                <span>{{ conflictPopup.label }}</span>
            </div>

            <button class="dial-handle start" :style="startHandleStyle"
                @pointerdown="(event) => handleDialPointerDown('start', event)" aria-label="Старт"></button>
            <button class="dial-handle end" :style="endHandleStyle"
                @pointerdown="(event) => handleDialPointerDown('end', event)" aria-label="Финиш"></button>
        </div>
    </section>
</template>

<style scoped>
/* Styles retained from the previous dial implementation */
.dial-section {
    padding: 0 0px;

}

.time-header {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 16px;
}

.time-chip {
    border: none;
    background: transparent;
    color: inherit;
    border-radius: 0;
    padding: 0;
    text-align: center;
    min-height: 64px;
    gap: 4px;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
}

.time-chip-label {
    display: block;
    font-size: 12px;
    color: #a5b4fc;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.time-chip-value {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    height: 44px;
}

.time-chip-main {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
}

.time-chip-main.offset {
    padding-left: 0;
}

.time-chip-time {
    display: block;
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1;
}

.time-chip-sun {
    font-size: 18px;
    line-height: 1;
    color: #f59e0b;
    margin-top: 0;
    display: inline-flex;
    align-items: center;
}

.sun-icon {
    width: 24px;
    height: 24px;
    stroke: currentColor;
    stroke-width: 2.2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    transform: translateY(-2px);
}

.sun-core,
.sun-arrow,
.sun-rays {
    stroke: #f9c316;
}

.time-chip-meta {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
}

.dial {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    overflow: visible;
    touch-action: pan-y;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    background: transparent;
    --dial-face-inset: 14%;
}

.dial * {
    -webkit-tap-highlight-color: transparent;
}

.pause-overlay {
    position: absolute;
    inset: 40% auto auto 40%;
    width: 20%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    border: 2px solid #111827;
    background: #f59e0b;
    color: #111827;
    font-size: clamp(18px, 5vw, 28px);
    z-index: 6;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-left: 5px;
}

.dial.inactive {
    filter: grayscale(0.6) brightness(0.9);
    opacity: 0.85;
}

.outer-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    z-index: 1;
    background: var(--bg-primary);
    box-shadow:
        inset 0 0 28px rgba(0, 0, 0, 0.65),
        inset 0 0 120px rgba(0, 0, 0, 0.45);
}

.outer-ring::after {
    content: '';
    position: absolute;
    inset: var(--dial-face-inset);
    border-radius: 50%;
    box-shadow:
        inset 0 0 0 1px rgba(0, 0, 0, 0.7),
        inset 0 10px 20px rgba(0, 0, 0, 0.35);
    pointer-events: none;
}

.dial-face {
    position: absolute;
    top: var(--dial-face-inset);
    right: var(--dial-face-inset);
    bottom: var(--dial-face-inset);
    left: var(--dial-face-inset);
    border-radius: 50%;
    background: var(--surface-card);
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}

.dial-face-svg {
    width: 100%;
    height: 100%;
    position: relative;
}

.dial-face-bg {
    fill: transparent;
}

.dial-center-info {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    z-index: 6;
    pointer-events: none;
    color: var(--text-primary);
}

.dial-center-title {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
}

.dial-center-color {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
}

.dial-center-label {
    color: var(--text-muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.dial-center-swatch {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgba(15, 23, 42, 0.65);
    box-shadow: 0 0 0 2px rgba(248, 250, 252, 0.12);
}

.dial-center-temp {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
}

.dial-center-brightness {
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
}

@keyframes dial-segment-pulse {
    0% {
        opacity: 0.6;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0.6;
    }
}

.current-needle {
    stroke: #f87171;
    stroke-width: 2px;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.45));
    pointer-events: none;
}

.scenario-ring-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
    filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.3)) drop-shadow(0 0 var(--schedule-blur, 12px) rgba(255, 255, 255, 0.08));
    pointer-events: auto;
}

.sun-marker-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 5;
    pointer-events: none;
}

.scenario-ring-group path,
.scenario-ring-group circle {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.95;
    shape-rendering: geometricPrecision;
    pointer-events: none;
}

.hour-guides line {
    stroke: rgba(255, 255, 255, 0.16);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
}

.scenario-conflicts path,
.scenario-conflicts circle {
    fill: none;
    stroke-dasharray: 1 4;
    opacity: 1;
    pointer-events: auto;
}

.scenario-conflicts {
    opacity: 1;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.35));
}

.scenario-conflict-hit {
    stroke: transparent;
    stroke-dasharray: none;
    stroke-linecap: round;
    pointer-events: stroke;
    cursor: pointer;
}

.conflict-hint {
    position: absolute;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 16px;
    padding: 8px 12px;
    color: #e2e8f0;
    display: grid;
    gap: 4px;
    font-size: 12px;
    width: max-content;
    max-width: 220px;
    pointer-events: none;
    z-index: 30;
}

.scenario-cap {
    opacity: 0.98;
}

.scenario-cap.pulse {
    animation: dial-segment-pulse 3s ease-in-out infinite;
}

.scenario-boundary {
    stroke: #030712;
    stroke-width: 1px;
    stroke-linecap: round;
}

.scenario-ring-group path.pulse,
.scenario-ring-group circle.pulse {
    animation: dial-segment-pulse 3s ease-in-out infinite;
}

.dial-handle {
    position: absolute;
    border-radius: 50%;
    border: none;
    padding: 0;
    cursor: grab;
    touch-action: none;
    z-index: 7;
    background: transparent;
    box-shadow: none;
    opacity: 0;
}

.dial-handle:active {
    cursor: grabbing;
}

.dial.inactive .dial-handle,
.dial.inactive .scenario-ring-group path,
.dial.inactive .scenario-ring-group circle {
    opacity: 0.65;
}
</style>
