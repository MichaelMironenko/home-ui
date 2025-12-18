<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { blendHex, stopColorHex } from '../../utils/colorUtils'

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
const DIAL_FACE_MIN_GAP_PX = 44
const DIAL_FACE_GAP_FRACTION = 0.25
const ARC_PADDING_PX = 5
const TICK_EDGE_RATIO = 20
const SUN_TIME_EDGE_RATIO = 20
const NUMBER_RADIUS_RATIO = 3.6
const MIN_SCENARIO_SPAN_MINUTES = 10
const ANCHOR_SNAP_WINDOW_MINUTES = 5
const DIAL_DAY_COLOR = 'rgba(255, 216, 170, 0.82)'
const DIAL_NIGHT_COLOR = 'rgba(96, 165, 220, 0.62)'
const HANDLE_TAP_HOLD_MS = 300
const HANDLE_TAP_MOVE_TOLERANCE = 6
const minuteStep = 5
const MINUTES_PER_DAY = 1440
const HALF_DAY_MINUTES = MINUTES_PER_DAY / 2
const FULL_CIRCLE_DEG = 360
const HANDLE_EMIT_THROTTLE_MS = 80
const AUTO_BRIGHTNESS_WARM_HEX = '#fff4dd'

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

const draggingPrimaryHandle = computed(
    () => draggingHandle.value === 'start' || draggingHandle.value === 'end'
)

const dialScale = computed(() => {
    const size = dialMetrics.size || BASE_DIAL_SIZE
    const scale = size / BASE_DIAL_SIZE
    return Math.min(Math.max(scale, 0.55), 1.6)
})
const mainHandleSize = computed(() => 40 * dialScale.value)

const ratioToInsetPercent = (ratio) => `${(((1 - ratio) / 2) * 100).toFixed(4)}%`

const unitsPerPx = computed(() => {
    const radiusPx = dialMetrics.radius || BASE_DIAL_SIZE / 2
    return FACE_CENTER / Math.max(1, radiusPx)
})

const dialRadiusUnits = computed(() => FACE_CENTER)
const dialFaceRadiusUnits = computed(() => {
    const dialRadiusPx = dialMetrics.radius || BASE_DIAL_SIZE / 2
    const gapPx = Math.max(DIAL_FACE_MIN_GAP_PX, dialRadiusPx * DIAL_FACE_GAP_FRACTION)
    const faceRadius = dialRadiusUnits.value - gapPx * unitsPerPx.value
    return Math.max(40, Math.min(FACE_RADIUS, faceRadius))
})

const tickOuterRadiusUnits = computed(() => dialFaceRadiusUnits.value - dialFaceRadiusUnits.value / TICK_EDGE_RATIO)
const sunTimeRadiusUnits = computed(() => dialFaceRadiusUnits.value - dialFaceRadiusUnits.value / SUN_TIME_EDGE_RATIO)

const tickOuterRadiusNorm = computed(() => FACE_CENTER - FACE_CENTER / TICK_EDGE_RATIO)
const numberRadiusNorm = computed(() => FACE_CENTER - FACE_CENTER / NUMBER_RADIUS_RATIO)

const arcPaddingUnits = computed(() => ARC_PADDING_PX * unitsPerPx.value)
const arcOuterEdgeUnits = computed(() => dialRadiusUnits.value - arcPaddingUnits.value)
const arcInnerEdgeUnits = computed(() => dialFaceRadiusUnits.value + arcPaddingUnits.value)
const scheduleRadius = computed(() => (arcOuterEdgeUnits.value + arcInnerEdgeUnits.value) / 2)
const scheduleStrokeWidth = computed(() => Math.max(6, arcOuterEdgeUnits.value - arcInnerEdgeUnits.value))

const dialFaceInsetRatio = computed(() => Math.max(0.2, Math.min(0.95, dialFaceRadiusUnits.value / FACE_CENTER)))
const scheduleBlurPx = computed(() => {
    const strokePx = scheduleStrokeWidth.value / unitsPerPx.value
    return Math.max(6, strokePx * 0.35)
})

