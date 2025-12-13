<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { blendHex, hexToRgb, stopColorHex } from '../../utils/colorUtils'

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
const DAY_NIGHT_RING_OUTER_RADIUS = FACE_CENTER
const DAY_NIGHT_RING_WIDTH = 8
const DAY_NIGHT_RING_INNER_RADIUS = DAY_NIGHT_RING_OUTER_RADIUS - DAY_NIGHT_RING_WIDTH
const DAY_NIGHT_RING_OUTER_RATIO = DAY_NIGHT_RING_OUTER_RADIUS / FACE_CENTER
const DAY_NIGHT_RING_INNER_RATIO = DAY_NIGHT_RING_INNER_RADIUS / FACE_CENTER
const SCENARIO_SEGMENT_INSET = 4
const DEFAULT_SEGMENT_OUTER_RADIUS = DAY_NIGHT_RING_INNER_RADIUS - SCENARIO_SEGMENT_INSET
const FACE_RADIUS = DEFAULT_SEGMENT_OUTER_RADIUS
const SUN_LINE_INNER_RADIUS = DAY_NIGHT_RING_INNER_RADIUS
const SUN_LINE_OUTER_RADIUS = DAY_NIGHT_RING_OUTER_RADIUS
const TICK_OUTER_RADIUS = DAY_NIGHT_RING_OUTER_RADIUS
const TICK_INNER_RADIUS_MAJOR = DAY_NIGHT_RING_INNER_RADIUS
const TICK_INNER_RADIUS_MINOR = DAY_NIGHT_RING_INNER_RADIUS
const HOUR_NUMBER_RADIUS = (DAY_NIGHT_RING_OUTER_RADIUS + DAY_NIGHT_RING_INNER_RADIUS + 20) / 2
const MIN_DIAL_FACE_RATIO = DEFAULT_SEGMENT_OUTER_RADIUS / FACE_CENTER
const MAX_DIAL_FACE_RATIO = 0.99
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
const scenarioArcWidth = computed(() => Math.max(mainHandleSize.value * 0.8, 8))
const baseRingWidth = computed(() =>
    Math.max(scenarioArcWidth.value + mainHandleSize.value * 0.2, scenarioArcWidth.value + 6)
)
const arcSpacing = computed(() => Math.max(10, 14 * dialScale.value))
const trackRadius = computed(() =>
    Math.max(
        dialMetrics.radius - arcSpacing.value - Math.max(baseRingWidth.value, scenarioArcWidth.value) / 2,
        0
    )
)
const scenarioSegmentOuterRadius = computed(() => {
    const explicit = Number(props.scenarioSegmentRadius)
    if (Number.isFinite(explicit) && explicit > 0) {
        return Math.min(explicit, DEFAULT_SEGMENT_OUTER_RADIUS)
    }
    return DEFAULT_SEGMENT_OUTER_RADIUS
})
const scenarioSegmentRatio = computed(() => {
    const radius = Number(scenarioSegmentOuterRadius.value)
    if (!Number.isFinite(radius) || FACE_CENTER <= 0) return MIN_DIAL_FACE_RATIO
    return Math.min(1, Math.max(MIN_DIAL_FACE_RATIO, radius / FACE_CENTER))
})
const scenarioSegmentOrbitRatio = computed(() => scenarioSegmentRatio.value)
const dialFaceRatioValue = computed(() => {
    const ratioProp = Number(props.dialFaceRatio)
    if (Number.isFinite(ratioProp) && ratioProp >= scenarioSegmentRatio.value) {
        return Math.min(MAX_DIAL_FACE_RATIO, ratioProp)
    }
    return scenarioSegmentRatio.value
})

const ratioToInsetPercent = (ratio) => `${(((1 - ratio) / 2) * 100).toFixed(4)}%`

const startMinutes = computed(() => stopMinutes(localStartStop))
const endMinutes = computed(() => stopMinutes(localEndStop))
const startAnchorMinutes = computed(() => stopAnchorMinutes(localStartStop))
const endAnchorMinutes = computed(() => stopAnchorMinutes(localEndStop))
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

