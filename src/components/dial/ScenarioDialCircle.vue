<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
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
    currentMinute: {
        type: Number,
        default: null
    }
})

const emit = defineEmits(['open-start-editor', 'open-end-editor', 'resume'])

const BASE_DIAL_SIZE = 320
const FACE_CENTER = 100
const FACE_RADIUS = 102
const SUN_LINE_INNER_RADIUS = 86
const SUN_LINE_OUTER_RADIUS = 100
const HANDLE_TAP_HOLD_MS = 300
const HANDLE_TAP_MOVE_TOLERANCE = 6
const minuteStep = 5
const OFFSET_LIMIT = 60

const dialElement = ref(null)
const dialMetrics = reactive({
    size: BASE_DIAL_SIZE,
    radius: BASE_DIAL_SIZE / 2,
    centerX: 0,
    centerY: 0
})
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
const handleShadowScale = computed(() => Math.max(0.65, dialScale.value))
const offsetHandleSize = computed(() => Math.max(20, 24 * dialScale.value))
const offsetHandleBorderWidth = computed(() => Math.max(0.75, dialScale.value * 0.8))
const offsetRingStrokeWidth = computed(() => Math.max(6, 12 * dialScale.value))

const startMinutes = computed(() => stopMinutes(props.startStop))
const endMinutes = computed(() => stopMinutes(props.endStop))
const startAnchorMinutes = computed(() => stopAnchorMinutes(props.startStop))
const endAnchorMinutes = computed(() => stopAnchorMinutes(props.endStop))
const startLabel = computed(() => stopLabel(props.startStop))
const endLabel = computed(() => stopLabel(props.endStop))
const startLabelCompact = computed(
    () => props.startStop?.mode !== 'clock' && (props.startStop?.offset || 0) !== 0
)
const endLabelCompact = computed(
    () => props.endStop?.mode !== 'clock' && (props.endStop?.offset || 0) !== 0
)
const gradientStartColor = computed(() => stopColorHex(props.startStop))
const gradientEndColor = computed(() => stopColorHex(props.endStop))
const dialInactive = computed(() => ['off', 'paused'].includes(props.scenarioStatus))
const isPaused = computed(() => props.scenarioStatus === 'paused')

function readDialMetrics() {
    const el = dialElement.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const size = Math.min(rect.width, rect.height)
    dialMetrics.size = size
    dialMetrics.radius = size / 2
    dialMetrics.centerX = rect.left + rect.width / 2
    dialMetrics.centerY = rect.top + rect.height / 2
}

onMounted(() => {
    readDialMetrics()
    if (typeof ResizeObserver !== 'undefined') {
        resizeObserver.value = new ResizeObserver(() => readDialMetrics())
        if (dialElement.value) resizeObserver.value.observe(dialElement.value)
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', readDialMetrics)
        window.addEventListener('scroll', readDialMetrics, { passive: true })
    }
})

onUnmounted(() => {
    resizeObserver.value?.disconnect()
    if (typeof window !== 'undefined') {
        window.removeEventListener('resize', readDialMetrics)
        window.removeEventListener('scroll', readDialMetrics)
    }
})