const startMinutes = computed(() => stopMinutes(localStartStop))
const endMinutes = computed(() => stopMinutes(localEndStop))
const startLabel = computed(() => stopLabel(localStartStop))
const endLabel = computed(() => stopLabel(localEndStop))
const startLabelCompact = computed(
    () => localStartStop?.mode !== 'clock' && (localStartStop?.offset || 0) !== 0
)
const endLabelCompact = computed(
    () => localEndStop?.mode !== 'clock' && (localEndStop?.offset || 0) !== 0
)
const gradientStartColor = computed(() => stopColorHex(localStartStop))
const gradientEndColor = computed(() => stopColorHex(localEndStop))
const dialInactive = computed(() => ['off', 'paused'].includes(props.scenarioStatus))
const isPaused = computed(() => props.scenarioStatus === 'paused')

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

function handleWindowResize() {
    scheduleReadDialMetrics()
}

function handleWindowScroll() {
    scheduleReadDialMetrics()
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
        window.addEventListener('resize', handleWindowResize)
        window.addEventListener('scroll', handleWindowScroll, { passive: true })
    }
})

onUnmounted(() => {
    if (metricsReadHandle && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(metricsReadHandle)
        metricsReadHandle = 0
    }
    resizeObserver.value?.disconnect()
    if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleWindowResize)
        window.removeEventListener('scroll', handleWindowScroll)
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

const scenarioSegments = computed(() => {
    const start = startMinutes.value
    const end = endMinutes.value
    if (!Number.isFinite(start) || !Number.isFinite(end)) return []
    const span = clampScenarioSpan(clockwiseDuration(start, end))
    const segments = []
    const startColor = gradientStartColor.value
    const endColor = gradientEndColor.value
    const autoOnlyBrightness =
        props.autoBrightness && !localStartStop?.useColor && !localEndStop?.useColor
    const pulseSegments = props.autoBrightness && (localStartStop?.useColor || localEndStop?.useColor)
    if (autoOnlyBrightness) {
        segments.push({
            key: 'auto-single',
            startMinute: start,
            spanMinutes: span,
            color: AUTO_BRIGHTNESS_WARM_HEX,
            pulse: true,
            single: true
        })
    } else {
        const coarseSegments = Math.max(1, Math.floor(span / 5))
        const segmentCount = Math.min(20, Math.max(1, coarseSegments))
        const segmentLength = span / segmentCount
        const effectiveCount = segmentCount || 1
        for (let index = 0; index < effectiveCount; index++) {
            const segStart = start + segmentLength * index
            const spanMinutes =
                index === effectiveCount - 1 ? span - segmentLength * (effectiveCount - 1) : segmentLength
            const ratio = effectiveCount === 1 ? 0 : index / (effectiveCount - 1)
            segments.push({
                key: `segment-${index}`,
                startMinute: normalizeMinutes(segStart),
                spanMinutes,
                color: blendHex(startColor, endColor, ratio),
                pulse: pulseSegments,
                single: false
            })
        }
    }
    return segments
        .filter((segment) => Number(segment?.spanMinutes) > 0)
        .map((segment) => ({
            ...segment,
            startMinute: normalizeMinutes(segment.startMinute),
            spanMinutes: Number(segment.spanMinutes)
        }))
})

function clampScenarioSpan(spanMinutes) {
    const span = Number(spanMinutes) || 0
    if (span <= 0) return MIN_SCENARIO_SPAN_MINUTES
    if (span >= MINUTES_PER_DAY) return MINUTES_PER_DAY
    return Math.max(MIN_SCENARIO_SPAN_MINUTES, span)
}

const scenarioRingArcs = computed(() => {
    const radius = scheduleRadius.value
    const strokeWidth = scheduleStrokeWidth.value
    if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(strokeWidth) || strokeWidth <= 0) return []
    const arcs = []
    scenarioSegments.value.forEach((segment) => {
        const sweep = Math.min(
            Math.max(0.5, (Number(segment.spanMinutes) / MINUTES_PER_DAY) * FULL_CIRCLE_DEG),
            FULL_CIRCLE_DEG - 0.001
        )
        const startAngle = minuteToAngle(segment.startMinute || 0)
        const pieces = splitArcIntoPieces(startAngle, sweep)
        pieces.forEach((piece, index) => {
            arcs.push({
                key: `${segment.key}-arc-${index}`,
                path: describeArcPath(radius, piece.start, piece.end),
                color: segment.color,
                pulse: segment.pulse,
                single: segment.single,
                width: strokeWidth
            })
        })
    })
    return arcs
})

