<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'

const HARD_SENSOR_MAX = 100000
const MIN_BRIGHTNESS_GAP = 0
const MIN_LUX_GAP = 1

const props = defineProps({
    luxMin: {
        type: Number,
        default: 1
    },
    luxMax: {
        type: Number,
        default: 1000
    },
    brightnessMin: {
        type: Number,
        default: 10
    },
    brightnessMax: {
        type: Number,
        default: 90
    },
    sensorMinLimit: {
        type: Number,
        default: 1
    },
    sensorMaxLimit: {
        type: Number,
        default: 5000
    }
})

const emit = defineEmits(['change'])

const VIEWBOX_WIDTH = 320
const VIEWBOX_HEIGHT = 260
const MARGIN = Object.freeze({
    top: 16,
    right: 28,
    bottom: 42,
    left: 56
})

const graphRef = ref(null)
const activeDrag = ref(null)

const safeSensorMin = computed(() => Math.max(1, Number(props.sensorMinLimit) || 1))
const safeSensorMax = computed(() => {
    const candidate = Number(props.sensorMaxLimit)
    const numeric = Number.isFinite(candidate) ? candidate : HARD_SENSOR_MAX
    return Math.min(HARD_SENSOR_MAX, Math.max(safeSensorMin.value + 1, numeric))
})

const clampNumberLocal = (value, min, max, fallback) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.min(Math.max(numeric, min), max)
}

const sanitizedValues = computed(() => {
    const brightnessMin = clampNumberLocal(props.brightnessMin, 0, 100, 0)
    const brightnessMax = Math.max(brightnessMin + MIN_BRIGHTNESS_GAP, clampNumberLocal(props.brightnessMax, 0, 100, 100))
    const luxMin = clampNumberLocal(props.luxMin, safeSensorMin.value, safeSensorMax.value - MIN_LUX_GAP, safeSensorMin.value)
    const luxMax = Math.max(luxMin + MIN_LUX_GAP, clampNumberLocal(props.luxMax, safeSensorMin.value, safeSensorMax.value, safeSensorMax.value))
    return {
        brightnessMin,
        brightnessMax,
        luxMin,
        luxMax
    }
})

const plotArea = computed(() => {
    const width = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right
    const height = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom
    return {
        x: MARGIN.left,
        y: MARGIN.top,
        width,
        height
    }
})

const logMin = computed(() => Math.log(safeSensorMin.value))
const logSpan = computed(() => {
    const span = Math.log(safeSensorMax.value) - logMin.value
    return Number.isFinite(span) && span > 0 ? span : 1
})

const sensorToX = (value) => plotArea.value.x + sensorToRatio(value) * plotArea.value.width
const sensorToRatio = (value) => {
    const clamped = Math.min(Math.max(value, safeSensorMin.value), safeSensorMax.value)
    return (Math.log(clamped) - logMin.value) / logSpan.value
}
const brightnessToRatio = (value) => Math.min(Math.max(value, 0), 100) / 100
const brightnessToY = (value) => plotArea.value.y + (1 - brightnessToRatio(value)) * plotArea.value.height

const sensorMinPointX = computed(() => sensorToX(sanitizedValues.value.luxMin))
const sensorMaxPointX = computed(() => sensorToX(sanitizedValues.value.luxMax))
const brightnessMinPointY = computed(() => brightnessToY(sanitizedValues.value.brightnessMin))
const brightnessMaxPointY = computed(() => brightnessToY(sanitizedValues.value.brightnessMax))

const linePath = computed(
    () =>
        `M ${sensorMinPointX.value} ${brightnessMaxPointY.value} L ${sensorMaxPointX.value} ${brightnessMinPointY.value}`
)