watch(
    () => dialElement.value,
    (el) => {
        if (el && resizeObserver.value) resizeObserver.value.observe(el)
        readDialMetrics()
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
        props.autoBrightness && !props.startStop?.useColor && !props.endStop?.useColor
    const pulseSegments = props.autoBrightness && (props.startStop?.useColor || props.endStop?.useColor)
    if (autoOnlyBrightness) {
        segments.push({
            key: 'auto-single',
            startMinute: start,
            spanMinutes: span,
            color: startColor,
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
    const ratio = Number(props.dialFaceRatio) || 0.62
    const baseGap = (1 - ratio) / 2
    const scaledGap = Math.max(baseGap * 0.7, 0)
    return {
        '--dial-face-ratio': ratio,
        '--dial-face-gap-override': `${(scaledGap * 100).toFixed(2)}%`
    }
})

const currentNeedle = computed(() => {
    if (!Number.isFinite(props.currentMinute)) return null
    const angle = minuteToAngle(props.currentMinute)
    return angleToPoint(angle, FACE_RADIUS)
})

const showStartOffsetHandle = computed(() => props.startStop?.mode !== 'clock')
const showEndOffsetHandle = computed(() => props.endStop?.mode !== 'clock')

const sunOffsetHandleRadius = computed(() => {
    if (!dialMetrics.radius) return 0
    return Math.min(dialMetrics.radius - 6, trackRadius.value + baseRingWidth.value / 2)
})

const startOffsetStyle = computed(() => {
    if (!showStartOffsetHandle.value) return {}
    const radius = sunOffsetHandleRadius.value > 0 ? sunOffsetHandleRadius.value : FACE_RADIUS + 12
    return buildHandleStyle(positionForMinute(startMinutes.value, radius), {
        size: offsetHandleSize.value,
        borderWidth: offsetHandleBorderWidth.value
    })
})

const endOffsetStyle = computed(() => {
    if (!showEndOffsetHandle.value) return {}
    const radius = sunOffsetHandleRadius.value > 0 ? sunOffsetHandleRadius.value : FACE_RADIUS + 12
    return buildHandleStyle(positionForMinute(endMinutes.value, radius), {
        size: offsetHandleSize.value,
        borderWidth: offsetHandleBorderWidth.value
    })
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
        const start = faceCoord(angle, 100)
        const end = faceCoord(angle, 86)
        return {
            index: hour,
            major: hour % 2 === 0,
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
        const coord = faceCoord(angle, 100)
        return {
            hour,
            angle,
            x: coord.x,
            y: coord.y
        }
    })
)

const mainArcRadius = computed(() => trackRadius.value)

const offsetRingRadius = computed(() => (SUN_LINE_INNER_RADIUS + SUN_LINE_OUTER_RADIUS) / 2)
const startOffsetRingArc = computed(() =>
    buildOffsetArc(startAnchorMinutes.value, startMinutes.value, 'start', props.startStop, offsetRingRadius.value)
)
const endOffsetRingArc = computed(() =>
    buildOffsetArc(endAnchorMinutes.value, endMinutes.value, 'end', props.endStop, offsetRingRadius.value)
)

const offsetRingArcs = computed(() => {
    const arcs = []
    if (startOffsetRingArc.value) arcs.push(startOffsetRingArc.value)
    if (endOffsetRingArc.value) arcs.push(endOffsetRingArc.value)
    return arcs
})

const startFlagStyle = computed(() =>
    buildRadialFlagStyle(startMinutes.value, 'start', gradientStartColor.value)
)
const endFlagStyle = computed(() =>
    buildRadialFlagStyle(endMinutes.value, 'end', gradientEndColor.value)
)

const currentStatePreview = computed(() => {
    if (props.scenarioStatus !== 'running') return null
    if (!Number.isFinite(props.currentMinute)) return null
    const startMin = Number.isFinite(startMinutes.value) ? startMinutes.value : 0
    const endMin = Number.isFinite(endMinutes.value) ? endMinutes.value : 0
    const totalSpan = minutesDiff(endMin, startMin) || 1
    const ratio = clampRatio(minutesDiff(props.currentMinute, startMin) / totalSpan)
    const startBrightness = Number(props.startStop?.brightness ?? 0)
    const endBrightness = Number(props.endStop?.brightness ?? startBrightness)
    const brightnessValue = startBrightness + (endBrightness - startBrightness) * ratio
    const blendedColor = blendHex(gradientStartColor.value, gradientEndColor.value, ratio)
    const coords = angleToPoint(minuteToAngle(props.currentMinute), trackRadius.value || FACE_RADIUS)
    let temperatureValue = null
    if (props.startStop?.colorMode === 'temperature' && props.endStop?.colorMode === 'temperature') {
        const startTemp = Number(props.startStop?.temperature ?? 0)
        const endTemp = Number(props.endStop?.temperature ?? startTemp)
        temperatureValue = Math.round(startTemp + (endTemp - startTemp) * ratio)
    }
    const colorDot = !temperatureValue && props.startStop?.useColor && props.endStop?.useColor ? blendedColor : ''
    const colorLabel = temperatureValue ? `${temperatureValue}K` : ''
    const brightnessText = props.autoBrightness ? 'Автояркость' : `${Math.round(brightnessValue)}%`
    return {
        cx: coords.x,
        cy: coords.y,
        color: blendedColor,
        brightnessText,
        colorLabel,
        colorDot
    }
})

const currentStateCache = ref(null)
watch(
    currentStatePreview,
    (value) => {
        if (!draggingPrimaryHandle.value) currentStateCache.value = value
    },
    { immediate: true }
)

const dialCurrentState = computed(() => {
    if (draggingPrimaryHandle.value && currentStateCache.value) return currentStateCache.value
    return currentStatePreview.value
})

function minuteToAngle(minute) {
    const normalized = ((Number(minute) % 1440) + 1440) % 1440
    return (normalized / 1440) * 360 + 90
}

function minutesToGradientAngle(minutes) {
    const normalized = ((Number(minutes) % 1440) + 1440) % 1440
    return (normalized / 1440) * 360 + 90
}

function angleToPoint(angle, radius = FACE_RADIUS) {
    const rad = (angle * Math.PI) / 180
    return {
        x: FACE_CENTER + radius * Math.cos(rad),
        y: FACE_CENTER + radius * Math.sin(rad)
    }
}

function buildSegmentPath(segment) {
    const startAngle = minuteToAngle(segment.startMinute || 0)
    const sweep = Math.min(Math.max(0.5, (Number(segment.spanMinutes) / 1440) * 360), 359.999)
    const endAngle = startAngle + sweep
    const startPoint = angleToPoint(startAngle)
    const endPoint = angleToPoint(endAngle)
    const largeArc = sweep > 180 ? 1 : 0
    return {
        key: segment.key,
        color: segment.color || '#94a3b8',
        pulse: !!segment.pulse,
        single: !!segment.single,
        path: `M ${FACE_CENTER} ${FACE_CENTER} L ${startPoint.x} ${startPoint.y} A ${FACE_RADIUS} ${FACE_RADIUS} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y} Z`
    }
}

function buildOffsetArc(anchorMinutes, actualMinutes, key, stop, radius) {
    if (!Number.isFinite(anchorMinutes) || !Number.isFinite(actualMinutes)) return null
    if (stop?.mode === 'clock') return null
    const diff = minutesDiff(actualMinutes, anchorMinutes)
    if (!diff || radius <= 0) return null
    const accent = stopColorHex(stop)
    const color = blendHex('#f8fafc', accent, key === 'start' ? 0.55 : 0.4)
    return {
        key,
        path: describeOffsetArcPath(anchorMinutes, actualMinutes, radius),
        color
    }
}

function describeOffsetArcPath(anchorMin, targetMin, radius) {
    const diff = minutesDiff(targetMin, anchorMin)
    if (!diff || radius <= 0) return ''
    const startAngle = minuteToAngle(anchorMin)
    const endAngle = minuteToAngle(targetMin)
    const start = angleToPoint(startAngle, radius)
    const end = angleToPoint(endAngle, radius)
    const largeArcFlag = Math.abs(diff) > 720 ? 1 : 0
    const sweepFlag = diff >= 0 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x} ${end.y}`
}

function hourNumberStyle(item) {
    const center = FACE_CENTER
    const baseX = item?.x ?? center
    const baseY = item?.y ?? center
    const dx = baseX - center
    const dy = baseY - center
    const distance = Math.hypot(dx, dy) || 1
    const outward = 1.5
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
    while (diff > 720) diff -= 1440
    while (diff < -720) diff += 1440
    return diff
}

function clockwiseDuration(startMin, endMin) {
    let span = endMin - startMin
    if (span <= 0) span += 1440
    if (!span || span <= 0) span = 1440
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

function buildRadialFlagStyle(minutes, type, accentColor) {
    const dialRadius = dialMetrics.radius
    if (!dialRadius || !Number.isFinite(minutes)) return {}
    const faceRadius = dialRadius * (props.dialFaceRatio || 0.62)
    const arcRadius = mainArcRadius.value || faceRadius
    const arcWidth = Math.max(scenarioArcWidth.value, 28 * dialScale.value)
    const width = Math.max(arcWidth * 1.05, 48 * dialScale.value)
    const height = Math.max(width * 0.45, 20 * dialScale.value)
    const angleDeg = minuteToAngle(minutes)
    const orbitOffsetDeg = Math.min(4, 10 + 4 * dialScale.value)
    const orbitAngleDeg = angleDeg + (type === 'start' ? -orbitOffsetDeg : orbitOffsetDeg)
    const angleRad = (orbitAngleDeg * Math.PI) / 180
    const cos = Math.cos(angleRad)
    const sin = Math.sin(angleRad)
    const ringInnerEdge = Math.max(arcRadius - arcWidth / 2, faceRadius * 0.5)
    const radialCenter = Math.max(ringInnerEdge - width * 0.35, width / 2)
    const tangentDirection = type === 'start' ? -1 : 1
    const tangentOffset = height * 0.08 * tangentDirection
    const centerX = dialRadius + cos * radialCenter - Math.sin(angleRad) * tangentOffset
    const centerY = dialRadius + sin * radialCenter + Math.cos(angleRad) * tangentOffset
    const invert = (angleDeg % 360 + 90) % 360
    const flipped = invert > 180
    return {
        left: `${centerX}px`,
        top: `${centerY}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(-50%, -50%) rotate(${flipped ? angleDeg + 180 : angleDeg}deg)`,
        '--flag-accent': accentColor,
        '--flag-contrast': flagTextColor(accentColor),
        '--flag-rotation': flipped ? '-1' : '1'
    }
}

function flagTextColor(accentHex) {
    const { r, g, b } = hexToRgb(accentHex)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.65 ? '#070a12' : '#f8fafc'
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
    draggingHandle.value = type
    const pointerMinutes = pointerToMinutes(event)
    dragState.activePointerMinutes = pointerMinutes
    dragState.accumulatedMinutes = 0
    dragState.handleStartMinutes =
        type === 'start' ? startMinutes.value : type === 'end' ? endMinutes.value : 0
    if (type === 'start' && props.startStop?.mode !== 'clock') suppressedSnapHandle.value = 'start'
    else if (type === 'end' && props.endStop?.mode !== 'clock') suppressedSnapHandle.value = 'end'
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
    if (draggingHandle.value === 'start-offset') {
        emitOffsetChange('start', pointerMinutes)
        return
    }
    if (draggingHandle.value === 'end-offset') {
        emitOffsetChange('end', pointerMinutes)
        return
    }
    const pointerDelta = minutesDiff(pointerMinutes, dragState.activePointerMinutes)
    dragState.activePointerMinutes = pointerMinutes
    dragState.accumulatedMinutes += pointerDelta
    const nextMinutes = normalizeMinutes(dragState.handleStartMinutes + dragState.accumulatedMinutes)
    const snappedMinutes = snapMinutesValue(nextMinutes)
    if (draggingHandle.value === 'start') {
        markHandleTapMoved('start', event)
        if (suppressedSnapHandle.value === 'start') {
            toClockMode(props.startStop, snappedMinutes)
            suppressedSnapHandle.value = ''
            return
        }
        applyMinutes(props.startStop, snappedMinutes)
    } else if (draggingHandle.value === 'end') {
        markHandleTapMoved('end', event)
        if (suppressedSnapHandle.value === 'end') {
            toClockMode(props.endStop, snappedMinutes)
            suppressedSnapHandle.value = ''
            return
        }
        applyMinutes(props.endStop, snappedMinutes)
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
    if (tapAllowed) {
        const type = activeHandle === 'start' ? 'open-start-editor' : 'open-end-editor'
        requestAnimationFrame(() => emit(type))
    }
}

function handleDialPointerLeave() {
    if (!draggingHandle.value) return
    if (draggingHandle.value === 'start' || draggingHandle.value === 'end') {
        releaseHandleTapTracking(draggingHandle.value)
    }
    stopActiveDrag()
}

function handleDialPointerCancel(event) {
    if (!draggingHandle.value) return
    event?.target?.releasePointerCapture?.(event.pointerId)
    if (draggingHandle.value === 'start' || draggingHandle.value === 'end') {
        releaseHandleTapTracking(draggingHandle.value)
    }
    stopActiveDrag()
}

function stopActiveDrag() {
    draggingHandle.value = ''
    suppressedSnapHandle.value = ''
    dragState.activePointerMinutes = 0
    dragState.accumulatedMinutes = 0
    dragState.handleStartMinutes = 0
}

function pointerToMinutes(event) {
    const centerX = dialMetrics.centerX
    const centerY = dialMetrics.centerY
    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return 0
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
    angleDeg = (angleDeg + 360) % 360
    const minutes = ((angleDeg - 90 + 360) % 360) * (1440 / 360)
    return Math.round(minutes)
}

function normalizeMinutes(value) {
    let next = value % 1440
    if (next < 0) next += 1440
    return next
}

function snapMinutesValue(value) {
    if (!Number.isFinite(value)) return 0
    return Math.round(value / minuteStep) * minuteStep
}

function emitOffsetChange(type, pointerMinutes) {
    const anchor = type === 'start' ? startAnchorMinutes.value : endAnchorMinutes.value
    const diff = minutesDiff(pointerMinutes, anchor)
    const clamped = Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, diff))
    if (type === 'start' && props.startStop?.mode !== 'clock') {
        props.startStop.offset = clamped
    } else if (type === 'end' && props.endStop?.mode !== 'clock') {
        props.endStop.offset = clamped
    }
}

function toClockMode(stop, minutes) {
    if (!stop) return
    stop.mode = 'clock'
    stop.clockMinutes = normalizeMinutes(snapMinutesValue(minutes))
    stop.offset = 0
}

function applyMinutes(stop, minutes) {
    if (!stop) return
    const snapped = detectAnchor(minutes)
    if (snapped) {
        stop.mode = snapped.mode
        stop.offset = snapped.offset
    } else {
        toClockMode(stop, minutes)
    }
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
    const value = ((Number(minute) % 1440) + 1440) % 1440
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

            <div v-if="currentStatusLabel || dialCurrentState" class="current-state-hud">
                <span v-if="currentStatusLabel" class="current-state-line status">{{ currentStatusLabel }}</span>
                <span v-if="dialCurrentState?.brightnessText" class="current-state-line brightness">
                    {{ dialCurrentState.brightnessText }}
                </span>
                <span v-if="dialCurrentState?.colorLabel" class="current-state-line temperature">
                    {{ dialCurrentState.colorLabel }}
                </span>
                <span v-else-if="dialCurrentState?.colorDot" class="current-state-dot"
                    :style="{ background: dialCurrentState.colorDot }" />
            </div>

            <div class="day-night-ring" :style="{ '--day-ring-gradient': dayNightGradient }">
                <svg class="offset-ring-overlay" viewBox="0 0 200 200">
                    <g>
                        <path v-for="arc in offsetRingArcs" :key="`ring-${arc.key}`" :d="arc.path"
                            stroke-dasharray="1 1" :stroke="arc.color" :stroke-width="offsetRingStrokeWidth" />
                    </g>
                </svg>
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
                    <line v-if="currentNeedle" class="current-needle" x1="100" y1="100" :x2="currentNeedle.x"
                        :y2="currentNeedle.y" />
                </svg>
            </div>

            <button v-if="showStartOffsetHandle" class="dial-offset-handle start" :style="startOffsetStyle"
                @pointerdown="(event) => handleDialPointerDown('start-offset', event)">
                <span class="offset-icon">☀</span>
            </button>
            <button v-if="showEndOffsetHandle" class="dial-offset-handle end" :style="endOffsetStyle"
                @pointerdown="(event) => handleDialPointerDown('end-offset', event)">
                <span class="offset-icon dusk">☾</span>
            </button>

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
    background: #0b1220;
    border-radius: 28px;
    padding: 16px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
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
    --dial-face-gap-default: calc((1 - var(--dial-face-ratio, 0.62)) / 2 * 70%);
    --dial-face-gap: var(--dial-face-gap-override, var(--dial-face-gap-default));
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
    --ring-expose: clamp(12px, 3vw, 28px);
    --ring-width: clamp(24px, 5.5vw, 26px);
    position: absolute;
    inset: calc(var(--dial-face-gap) - var(--ring-expose));
    border-radius: 50%;
    z-index: 3;
    background: var(--day-ring-gradient);
    box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.55);
    overflow: visible;
}

.day-night-ring::after {
    content: '';
    position: absolute;
    inset: var(--ring-width);
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

.offset-ring-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
}

.offset-ring-overlay path {
    fill: none;
    stroke-linecap: round;
    opacity: 0.85;
}

.day-night-ring .hour-number-layer {
    position: absolute;
    top: calc(var(--ring-expose) - var(--dial-face-gap));
    right: calc(var(--ring-expose) - var(--dial-face-gap));
    bottom: calc(var(--ring-expose) - var(--dial-face-gap));
    left: calc(var(--ring-expose) - var(--dial-face-gap));
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
    width: calc(var(--dial-face-ratio, 0.62) * 100%);
    height: calc(var(--dial-face-ratio, 0.62) * 100%);
    top: calc((1 - var(--dial-face-ratio, 0.62)) / 2 * 100%);
    left: calc((1 - var(--dial-face-ratio, 0.62)) / 2 * 100%);
    border-radius: 50%;
    background: #050811;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.65);
    overflow: hidden;
}

.current-state-hud {
    position: absolute;
    top: 38%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: center;
    color: #f8fafc;
    font-weight: 600;
    font-size: 14px;
    pointer-events: none;
    z-index: 5;
}

.current-state-line {
    display: block;
    line-height: 1.2;
}

.current-state-line.status {
    font-size: 11px;
    color: #c5c8ff;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-weight: 600;
}

.current-state-line.brightness {
    font-size: 16px;
    font-weight: 600;
}

.current-state-line.temperature {
    font-size: 14px;
    color: #c5c8ff;
}

.current-state-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.8);
    margin-top: 2px;
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
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
        opacity: 0.3;
    }

    50% {
        opacity: 0.85;
    }

    100% {
        opacity: 0.3;
    }
}

.current-needle {
    stroke: rgba(248, 250, 252, 0.8);
    stroke-width: 2px;
    stroke-linecap: round;
}

.dial-offset-handle {
    position: absolute;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.6);
    background: rgba(5, 8, 17, 0.95);
    color: #fcd34d;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 6;
    touch-action: none;
}

.dial-offset-handle .offset-icon {
    font-size: 12px;
    line-height: 1;
    color: #fbbf24;
}

.dial-offset-handle .offset-icon.dusk {
    color: #fb923c;
}

.dial-flag {
    position: absolute;
    width: 58px;
    height: 28px;
    border: none;
    border-radius: 999px;
    background: var(--flag-accent, #f97316);
    color: var(--flag-contrast, #05070f);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.08em;
    padding: 0 12px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.35);
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