const scenarioBoundaryMarks = computed(() => {
    const radius = scheduleRadius.value
    const width = scheduleStrokeWidth.value
    if (!Number.isFinite(radius) || !Number.isFinite(width) || width <= 0) return null
    const startAngle = minuteToAngle(startMinutes.value)
    const endAngle = minuteToAngle(endMinutes.value)
    const markHalf = width / 6
    const inner = Math.max(0, radius - markHalf)
    const outer = radius + markHalf
    return {
        start: {
            angle: startAngle,
            cap: angleToPoint(startAngle, radius),
            inner: angleToPoint(startAngle, inner),
            outer: angleToPoint(startAngle, outer),
            color: gradientStartColor.value
        },
        end: {
            angle: endAngle,
            cap: angleToPoint(endAngle, radius),
            inner: angleToPoint(endAngle, inner),
            outer: angleToPoint(endAngle, outer),
            color: gradientEndColor.value
        },
        capRadius: width / 2
    }
})

function semicircleCapPath(radius) {
    const r = Math.max(0, Number(radius) || 0)
    if (r <= 0) return ''
    return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} L 0 ${-r} Z`
}

const dialStyleVars = computed(() => {
    return {
        '--dial-face-inset': ratioToInsetPercent(dialFaceInsetRatio.value),
        '--schedule-blur': `${scheduleBlurPx.value}px`
    }
})

const currentNeedle = computed(() => {
    if (!Number.isFinite(props.currentMinute)) return null
    const angle = minuteToAngle(props.currentMinute)
    const needleOuter = sunTimeRadiusUnits.value
    const needleInner = Math.max(needleOuter - 3, 40)
    return {
        start: angleToPoint(angle, needleInner),
        end: angleToPoint(angle, needleOuter)
    }
})

function isMinuteInDay(minute) {
    const sunrise = normalizeMinutes(props.sunriseMinute || 0)
    const sunset = normalizeMinutes(props.sunsetMinute || 0)
    const value = normalizeMinutes(minute)
    if (sunrise === sunset) return true
    if (sunrise < sunset) return value >= sunrise && value < sunset
    return value >= sunrise || value < sunset
}

const hourLabels = computed(() => Array.from({ length: 12 }, (_, i) => i * 2))
const innerTickMarks = computed(() => {
    const tickCount = 96
    const outer = tickOuterRadiusNorm.value
    const majorInner = outer - 8
    const hourInner = outer - 7
    const minorInner = outer - 4
    return Array.from({ length: tickCount }, (_, index) => {
        const minute = (index / tickCount) * MINUTES_PER_DAY
        const angle = minuteToAngle(minute)
        const isMajor = index % 8 === 0
        const isHour = index % 4 === 0
        const start = angleToPoint(angle, outer)
        const end = angleToPoint(angle, isMajor ? majorInner : isHour ? hourInner : minorInner)
        const day = isMinuteInDay(minute)
        const color = day ? DIAL_DAY_COLOR : DIAL_NIGHT_COLOR
        return {
            index,
            major: isMajor,
            hour: isHour,
            day,
            color,
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y
        }
    })
})

const innerHourNumberItems = computed(() => {
    const radius = numberRadiusNorm.value
    return hourLabels.value.map((hour) => {
        const minute = hour * 60
        const angle = minuteToAngle(minute)
        const coord = angleToPoint(angle, radius)
        const day = isMinuteInDay(minute)
        const major = hour % 6 === 0
        const color = day ? DIAL_DAY_COLOR : DIAL_NIGHT_COLOR
        return {
            hour,
            x: coord.x,
            y: coord.y,
            major,
            color
        }
    })
})
const handleOrbitRadius = computed(() => {
    const dialRadius = dialMetrics.radius
    if (!Number.isFinite(dialRadius) || dialRadius <= 0) return 0
    return (scheduleRadius.value / FACE_CENTER) * dialRadius
})
const startHandleStyle = computed(() =>
    buildHandleStyle(positionForMinute(startMinutes.value, handleOrbitRadius.value, 0), 'start')
)
const endHandleStyle = computed(() =>
    buildHandleStyle(positionForMinute(endMinutes.value, handleOrbitRadius.value, 0), 'end')
)

function minuteToAngle(minute) {
    const normalized = normalizeMinutes(minute)
    return (normalized / MINUTES_PER_DAY) * FULL_CIRCLE_DEG + 90
}

function angleToPoint(angle, radius = FACE_RADIUS) {
    const rad = (angle * Math.PI) / 180
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

function buildHandleStyle(coords, type) {
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
    let snappedMinutes = snapMinutesValue(nextMinutes)
    if (draggingHandle.value === 'start') {
        const end = endMinutes.value
        if (clockwiseDuration(snappedMinutes, end) < MIN_SCENARIO_SPAN_MINUTES) {
            snappedMinutes = normalizeMinutes(snapMinutesFloor(end - MIN_SCENARIO_SPAN_MINUTES))
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
            snappedMinutes = normalizeMinutes(snapMinutesCeil(start + MIN_SCENARIO_SPAN_MINUTES))
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

function snapMinutesValue(value) {
    if (!Number.isFinite(value)) return 0
    return Math.round(value / minuteStep) * minuteStep
}

function snapMinutesFloor(value) {
    if (!Number.isFinite(value)) return 0
    const step = minuteStep
    const scaled = Math.floor(value / step) * step
    return scaled
}

function snapMinutesCeil(value) {
    if (!Number.isFinite(value)) return 0
    const step = minuteStep
    const scaled = Math.ceil(value / step) * step
    return scaled
}

function toClockMode(stop, minutes) {
    if (!stop) return
    stop.mode = 'clock'
    stop.clockMinutes = normalizeMinutes(snapMinutesValue(minutes))
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
    ensureMinScenarioSpan(type)
    if (type) enqueueStopEmit(type)
}

function isAnchoredStop(stop) {
    return stop?.mode === 'sunrise' || stop?.mode === 'sunset'
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
            const desiredStart = snapMinutesFloor(end - MIN_SCENARIO_SPAN_MINUTES)
            toClockMode(localStartStop, normalizeMinutes(desiredStart))
            enqueueStopEmit('start')
            return
        }
        const desiredEnd = snapMinutesCeil(start + MIN_SCENARIO_SPAN_MINUTES)
        toClockMode(localEndStop, normalizeMinutes(desiredEnd))
        enqueueStopEmit('end')
        return
    }

    if (primaryType === 'start') {
        if (startAnchored && !endAnchored) {
            const desiredEnd = snapMinutesCeil(start + MIN_SCENARIO_SPAN_MINUTES)
            toClockMode(localEndStop, normalizeMinutes(desiredEnd))
            enqueueStopEmit('end')
            return
        }
        const desiredStart = snapMinutesFloor(end - MIN_SCENARIO_SPAN_MINUTES)
        toClockMode(localStartStop, normalizeMinutes(desiredStart))
        enqueueStopEmit('start')
        return
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

function stopLabel(stop) {
    if (!stop) return ''
    if (stop.mode === 'clock') return minutesToTimeString(stopMinutes(stop))
    const isSunrise = stop.mode === 'sunrise'
    const anchorWord = isSunrise ? 'рассвета' : 'заката'
    const anchorLabel = isSunrise ? 'Рассвет' : 'Закат'
    const anchorMinutes = isSunrise ? props.sunriseMinute : props.sunsetMinute
    const anchorTime = minutesToTimeString(anchorMinutes || 0)
    const offset = stop.offset || 0
    const actualTime = minutesToTimeString(normalizeMinutes((anchorMinutes || 0) + offset))
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
                <span>Старт</span>
                <strong :class="{ compact: startLabelCompact }">{{ startLabel }}</strong>
            </button>
            <button type="button" class="time-chip end" @click="emit('open-end-editor')">
                <span>Финиш</span>
                <strong :class="{ compact: endLabelCompact }">{{ endLabel }}</strong>
            </button>
        </div>

        <div ref="dialElement" :class="['dial', { inactive: dialInactive }]" :style="dialStyleVars"
            @pointermove="handleDialPointerMove" @pointerup="handleDialPointerUp"
            @pointercancel="handleDialPointerCancel" @pointerleave="handleDialPointerLeave">
            <button v-if="isPaused" type="button" class="pause-overlay" @click="emit('resume')">
                ⏯
            </button>

            <div class="outer-ring"></div>

            <svg class="scenario-ring-overlay" viewBox="0 0 200 200">
                <g class="scenario-ring-group">
                    <path v-for="arc in scenarioRingArcs" :key="arc.key" :d="arc.path" :stroke="arc.color"
                        :stroke-width="arc.width" :class="{ pulse: arc.pulse, single: arc.single }" />
                </g>
                <g v-if="scenarioBoundaryMarks" class="scenario-caps">
                    <g class="scenario-cap-group"
                        :transform="`translate(${scenarioBoundaryMarks.start.cap.x} ${scenarioBoundaryMarks.start.cap.y}) rotate(${scenarioBoundaryMarks.start.angle - 90})`">
                        <path class="scenario-cap" :d="semicircleCapPath(scenarioBoundaryMarks.capRadius)"
                            :fill="scenarioBoundaryMarks.start.color" />
                    </g>
                    <g class="scenario-cap-group"
                        :transform="`translate(${scenarioBoundaryMarks.end.cap.x} ${scenarioBoundaryMarks.end.cap.y}) rotate(${scenarioBoundaryMarks.end.angle + 90})`">
                        <path class="scenario-cap" :d="semicircleCapPath(scenarioBoundaryMarks.capRadius)"
                            :fill="scenarioBoundaryMarks.end.color" />
                    </g>
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
                    <circle class="dial-face-bg" cx="100" cy="100" :r="FACE_CENTER" />
                    <g class="face-ticks">
                        <line v-for="tick in innerTickMarks" :key="tick.index" :stroke="tick.color"
                            :class="{ major: tick.major, hour: tick.hour }" :x1="tick.x1" :y1="tick.y1" :x2="tick.x2"
                            :y2="tick.y2" />
                    </g>
                    <g class="face-hours">
                        <text v-for="item in innerHourNumberItems" :key="item.hour" class="face-hour"
                            :class="{ major: item.major }" :x="item.x" :y="item.y" :fill="item.color">
                            {{ item.hour }}
                        </text>
                    </g>
                </svg>
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
    padding: 0 16px;

}

.time-header {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-items: flex-start;
    margin-bottom: 8px;
}

.time-chip {
    border: none;
    background: transparent;
    color: inherit;
    border-radius: 0;
    padding: 0;
    text-align: center;
    min-height: 80px;
    gap: 4px;
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
}

.time-chip span {
    display: block;
    font-size: 12px;
    color: #a5b4fc;
    text-transform: uppercase;
    letter-spacing: 0.08em;
}

.time-chip strong {
    display: block;
    margin-top: 4px;
    font-size: 18px;
    font-weight: 600;
}

.time-chip strong.compact {
    font-size: 14px;
    line-height: 1.35;
}

.dial {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    overflow: visible;
    touch-action: pan-y;
    background: transparent;
    --dial-face-inset: 14%;
}

.pause-overlay {
    position: absolute;
    inset: 40% auto auto 40%;
    width: 20%;
    aspect-ratio: 1 / 1;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.7);
    background: rgba(0, 0, 0, 0.5);
    color: #e5e7eb;
    font-size: clamp(18px, 5vw, 28px);
    z-index: 6;
    cursor: pointer;
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
        0 18px 46px rgba(0, 0, 0, 0.55),
        inset 0 0 28px rgba(0, 0, 0, 0.65),
        inset 0 0 120px rgba(0, 0, 0, 0.45);
}

.outer-ring::after {
    content: '';
    position: absolute;
    inset: var(--dial-face-inset);
    border-radius: 50%;
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.06),
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
    box-shadow:
        inset 0 0 160px rgba(0, 0, 0, 0.5),
        inset 0 0 40px rgba(255, 255, 255, 0.05);
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

.face-ticks line {
    stroke-linecap: round;
    stroke-width: 1px;
}

.face-ticks line.hour {
    stroke-width: 1px;
}

.face-ticks line.major {
    stroke-width: 1px;
}

.face-hour {
    font-size: 14px;
    font-weight: 600;
    dominant-baseline: middle;
    text-anchor: middle;
    letter-spacing: 0.04em;
}

.face-hour.major {
    /* color comes from :fill binding */
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
    pointer-events: none;
}

.sun-marker-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 5;
    pointer-events: none;
}

.scenario-ring-group path {
    fill: none;
    stroke-linecap: butt;
    stroke-linejoin: bevel;
    opacity: 0.95;
}

.scenario-cap {
    opacity: 0.98;
}

.scenario-boundary {
    stroke: #030712;
    stroke-width: 1px;
    stroke-linecap: round;

}

.scenario-ring-group path.pulse {
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
.dial.inactive .scenario-ring-group path {
    opacity: 0.65;
}
</style>