const brightnessTicks = [0, 25, 50, 75, 100]
const sensorTicks = computed(() => {
    const ticks = []
    const max = safeSensorMax.value
    let current = 1
    while (current < safeSensorMin.value) current *= 10
    while (current <= max) {
        ticks.push(current)
        current *= 10
    }
    if (!ticks.length || ticks[0] !== safeSensorMin.value) ticks.unshift(safeSensorMin.value)
    if (ticks[ticks.length - 1] !== max) ticks.push(max)
    const unique = Array.from(new Set(ticks))
    return unique.sort((a, b) => a - b)
})

const formatBrightness = (value) => `${Math.round(value)}%`
const formatLux = (value) => `${Math.round(value)}`

function emitChange(patch) {
    emit('change', patch)
}

function ratioToSensorValue(ratio) {
    const normalized = Math.min(Math.max(ratio, 0), 1)
    const logValue = logMin.value + normalized * logSpan.value
    return Math.exp(logValue)
}

function pointFromEvent(event) {
    const svg = graphRef.value
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    const scaleX = VIEWBOX_WIDTH / rect.width
    const scaleY = VIEWBOX_HEIGHT / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    return { x, y }
}

const clampPlotX = (x) => Math.min(Math.max(x, plotArea.value.x), plotArea.value.x + plotArea.value.width)
const clampPlotY = (y) => Math.min(Math.max(y, plotArea.value.y), plotArea.value.y + plotArea.value.height)

const plotXToLux = (x) => {
    const ratio = (x - plotArea.value.x) / plotArea.value.width
    return ratioToSensorValue(ratio)
}

const plotYToBrightness = (y) => {
    const ratio = 1 - (y - plotArea.value.y) / plotArea.value.height
    const normalized = Math.min(Math.max(ratio, 0), 1)
    return Math.round(normalized * 100)
}

function handlePointerMove(event) {
    if (!activeDrag.value) return
    event.preventDefault()
    const coords = pointFromEvent(event)
    console.debug('[AutoBrightnessGraph] pointer move', {
        type: activeDrag.value,
        coords,
        rawEvent: {
            x: event.clientX,
            y: event.clientY
        }
    })
    if (!coords) return
    const type = activeDrag.value
    if (type === 'point-min' || type === 'point-max') {
        const plotX = clampPlotX(coords.x)
        const plotY = clampPlotY(coords.y)
        const luxValue = plotXToLux(plotX)
        const brightnessValue = plotYToBrightness(plotY)
        console.debug(
            '[AutoBrightnessGraph] computed values',
            type,
            { plotX, plotY, luxValue, brightnessValue },
            {
                sanitized: sanitizedValues.value,
                bounds: {
                    safeSensorMin: safeSensorMin.value,
                    safeSensorMax: safeSensorMax.value
                }
            }
        )
        if (type === 'point-min') {
            const minBrightnessAllowed = sanitizedValues.value.brightnessMin + MIN_BRIGHTNESS_GAP
            const clampedBrightness = Math.max(minBrightnessAllowed, Math.min(100, brightnessValue))
            const maxLuxAllowed = sanitizedValues.value.luxMax - MIN_LUX_GAP
            const clampedLux = Math.max(safeSensorMin.value, Math.min(maxLuxAllowed, luxValue))
            console.debug('[AutoBrightnessGraph] apply min', {
                brightness: clampedBrightness,
                lux: clampedLux
            })
            emitChange({ brightnessMax: clampedBrightness, luxMin: Math.round(clampedLux) })
        } else if (type === 'point-max') {
            const maxBrightnessAllowed = sanitizedValues.value.brightnessMax - MIN_BRIGHTNESS_GAP
            const clampedBrightness = Math.min(maxBrightnessAllowed, Math.max(0, brightnessValue))
            const minLuxAllowed = sanitizedValues.value.luxMin + MIN_LUX_GAP
            const clampedLux = Math.min(safeSensorMax.value, Math.max(minLuxAllowed, luxValue))
            console.debug('[AutoBrightnessGraph] apply max', {
                brightness: clampedBrightness,
                lux: clampedLux
            })
            emitChange({ brightnessMin: clampedBrightness, luxMax: Math.round(clampedLux) })
        }
    }
}