const scenarioSegmentPaths = computed(() => {
    const start = startMinutes.value
    const end = endMinutes.value
    if (!Number.isFinite(start) || !Number.isFinite(end)) return []
    const span = clockwiseDuration(start, end)
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
        .map((segment) => buildSegmentPath(segment))
})

const sunMarkerPoints = computed(() => {
    const markers = [
        { key: 'sunrise', minute: props.sunriseMinute, type: 'sunrise' },
        { key: 'sunset', minute: props.sunsetMinute, type: 'sunset' }
    ]
    return markers
        .filter((marker) => Number.isFinite(marker.minute))
        .map((marker) => {
            const angle = minuteToAngle(marker.minute || 0)
            const lineStart = angleToPoint(angle, SUN_LINE_INNER_RADIUS)
            const lineEnd = angleToPoint(angle, SUN_LINE_OUTER_RADIUS)
            return {
                key: marker.key,
                type: marker.type,
                lineStart,
                lineEnd
            }
        })
})

const dialStyleVars = computed(() => {
    const ratio = dialFaceRatioValue.value
    return {
        '--dial-face-ratio': ratio,
        '--ring-outer-inset': ratioToInsetPercent(DAY_NIGHT_RING_OUTER_RATIO),
        '--ring-inner-inset': ratioToInsetPercent(DAY_NIGHT_RING_INNER_RATIO),
        '--dial-face-inset': ratioToInsetPercent(ratio),
        '--hour-layer-inset': ratioToInsetPercent(HOUR_NUMBER_RADIUS / FACE_CENTER)
    }
})

const currentNeedle = computed(() => {
    if (!Number.isFinite(props.currentMinute)) return null
    const angle = minuteToAngle(props.currentMinute)
    return {
        start: angleToPoint(angle, SUN_LINE_INNER_RADIUS),
        end: angleToPoint(angle, SUN_LINE_OUTER_RADIUS)
    }
})

const dayNightGradient = computed(() => {
    const deepNight = '#02122c'
    const dawnGlow = '#f8d7a1'
    const warmDay = '#fff6da'
    const duskGlow = '#f2b880'
    const dawnStartAngle = minutesToGradientAngle(props.sunriseMinute - 30)
    const sunriseAngle = minutesToGradientAngle(props.sunriseMinute)
    const dawnEndAngle = minutesToGradientAngle(props.sunriseMinute + 30)
    const duskStartAngle = minutesToGradientAngle(props.sunsetMinute - 30)
    const sunsetAngle = minutesToGradientAngle(props.sunsetMinute)
    const duskEndAngle = minutesToGradientAngle(props.sunsetMinute + 30)
    return `conic-gradient(
        from 90deg,
        ${deepNight} 0deg,
        ${deepNight} ${dawnStartAngle}deg,
        ${dawnGlow} ${sunriseAngle}deg,
        ${warmDay} ${dawnEndAngle}deg,
        ${warmDay} ${duskStartAngle}deg,
        ${duskGlow} ${sunsetAngle}deg,
        ${deepNight} ${duskEndAngle}deg,
        ${deepNight} 360deg
    )`
})

const hourLabels = computed(() => Array.from({ length: 12 }, (_, i) => i * 2))
const tickMarks = computed(() =>
    Array.from({ length: 24 }, (_, hour) => {
        const angle = (hour / 24) * 360
        const major = hour % 2 === 0
        const start = faceCoord(angle, TICK_OUTER_RADIUS)
        const end = faceCoord(angle, major ? TICK_INNER_RADIUS_MAJOR : TICK_INNER_RADIUS_MINOR)
        return {
            index: hour,
            major,
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y
        }
    })
)

const hourNumberItems = computed(() =>
    hourLabels.value.map((hour) => {
        const angle = (hour / 24) * 360
        const coord = faceCoord(angle, HOUR_NUMBER_RADIUS)
        return {
            hour,
            angle,
            x: coord.x,
            y: coord.y
        }
    })
)

