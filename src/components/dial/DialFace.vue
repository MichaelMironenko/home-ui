<script setup>
import { computed } from 'vue'

const props = defineProps({
    sunriseMinute: {
        type: Number,
        default: 0
    },
    sunsetMinute: {
        type: Number,
        default: 0
    },
    currentMinute: {
        type: Number,
        default: null
    },
    showNeedle: {
        type: Boolean,
        default: false
    }
})

const FACE_CENTER = 100
const MINUTES_PER_DAY = 1440
const FULL_CIRCLE_DEG = 360
const TICK_EDGE_RATIO = 20
const NUMBER_RADIUS_RATIO = 3.5
const DIAL_DAY_COLOR = 'rgba(255, 216, 170, 0.82)'
const DIAL_NIGHT_COLOR = '#4a88e8'
const NEEDLE_INNER = 46
const NEEDLE_OUTER = 78

const TICK_OUTER_RADIUS_NORM = FACE_CENTER - FACE_CENTER / TICK_EDGE_RATIO
const NUMBER_RADIUS_NORM = FACE_CENTER - FACE_CENTER / NUMBER_RADIUS_RATIO

const hourLabels = computed(() => Array.from({ length: 12 }, (_, i) => i * 2))

const innerTickMarks = computed(() => {
    const tickCount = 96
    const outer = TICK_OUTER_RADIUS_NORM
    const majorInner = outer - 5
    const hourInner = outer - 5
    const minorInner = outer - 2
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
    const radius = NUMBER_RADIUS_NORM
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

const currentNeedle = computed(() => {
    if (!props.showNeedle || !Number.isFinite(props.currentMinute)) return null
    const angle = minuteToAngle(props.currentMinute)
    return {
        start: angleToPoint(angle, NEEDLE_INNER),
        end: angleToPoint(angle, NEEDLE_OUTER)
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

function minuteToAngle(minute) {
    const normalized = normalizeMinutes(minute)
    return (normalized / MINUTES_PER_DAY) * FULL_CIRCLE_DEG + 90
}

function angleToPoint(angle, radius = FACE_CENTER) {
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

function normalizeMinutes(value) {
    let next = Number(value) % MINUTES_PER_DAY
    if (next < 0) next += MINUTES_PER_DAY
    return next
}
</script>

<template>
    <g class="dial-face-base">
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
        <line v-if="currentNeedle" class="current-needle" :x1="currentNeedle.start.x"
            :y1="currentNeedle.start.y" :x2="currentNeedle.end.x" :y2="currentNeedle.end.y" />
    </g>
</template>

<style scoped>
.dial-face-bg {
    fill: transparent;
}

.face-ticks line {
    stroke-linecap: round;
    stroke-width: 1px;
}

.face-hour {
    font-size: 14px;
    font-weight: 600;
    dominant-baseline: middle;
    text-anchor: middle;
    letter-spacing: 0.04em;
}

.current-needle {
    stroke: #f87171;
    stroke-width: 2px;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.45));
    pointer-events: none;
}
</style>
