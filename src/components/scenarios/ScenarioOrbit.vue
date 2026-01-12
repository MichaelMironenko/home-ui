<script setup>
import { computed, ref } from 'vue'
import DialFace from '../dial/DialFace.vue'
import { useConflictPopup } from '../../composables/useConflictPopup'

const props = defineProps({
    groupRings: {
        type: Array,
        default: () => []
    },
    scenarioArcGradients: {
        type: Array,
        default: () => []
    },
    groupLabelPaths: {
        type: Array,
        default: () => []
    },
    orbitConflictSegments: {
        type: Array,
        default: () => []
    },
    activeScenarioId: {
        type: [String, Number],
        default: null
    },
    activeGroupId: {
        type: [String, Number],
        default: null
    },
    environment: {
        type: Object,
        default: () => ({ sunriseMin: 0, sunsetMin: 0 })
    },
    dialFaceScale: {
        type: Number,
        default: 0.66
    },
    currentNeedleCoords: {
        type: Function,
        required: true
    },
    formatOverlapWindow: {
        type: Function,
        required: true
    },
    formatConflictLabel: {
        type: Function,
        required: true
    }
})

const emit = defineEmits(['ring-enter', 'ring-leave', 'ring-toggle-pin'])

const orbitDialEl = ref(null)
const conflictPopupEl = ref(null)
const MINUTES_PER_DAY = 1440
const FULL_CIRCLE_DEG = 360

const {
    conflictPopup,
    conflictPopupStyle,
    handleConflictHover,
    handleConflictClick,
    clearConflictPopup
} = useConflictPopup({
    orbitDialEl,
    conflictPopupEl,
    formatOverlapWindow: props.formatOverlapWindow,
    formatConflictLabel: props.formatConflictLabel
})

const conflictStroke = '#00000022'

const evenHourGuides = computed(() => {
    const inner = 100 * props.dialFaceScale
    const outer = 100
    const guides = []
    for (let hour = 0; hour < 24; hour += 1) {
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

function minuteToAngle(minute) {
    const normalized = ((Number(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    return (normalized / MINUTES_PER_DAY) * FULL_CIRCLE_DEG + 90
}

function angleToPoint(angle, radius) {
    const rad = (angle * Math.PI) / 180
    return {
        x: 100 + radius * Math.cos(rad),
        y: 100 + radius * Math.sin(rad)
    }
}
</script>

<template>
    <section class="scenario-orbit">
        <div ref="orbitDialEl" class="orbit-dial">
            <svg viewBox="0 0 200 200" class="orbit-dial-svg" aria-hidden="true">
                <defs>
                    <linearGradient v-for="entry in scenarioArcGradients" :key="entry.id" :id="entry.id"
                        gradientUnits="userSpaceOnUse" v-bind="entry.vector">
                        <stop offset="0%" :stop-color="entry.colors.start" />
                        <stop offset="100%" :stop-color="entry.colors.end" />
                    </linearGradient>
                    <path v-for="label in groupLabelPaths" :key="label.id" :id="label.id" :d="label.path" />
                </defs>
                <circle class="orbit-outer-bg" cx="100" cy="100" r="100" />
                <g v-if="evenHourGuides.length" class="orbit-hour-guides">
                    <line v-for="guide in evenHourGuides" :key="`even-hour-${guide.minute}`" :x1="guide.start.x"
                        :y1="guide.start.y" :x2="guide.end.x" :y2="guide.end.y" />
                </g>
                <g class="orbit-rings">
                    <g v-for="group in groupRings" :key="group.id" class="orbit-group">
                        <text v-if="group.label?.text && activeGroupId === group.id" class="orbit-group-label">
                            <textPath :href="`#${group.label.id}`" :xlink:href="`#${group.label.id}`"
                                startOffset="100%">
                                {{ group.label.text }}
                            </textPath>
                        </text>
                        <g v-for="entry in group.scenarios" :key="entry.key" class="orbit-ring" :class="{
                            inactive: entry.isInactive,
                            active: entry.isRunning,
                            hovered: entry.scenarioId === activeScenarioId
                        }" @mouseenter="emit('ring-enter', entry.scenarioId)"
                            @mouseleave="emit('ring-leave', entry.scenarioId)"
                            @click="emit('ring-toggle-pin', entry.scenarioId)">
                            <path v-if="entry.kind === 'path'" :d="entry.path" :stroke="entry.stroke"
                                :stroke-width="entry.width" />
                            <circle v-else-if="entry.kind === 'circle'" cx="100" cy="100" :r="entry.radius" fill="none"
                                :stroke="entry.stroke" :stroke-width="entry.width" />
                        </g>
                    </g>
                </g>
                <g class="orbit-face-layer"
                    :transform="`translate(100 100) scale(${dialFaceScale}) translate(-100 -100)`">
                    <circle class="orbit-face-bg" cx="100" cy="100" r="100" />
                    <DialFace :sunrise-minute="environment.sunriseMin" :sunset-minute="environment.sunsetMin" />
                </g>
                <line class="orbit-needle" :x1="currentNeedleCoords().start.x" :y1="currentNeedleCoords().start.y"
                    :x2="currentNeedleCoords().end.x" :y2="currentNeedleCoords().end.y" />
                <g v-if="orbitConflictSegments.length" class="orbit-conflicts" @pointerleave="clearConflictPopup">
                    <template v-for="conflict in orbitConflictSegments" :key="conflict.key">
                        <path v-if="conflict.kind === 'path'" class="orbit-conflict-hit" :d="conflict.path"
                            :stroke-width="conflict.width" @pointerdown.stop
                            @pointerenter="(event) => handleConflictHover(conflict, event)"
                            @pointerleave="clearConflictPopup"
                            @click.stop="(event) => handleConflictClick(conflict, event)" />
                        <path v-if="conflict.kind === 'path'" :d="conflict.path" :stroke="conflictStroke"
                            :stroke-width="conflict.width" />
                        <circle v-else-if="conflict.kind === 'circle'" class="orbit-conflict-hit" cx="100" cy="100"
                            :r="conflict.radius" fill="none" :stroke-width="conflict.width" @pointerdown.stop
                            @pointerenter="(event) => handleConflictHover(conflict, event)"
                            @pointerleave="clearConflictPopup"
                            @click.stop="(event) => handleConflictClick(conflict, event)" />
                        <circle v-else-if="conflict.kind === 'circle'" cx="100" cy="100" :r="conflict.radius"
                            fill="none" :stroke="conflictStroke" :stroke-width="conflict.width" />
                    </template>
                </g>
            </svg>
            <div class="orbit-dial-hint">
                <span>Карта дня</span>
                <span class="orbit-dial-sub orbit-dial-sub--desktop">Наведите на дугу, чтобы увидеть сценарий</span>
                <span class="orbit-dial-sub orbit-dial-sub--mobile">Нажмите на дугу, чтобы показать сценарий</span>
            </div>
            <div v-if="conflictPopup" ref="conflictPopupEl" class="orbit-conflict-hint" :style="conflictPopupStyle">
                <span>{{ conflictPopup.time }}</span>
                <span>{{ conflictPopup.label }}</span>
            </div>
        </div>
    </section>
</template>

<style scoped>
.scenario-orbit {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: stretch;
    background: radial-gradient(circle at top, rgba(30, 41, 59, 0.6), rgba(2, 6, 23, 0.9));
    border-radius: 24px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 20px;
    box-shadow: 0 18px 40px rgba(2, 6, 23, 0.55);
    position: relative;
    z-index: 5;
}

.orbit-dial {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    width: 100%;
    position: relative;
    z-index: 2;
}

.orbit-dial-svg {
    width: 100%;
    aspect-ratio: 1 / 1;
    display: block;
    background: radial-gradient(circle at center, rgba(15, 23, 42, 0.6), rgba(2, 6, 23, 0.95));
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.6);
}

.orbit-outer-bg {
    fill: var(--bg-primary);
    filter: drop-shadow(0 0 18px rgba(0, 0, 0, 0.65));
}

.orbit-face-layer {
    filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.35));
}

.orbit-face-bg {
    fill: var(--surface-card);
    stroke: rgba(0, 0, 0, 0.65);
    stroke-width: 1px;
}

.orbit-needle {
    stroke: #f87171;
    stroke-width: 1px;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.6));
}

