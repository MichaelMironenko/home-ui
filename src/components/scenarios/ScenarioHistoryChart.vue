<script setup>
import { computed, ref } from 'vue'
import { normalizeScenarioEvents } from '../../domain/scenarioHistory/normalizeEvents'
import { buildTimelineScale, DEFAULT_CHART_SIZE, DEFAULT_CHART_PADDING } from '../../charts/useTimelineScale'

const VIEWBOX_SIZE = DEFAULT_CHART_SIZE
const PADDING = DEFAULT_CHART_PADDING

const props = defineProps({
    events: {
        type: Array,
        default: () => []
    },
    maxWindowMs: {
        type: Number,
        default: 12 * 60 * 60 * 1000
    },
    defaultColor: {
        type: String,
        default: '#a855f7'
    }
})

const chartRef = ref(null)
const hoveredPoint = ref(null)

const normalizedEvents = computed(() =>
    normalizeScenarioEvents(props.events, { fallbackColor: props.defaultColor })
)

const chartScale = computed(() =>
    buildTimelineScale(normalizedEvents.value, {
        maxWindowMs: props.maxWindowMs
    })
)

const chartPoints = computed(() => chartScale.value?.points ?? [])
const lineSegments = computed(() => chartScale.value?.segments ?? [])
const gradientSegments = computed(() => lineSegments.value.filter((segment) => segment.type === 'normal'))
const ticks = computed(() => chartScale.value?.ticks ?? [])
const axisMarkers = computed(() => chartScale.value?.axisMarkers ?? [])
const gridMarkers = computed(() => chartScale.value?.gridMarkers ?? [])
const isEmpty = computed(() => !chartScale.value || !lineSegments.value.length)

const statusMarkers = computed(() =>
    chartPoints.value
        .filter((point) => (point.statusLabel || point.sensorOff) && point.statusKind !== 'pause')
        .map((point) => ({
            id: point.id,
            x: point.x,
            label: point.statusLabel,
            isSensorOff: !!point.sensorOff
        }))
)

const tooltipStyle = computed(() => {
    if (!hoveredPoint.value) return null
    const leftPercent = Math.min(Math.max((hoveredPoint.value.x / VIEWBOX_SIZE) * 100, 0), 100)
    const topPercent = Math.min(Math.max((hoveredPoint.value.y / VIEWBOX_SIZE) * 100, 0), 100)
    return {
        left: `${leftPercent}%`,
        top: `${topPercent}%`
    }
})

function findClosestPoint(targetX) {
    let closest = null
    let minDelta = Infinity
    for (const point of chartPoints.value) {
        const delta = Math.abs(point.x - targetX)
        if (delta < minDelta) {
            minDelta = delta
            closest = point
        }
    }
    return closest
}

function handlePointerMove(event) {
    const rect = chartRef.value?.getBoundingClientRect()
    if (!rect) return
    const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
    const targetX = rect.width ? (relativeX / rect.width) * VIEWBOX_SIZE : VIEWBOX_SIZE / 2
    hoveredPoint.value = findClosestPoint(targetX)
}

function handlePointerLeave() {
    hoveredPoint.value = null
}

function handleTouch(event) {
    const touch = event.touches?.[0] || event.changedTouches?.[0]
    if (!touch) return
    handlePointerMove({ clientX: touch.clientX })
}

function handleTouchEnd() {
    hoveredPoint.value = null
}

</script>