const mainArcRadius = computed(() => trackRadius.value)

const startFlagStyle = computed(() =>
    buildRadialFlagStyle(startMinutes.value, 'start', gradientStartColor.value)
)
const endFlagStyle = computed(() =>
    buildRadialFlagStyle(endMinutes.value, 'end', gradientEndColor.value)
)

function minuteToAngle(minute) {
    const normalized = normalizeMinutes(minute)
    return (normalized / MINUTES_PER_DAY) * FULL_CIRCLE_DEG + 90
}

const minutesToGradientAngle = minuteToAngle

function angleToPoint(angle, radius = FACE_RADIUS) {
    const rad = (angle * Math.PI) / 180
    return {
        x: FACE_CENTER + radius * Math.cos(rad),
        y: FACE_CENTER + radius * Math.sin(rad)
    }
}

function buildSegmentPath(segment) {
    const outerRadius = scenarioSegmentOuterRadius.value
    const startAngle = minuteToAngle(segment.startMinute || 0)
    const sweep = Math.min(
        Math.max(0.5, (Number(segment.spanMinutes) / MINUTES_PER_DAY) * FULL_CIRCLE_DEG),
        FULL_CIRCLE_DEG - 0.001
    )
    const endAngle = startAngle + sweep
    const startPoint = angleToPoint(startAngle, outerRadius)
    const endPoint = angleToPoint(endAngle, outerRadius)
    const largeArc = sweep > 180 ? 1 : 0
    return {
        key: segment.key,
        color: segment.color || '#94a3b8',
        pulse: !!segment.pulse,
        single: !!segment.single,
        path: `M ${FACE_CENTER} ${FACE_CENTER} L ${startPoint.x} ${startPoint.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z`
    }
}

function hourNumberStyle(item) {
    const center = FACE_CENTER
    const baseX = item?.x ?? center
    const baseY = item?.y ?? center
    const dx = baseX - center
    const dy = baseY - center
    const distance = Math.hypot(dx, dy) || 1
    const outward = Math.max(2, DAY_NIGHT_RING_WIDTH * 0.15)
    const adjustedX = baseX + (dx / distance) * outward
    const adjustedY = baseY + (dy / distance) * outward
    const x = (adjustedX / 200) * 100
    const y = (adjustedY / 200) * 100
    return {
        left: `${x}%`,
        top: `${y}%`
    }
}

function faceCoord(angleDeg, radius = 70) {
    const rad = ((angleDeg + 90) * Math.PI) / 180
    return {
        x: FACE_CENTER + radius * Math.cos(rad),
        y: FACE_CENTER + radius * Math.sin(rad)
    }
}