.orbit-rings path,
.orbit-rings circle {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: stroke;
    transition: opacity 1s ease, filter 0.4s ease;
}

.orbit-group-label {
    fill: rgba(255, 255, 255, 0.5);
    font-size: 6px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: none;
    text-anchor: end;
}

.orbit-group-label textPath {
    text-anchor: end;
}

.orbit-hour-guides line {
    stroke: rgba(255, 255, 255, 0.1);
    stroke-width: 0.8;
    stroke-dasharray: 5 5;
    vector-effect: non-scaling-stroke;
}

.orbit-conflicts path,
.orbit-conflicts circle {
    fill: none;
    stroke-dasharray: 1 4;
    opacity: 1;
    pointer-events: auto;
}

.orbit-conflicts {
    opacity: 1;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.35));
}

.orbit-conflict-hit {
    stroke: transparent;
    stroke-dasharray: none;
    stroke-linecap: round;
    pointer-events: stroke;
    cursor: pointer;
}

.orbit-ring.inactive .orbit-conflicts path,
.orbit-ring.inactive .orbit-conflicts circle {
    opacity: 1;
}

.orbit-ring {
    opacity: 0.5;
    cursor: pointer;
    transition: opacity 1s ease;
}

.orbit-ring.hovered,
.orbit-ring.active {
    opacity: 1;
}

.orbit-ring.active path,
.orbit-ring.active circle {
    animation: orbit-ring-pulse 2.8s ease-in-out infinite;
}

.orbit-dial-hint {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
    color: var(--text-primary);
    font-weight: 600;
}

.orbit-dial-sub {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
}

.orbit-dial-sub--mobile {
    display: none;
}

.orbit-conflict-hint {
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

@keyframes orbit-ring-pulse {
    0% {
        opacity: 0.7;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0.7;
    }
}

@media (max-width: 640px) {
    .orbit-dial-sub--desktop {
        display: none;
    }

    .orbit-dial-sub--mobile {
        display: inline;
    }
}
</style>