function startDrag(type, event) {
    event.preventDefault()
    activeDrag.value = type
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
}

function endDrag() {
    if (!activeDrag.value) return
    activeDrag.value = null
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', endDrag)
    window.removeEventListener('pointercancel', endDrag)
}

onBeforeUnmount(() => {
    endDrag()
})

const tooltipMinLabel = computed(
    () => `🌙 ${formatLux(sanitizedValues.value.luxMin)} → 💡 ${formatBrightness(sanitizedValues.value.brightnessMax)}`
)
const tooltipMaxLabel = computed(() => {
    const isOff = sanitizedValues.value.brightnessMin <= 0
    const label = isOff ? 'выкл' : formatBrightness(sanitizedValues.value.brightnessMin)
    return `☀️ ${formatLux(sanitizedValues.value.luxMax)} → 💡 ${label}`
})

const tooltipWidth = (label) => Math.max(120, Math.min(220, label.length * 7))
const clampTooltipX = (x, width) =>
    Math.min(
        Math.max(x, plotArea.value.x + width / 2),
        plotArea.value.x + plotArea.value.width - width / 2
    )

const tooltipMinWidth = computed(() => tooltipWidth(tooltipMinLabel.value))
const tooltipMaxWidth = computed(() => tooltipWidth(tooltipMaxLabel.value))

const tooltipMinPosition = computed(() => ({
    x: clampTooltipX(sensorMinPointX.value, tooltipMinWidth.value),
    y: Math.max(plotArea.value.y + 18, brightnessMaxPointY.value - 34)
}))
const tooltipMaxPosition = computed(() => ({
    x: clampTooltipX(sensorMaxPointX.value, tooltipMaxWidth.value),
    y: Math.max(plotArea.value.y + 18, brightnessMinPointY.value - 34)
}))
</script>

<template>
    <div class="auto-graph">
        <svg ref="graphRef" :viewBox="`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="auto-graph-brightness" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="rgba(255, 255, 255, 0)" />
                    <stop offset="50%" stop-color="rgba(255, 255, 255, 0.5)" />
                    <stop offset="100%" stop-color="rgba(255, 255, 255, 1)" />
                </linearGradient>
            </defs>
            <text class="axis-emoji axis-emoji--lamp" :x="plotArea.x - 30" :y="plotArea.y - 8">💡</text>
            <text class="axis-emoji axis-emoji--sensor" :x="plotArea.x + plotArea.width + 12"
                :y="plotArea.y + plotArea.height + 24">
                ☀️
            </text>
            <rect class="auto-graph__background" :x="plotArea.x" :y="plotArea.y" :width="plotArea.width"
                :height="plotArea.height" />
            <rect class="auto-graph__brightness" :x="plotArea.x" :y="plotArea.y" :width="plotArea.width"
                :height="plotArea.height" />
            <g class="auto-graph__grid">
                <line v-for="tick in sensorTicks" :key="`tick-x-${tick}`" class="auto-graph__grid-line"
                    :x1="sensorToX(tick)" :x2="sensorToX(tick)" :y1="plotArea.y" :y2="plotArea.y + plotArea.height"
                    :stroke-dasharray="tick === safeSensorMin ? '' : '3 6'" />
                <line v-for="tick in brightnessTicks" :key="`tick-y-${tick}`" class="auto-graph__grid-line"
                    :x1="plotArea.x" :x2="plotArea.x + plotArea.width" :y1="brightnessToY(tick)"
                    :y2="brightnessToY(tick)" :stroke-dasharray="tick === 0 || tick === 100 ? '' : '3 6'" />
            </g>
            <path class="auto-graph__line" :d="linePath" />
            <g class="graph-handle graph-handle--moon"
                :transform="`translate(${sensorMinPointX}, ${brightnessMaxPointY})`"
                @pointerdown="startDrag('point-min', $event)">
                <circle class="graph-handle__circle" r="13" />
                <text class="graph-handle__emoji" dy="5">🌙</text>
            </g>
            <g class="graph-handle graph-handle--sun"
                :transform="`translate(${sensorMaxPointX}, ${brightnessMinPointY})`"
                @pointerdown="startDrag('point-max', $event)">
                <circle class="graph-handle__circle" r="13" />
                <text class="graph-handle__emoji" dy="5">☀️</text>
            </g>

            <g class="axis axis--vertical">
                <line :x1="plotArea.x" :x2="plotArea.x" :y1="plotArea.y" :y2="plotArea.y + plotArea.height" />
                <g v-for="tick in brightnessTicks" :key="`label-y-${tick}`"
                    :transform="`translate(${plotArea.x}, ${brightnessToY(tick)})`">
                    <text class="axis__label axis__label--vertical" x="-12" dy="0.32em">
                        {{ formatBrightness(tick) }}
                    </text>
                </g>
            </g>

            <g class="axis axis--horizontal">
                <line :x1="plotArea.x" :x2="plotArea.x + plotArea.width" :y1="plotArea.y + plotArea.height"
                    :y2="plotArea.y + plotArea.height" />
                <g v-for="tick in sensorTicks" :key="`label-x-${tick}`"
                    :transform="`translate(${sensorToX(tick)}, ${plotArea.y + plotArea.height})`">
                    <text class="axis__label axis__label--horizontal" y="18" text-anchor="middle">
                        {{ formatLux(tick) }}
                    </text>
                </g>
            </g>

            <g class="point-tooltip" :transform="`translate(${tooltipMinPosition.x}, ${tooltipMinPosition.y})`">
                <rect :x="-(tooltipMinWidth / 2)" y="-18" :width="tooltipMinWidth" height="26" rx="8" />
                <text text-anchor="middle" dy="-2">
                    {{ tooltipMinLabel }}
                </text>
            </g>
            <g class="point-tooltip" :transform="`translate(${tooltipMaxPosition.x}, ${tooltipMaxPosition.y})`">
                <rect :x="-(tooltipMaxWidth / 2)" y="-18" :width="tooltipMaxWidth" height="26" rx="8" />
                <text text-anchor="middle" dy="-2">
                    {{ tooltipMaxLabel }}
                </text>
            </g>
        </svg>
    </div>