function clampRatio(value) {
    if (!Number.isFinite(value)) return 0
    if (value < 0) return 0
    if (value > 1) return 1
    return value
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

function buildRadialFlagStyle(minutes, type, accentColor) {
    const dialRadius = dialMetrics.radius
    if (!dialRadius || !Number.isFinite(minutes)) return {}
    const arcWidth = Math.max(scenarioArcWidth.value, 28 * dialScale.value)
    const width = Math.max(arcWidth * 1.05, 48 * dialScale.value)
    const height = Math.max(width * 0.15, 15 * dialScale.value)
    const angleDeg = minuteToAngle(minutes)
    const orbitOffsetDeg = Math.min(4, 10 + 4 * dialScale.value)
    const orbitAngleDeg = angleDeg + (type === 'start' ? -orbitOffsetDeg : orbitOffsetDeg)
    const angleRad = (orbitAngleDeg * Math.PI) / 180
    const cos = Math.cos(angleRad)
    const sin = Math.sin(angleRad)
    const targetOrbit = dialRadius * scenarioSegmentOrbitRatio.value
    const minRadius = width / 2
    const maxRadius = Math.max(width / 2, dialRadius - width * 0.1)
    const radialCenter = Math.min(maxRadius, Math.max(targetOrbit - width / 2, minRadius))
    const tangentDirection = type === 'start' ? -1 : 1
    const tangentOffset = height * 0.08 * tangentDirection
    const centerX = dialRadius + cos * radialCenter - Math.sin(angleRad) * tangentOffset
    const centerY = dialRadius + sin * radialCenter + Math.cos(angleRad) * tangentOffset
    const invert = (angleDeg % 360 + 90) % 360
    const flipped = invert > 180
    const fontSize = Math.max(11, Math.min(16, 11 * dialScale.value))
    return {
        left: `${centerX}px`,
        top: `${centerY}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(-50%, -50%) rotate(${flipped ? angleDeg + 180 : angleDeg}deg)`,
        '--flag-accent': accentColor,
        '--flag-contrast': flagTextColor(accentColor),
        '--flag-rotation': flipped ? '-1' : '1',
        fontSize: `${fontSize}px`
    }
}

function flagTextColor(accentHex) {
    const { r, g, b } = hexToRgb(accentHex)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.65 ? '#070a12' : '#f8fafc'
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
    const snappedMinutes = snapMinutesValue(nextMinutes)
    if (draggingHandle.value === 'start') {
        markHandleTapMoved('start', event)
        if (suppressedSnapHandle.value === 'start') {
            toClockMode(localStartStop, snappedMinutes)
            suppressedSnapHandle.value = ''
            enqueueStopEmit('start')
            return
        }
        applyMinutes(localStartStop, snappedMinutes, 'start')
    } else if (draggingHandle.value === 'end') {
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
    if (type) enqueueStopEmit(type)
}

function detectAnchor(minutes) {
    if (!Number.isFinite(minutes)) return null
    if (Number.isFinite(props.sunriseMinute)) {
        const sunriseDiff = minutesDiff(minutes, props.sunriseMinute)
        if (Math.abs(sunriseDiff) <= 15) {
            return { mode: 'sunrise', offset: 0 }
        }
    }
    if (Number.isFinite(props.sunsetMinute)) {
        const sunsetDiff = minutesDiff(minutes, props.sunsetMinute)
        if (Math.abs(sunsetDiff) <= 15) {
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

function stopAnchorMinutes(stop) {
    if (!stop) return 0
    if (stop.mode === 'sunrise') return normalizeMinutes(props.sunriseMinute || 0)
    if (stop.mode === 'sunset') return normalizeMinutes(props.sunsetMinute || 0)
    return stopMinutes(stop)
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

            <div class="day-night-ring" :style="{ '--day-ring-gradient': dayNightGradient }">
                <svg class="tick-overlay" viewBox="0 0 200 200">
                    <g class="tick-group">
                        <line v-for="tick in tickMarks" :key="tick.index" :class="{ major: tick.major }" :x1="tick.x1"
                            :y1="tick.y1" :x2="tick.x2" :y2="tick.y2" />
                    </g>
                </svg>
                <svg class="sun-marker-overlay" viewBox="0 0 200 200">
                    <g class="sun-marker-group">
                        <g v-for="marker in sunMarkerPoints" :key="marker.key" class="sun-marker">
                            <line class="sun-marker-line" :class="marker.type" :x1="marker.lineStart.x"
                                :y1="marker.lineStart.y" :x2="marker.lineEnd.x" :y2="marker.lineEnd.y" />
                        </g>
                    </g>
                    <line v-if="currentNeedle" class="current-needle" :x1="currentNeedle.start.x"
                        :y1="currentNeedle.start.y" :x2="currentNeedle.end.x" :y2="currentNeedle.end.y" />
                </svg>
                <div class="hour-number-layer">
                    <span v-for="item in hourNumberItems" :key="item.hour" class="hour-number"
                        :style="hourNumberStyle(item)">
                        {{ item.hour }}
                    </span>
                </div>
            </div>

            <div class="dial-face">
                <svg viewBox="0 0 200 200" class="dial-face-svg">
                    <circle class="dial-face-bg" cx="100" cy="100" :r="FACE_RADIUS" />
                    <g class="scenario-segment-group">
                        <path v-for="segment in scenarioSegmentPaths" :key="segment.key" :d="segment.path"
                            :style="{ fill: segment.color }"
                            :class="{ pulse: segment.pulse, single: segment.single }" />
                    </g>
                </svg>
            </div>

            <button class="dial-flag start" :style="startFlagStyle"
                @pointerdown="(event) => handleDialPointerDown('start', event)">
                <span class="flag-label">СТАРТ</span>
            </button>
            <button class="dial-flag end" :style="endFlagStyle"
                @pointerdown="(event) => handleDialPointerDown('end', event)">
                <span class="flag-label">ФИНИШ</span>
            </button>
        </div>
    </section>
</template>

<style scoped>
/* Styles retained from the previous dial implementation */
.dial-section {
    padding: 16px;

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
    --ring-outer-inset: 0%;
    --ring-inner-inset: 10%;
    --dial-face-inset: 14%;
    --hour-layer-inset: 6%;
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

.day-night-ring {
    position: absolute;
    inset: var(--ring-outer-inset);
    border-radius: 50%;
    z-index: 3;
    background: var(--day-ring-gradient);
    box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.55);
    overflow: visible;
}

.day-night-ring::after {
    content: '';
    position: absolute;
    inset: var(--ring-inner-inset);
    border-radius: 50%;
    background: #050811;
    z-index: 1;
}

.day-night-ring .tick-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
}

.day-night-ring .sun-marker-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 4;
}

.day-night-ring .hour-number-layer {
    position: absolute;
    top: var(--hour-layer-inset);
    right: var(--hour-layer-inset);
    bottom: var(--hour-layer-inset);
    left: var(--hour-layer-inset);
    pointer-events: none;
    z-index: 5;
}

.day-night-ring .hour-number {
    position: absolute;
    transform: translate(-50%, -50%);
    font-size: 16px;
    font-weight: 600;
    color: #dde6ff;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
    letter-spacing: 0.04em;
}

.tick-overlay {
    position: absolute;
    inset: 0;
    z-index: 3;
}

.tick-overlay .tick-group line {
    stroke: rgba(148, 163, 184, 0.5);
    stroke-width: 1px;
}

.dial.inactive .hour-number,
.dial.inactive .tick-group line,
.dial.inactive .face-symbol,
.dial.inactive .sun-marker-line {
    opacity: 0.6;
}

.dial-face {
    position: absolute;
    top: var(--dial-face-inset);
    right: var(--dial-face-inset);
    bottom: var(--dial-face-inset);
    left: var(--dial-face-inset);
    border-radius: 50%;
    background: #050811;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 310px rgba(0, 0, 0, 0.65);
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

.scenario-segment-group path {
    fill: rgba(255, 255, 255, 0.15);
}

.scenario-segment-group path.pulse {
    animation: dial-segment-pulse 3s ease-in-out infinite;
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
    stroke-width: 3px;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.45));
    pointer-events: none;
}

.dial-flag {
    position: absolute;
    width: 58px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: var(--flag-accent, #f97316);
    color: var(--flag-contrast, #05070f);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: center;
    transform-origin: center;
    touch-action: none;
    z-index: 7;
}

.flag-label {
    transform: rotate(var(--flag-rotation, 180deg));
}

.sun-marker-line {
    stroke-width: 3px;
    stroke-linecap: round;
    stroke: rgba(248, 250, 252, 0.6);
}

.sun-marker-line.sunrise {
    stroke: #fbbf24;
    filter: drop-shadow(0 0 4px rgba(251, 191, 36, 0.55));
}

.sun-marker-line.sunset {
    stroke: #fb7185;
    filter: drop-shadow(0 0 4px rgba(251, 113, 133, 0.4));
}
</style>