<template>
    <div class="scenario-history-chart" ref="chartRef" @pointermove="handlePointerMove"
        @pointerleave="handlePointerLeave" @touchstart.prevent="handleTouch" @touchmove.prevent="handleTouch"
        @touchend="handleTouchEnd">
        <div class="scenario-history-header">
            <div>
                <p class="scenario-history-title">История</p>
            </div>
        </div>
        <div class="scenario-history-body" v-if="!isEmpty">
            <svg :viewBox="`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`" role="img" aria-label="График яркости сценария">
                <defs>
                    <linearGradient v-for="segment in gradientSegments" :key="segment.gradientId"
                        :id="segment.gradientId" gradientUnits="userSpaceOnUse" :x1="segment.start.x"
                        :y1="segment.start.y" :x2="segment.end.x" :y2="segment.end.y">
                        <stop offset="0%" :stop-color="segment.start.color" />
                        <stop offset="100%" :stop-color="segment.end.color" />
                    </linearGradient>
                </defs>
                <g class="axis-lines">
                    <line :x1="PADDING.left" :x2="VIEWBOX_SIZE - PADDING.right" :y1="PADDING.top" :y2="PADDING.top"
                        class="axis-line" />
                    <line :x1="PADDING.left" :x2="VIEWBOX_SIZE - PADDING.right" :y1="VIEWBOX_SIZE - PADDING.bottom"
                        :y2="VIEWBOX_SIZE - PADDING.bottom" class="axis-line" />
                </g>
                <g class="reference-lines">
                    <line v-for="marker in gridMarkers" :key="marker.label" :x1="PADDING.left"
                        :x2="VIEWBOX_SIZE - PADDING.right" :y1="marker.y" :y2="marker.y"
                        class="axis-line axis-line--dashed" />
                    <text v-for="marker in axisMarkers" :key="`label-${marker.label}`" :x="0" :y="marker.y"
                        class="axis-label axis-label-inline">
                        {{ marker.label }}
                    </text>
                </g>
                <g class="axis-ticks">
                    <line v-for="tick in ticks" :key="tick.label" :x1="tick.x" :x2="tick.x"
                        :y1="VIEWBOX_SIZE - PADDING.bottom" :y2="VIEWBOX_SIZE - PADDING.bottom + 6" class="tick-line" />
                    <text v-for="tick in ticks" :key="`label-${tick.label}`" :x="tick.x"
                        :y="VIEWBOX_SIZE - PADDING.bottom + 28" dx="-10" class="tick-label">
                        {{ tick.label }}
                    </text>
                </g>
                <g class="line-path">
                    <path v-for="segment in lineSegments" :key="segment.id"
                        :d="`M${segment.start.x},${segment.start.y} L${segment.end.x},${segment.end.y}`"
                        :stroke="segment.type === 'normal' ? `url(#${segment.gradientId})` : '#24314e'"
                        stroke-width="10" stroke-linecap="round" stroke-linejoin="round"
                        :stroke-dasharray="segment.type === 'pause' ? '5 15' : segment.type === 'sensor-off' ? '4 4' : '0'" />
                </g>
                <g class="status-markers">
                    <rect v-for="marker in statusMarkers" :key="marker.id" :x="marker.x - 6"
                        :y="VIEWBOX_SIZE - PADDING.bottom + 4" width="12" height="6"
                        :class="['status-marker', marker.isSensorOff ? 'status-marker--sensor' : '']">
                        <title>{{ marker.label || 'Состояние сценария' }}</title>
                    </rect>
                </g>
                <g v-if="hoveredPoint" class="hover-indicator">
                    <line :x1="hoveredPoint.x" :x2="hoveredPoint.x" :y1="PADDING.top"
                        :y2="VIEWBOX_SIZE - PADDING.bottom" class="hover-line" />
                    <circle :cx="hoveredPoint.x" :cy="hoveredPoint.y" r="5" class="hover-dot" :fill="hoveredPoint.color"
                        stroke="#0f172a" stroke-width="2" />
                </g>
            </svg>
            <div v-if="hoveredPoint" class="scenario-history-tooltip" :style="tooltipStyle">
                <p class="tooltip-time">{{ hoveredPoint.displayTime }}</p>
                <p class="tooltip-brightness">
                    <span>Яркость:</span>
                    <strong>{{ hoveredPoint.displayBrightness }}</strong>
                </p>
                <p class="tooltip-color">
                    <span>Цвет:</span>
                    <span class="color-chip" :style="{ background: hoveredPoint.color }"></span>
                    <strong>{{ hoveredPoint.color?.toUpperCase() }}</strong>
                </p>
                <p v-if="hoveredPoint.statusLabel" class="tooltip-status">{{ hoveredPoint.statusLabel }}</p>
            </div>
        </div>
        <div v-else class="scenario-history-empty">
            <p>История обновится, как только появятся события за последний отрезок времени.</p>
        </div>
    </div>
</template>

<style scoped>
.scenario-history-chart {
    background: var(--surface-card);
    border-radius: 22px;
    border: 1px solid var(--surface-border);
    padding: 18px;
    box-shadow: 0 20px 40px rgba(2, 6, 23, 0.35);
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--text-primary);
    width: 100%;
    margin: 0 auto;
}

.scenario-history-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.scenario-history-title {
    margin: 0;
    font-weight: 600;
    font-size: 16px;
}

.scenario-history-subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    color: rgba(148, 163, 184, 0.9);
}

.scenario-history-body {
    position: relative;
    width: 100%;
    max-width: 450px;
    aspect-ratio: 1 / 1;
    margin: 0 auto;
}

.scenario-history-body svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
}


.axis-line {
    stroke: rgba(148, 163, 184, 0.35);
    stroke-width: 1;
}

.axis-line--dashed {
    stroke-dasharray: 4 6;
}

.tick-line {
    stroke: rgba(148, 163, 184, 0.5);
    stroke-width: 1;
}

.tick-label {
    font-size: 22px;
    fill: rgba(226, 232, 240, 0.8);
    text-anchor: middle;
}

.axis-label {
    font-size: 22px;
    fill: rgba(226, 232, 240, 0.7);
    text-anchor: end;
    dominant-baseline: middle;
}

.axis-label-inline {
    text-anchor: start;
}

.reference-lines line {
    stroke: rgba(226, 232, 240, 0.3);
    stroke-width: 1;
}

.status-marker {
    opacity: 0.9;
    rx: 3;
}

.status-marker--sensor {
    fill: rgba(248, 113, 113, 0.7);
}

.status-marker--pause {
    fill: rgba(59, 130, 246, 0.7);
}

.hover-line {
    stroke: rgba(244, 255, 214, 0.5);
    stroke-width: 1;
    stroke-dasharray: 3 3;
}

.hover-dot {
    filter: drop-shadow(0 3px 6px rgba(15, 23, 42, 0.25));
}

.scenario-history-tooltip {
    position: absolute;
    transform: translate(-50%, -110%);
    background: rgba(15, 23, 42, 0.95);
    border-radius: 14px;
    padding: 10px 12px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    font-size: 12px;
    color: #f8fafc;
    pointer-events: none;
    min-width: 150px;
    box-shadow: 0 10px 30px rgba(2, 6, 23, 0.35);
}

.tooltip-time {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
}

.tooltip-brightness,
.tooltip-color,
.tooltip-status {
    margin: 4px 0 0;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
}

.color-chip {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    display: inline-block;
}

.scenario-history-empty {
    min-height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: rgba(226, 232, 240, 0.8);
    border: 1px dashed rgba(148, 163, 184, 0.5);
    border-radius: 16px;
    padding: 32px;
}

@media (max-width: 600px) {
    .scenario-history-header {
        flex-direction: column;
    }

    .scenario-history-hint {
        text-align: left;
    }
}
</style>