</template>

<style scoped>
.auto-graph {
    width: 100%;
    max-width: 420px;
    margin: 12px 0 0;
}

svg {
    width: 100%;
    height: auto;
    aspect-ratio: 320 / 260;
}

.auto-graph__background {
    fill: rgba(15, 23, 42, 0.65);
    stroke: rgba(255, 255, 255, 0.04);
    stroke-width: 1;
}

.auto-graph__brightness {
    fill: url(#auto-graph-brightness);
    pointer-events: none;
}

.auto-graph__grid-line {
    stroke: rgba(148, 163, 184, 0.15);
    stroke-width: 1;
}

.auto-graph__line {
    stroke: #8b5cf6;
    stroke-width: 4;
    fill: none;
}

.graph-handle {
    cursor: pointer;
}

.graph-handle__circle {
    stroke: rgba(15, 23, 42, 0.7);
    stroke-width: 3;
}

.graph-handle--sun .graph-handle__circle {
    fill: #fefce8;
}

.graph-handle--moon .graph-handle__circle {
    fill: #312e81;
}

.graph-handle__emoji {
    font-size: 14px;
    text-anchor: middle;
    pointer-events: none;
}

.axis line {
    stroke: rgba(226, 232, 240, 0.25);
    stroke-width: 1.5;
}

.axis__label {
    fill: #94a3b8;
    font-size: 11px;
    font-weight: 500;
}

.axis__label--vertical {
    text-anchor: end;
}

.axis-emoji {
    font-size: 16px;
}

.point-tooltip rect {
    fill: #7c3aed;
    stroke: rgba(203, 213, 225, 0.6);
    stroke-width: 1;
}

.point-tooltip text {
    fill: #f8fafc;
    font-size: 12px;
    font-weight: 600;
}
</style>
