<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
    modelValue: {
        type: Object,
        required: true
    },
    min: {
        type: Number,
        required: true
    },
    max: {
        type: Number,
        required: true
    },
    step: {
        type: Number,
        default: 1
    },
    gap: {
        type: Number,
        default: 0
    },
    defaultFrom: {
        type: Number,
        default: null
    },
    defaultTo: {
        type: Number,
        default: null
    },
    gradient: {
        type: String,
        default: 'linear-gradient(90deg, #334155 0%, #94a3b8 100%)'
    },
    gradientReverse: {
        type: String,
        default: ''
    },
    startLabel: {
        type: String,
        default: 'Старт'
    },
    endLabel: {
        type: String,
        default: 'Финиш'
    },

    ticks: {
        type: Array,
        default: () => []
    },
    tickFormatter: {
        type: Function,
        default: () => (value) => value
    },
    formatValue: {
        type: Function,
        default: () => (value) => value
    },
    marker: {
        type: Object,
        default: null
    },
    allowInvert: {
        type: Boolean,
        default: true
    },
    summary: {
        type: String,
        default: ''
    },
    startAriaLabel: {
        type: String,
        default: ''
    },
    endAriaLabel: {
        type: String,
        default: ''
    }
})

const emit = defineEmits(['update:modelValue', 'invert'])

const trackRef = ref(null)
let activeDrag = null

const clampValue = (value) => {
    if (!Number.isFinite(value)) return props.min
    return Math.min(Math.max(value, props.min), props.max)
}

const snapValue = (value) => {
    if (!Number.isFinite(value)) return props.min
    if (props.step <= 0) return clampValue(value)
    const snapped = props.min + Math.round((value - props.min) / props.step) * props.step
    return clampValue(snapped)
}

const clampBetween = (value, min, max) => {
    const low = Math.min(min, max)
    const high = Math.max(min, max)
    const clamped = Math.min(Math.max(value, low), high)
    return clampValue(clamped)
}

const sanitizeNumber = (value, fallback) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
}

const rangeSpan = computed(() => Math.max(props.max - props.min, 0.000001))

const range = computed(() => {
    const fallbackFrom = props.defaultFrom ?? props.min
    const fallbackTo = props.defaultTo ?? props.max
    const fromCandidate = props.modelValue?.from ?? fallbackFrom
    const toCandidate = props.modelValue?.to ?? fallbackTo
    const from = snapValue(sanitizeNumber(fromCandidate, fallbackFrom))
    const to = snapValue(sanitizeNumber(toCandidate, fallbackTo))
    return { from, to }
})

const percentFor = (value) => {
    const normalized = (value - props.min) / rangeSpan.value
    return Math.min(Math.max(normalized * 100, 0), 100)
}

const isDescending = computed(() => range.value.from > range.value.to)

const valueToRatio = (value) => {
    const percent = percentFor(value) / 100
    return isDescending.value ? 1 - percent : percent
}

const displayFromPercent = computed(() => valueToRatio(range.value.from) * 100)
const displayToPercent = computed(() => valueToRatio(range.value.to) * 100)
const lowerDisplayPercent = computed(() => Math.min(displayFromPercent.value, displayToPercent.value))
const upperDisplayPercent = computed(() => Math.max(displayFromPercent.value, displayToPercent.value))

const maskLeftStyle = computed(() => ({ width: `${lowerDisplayPercent.value}%` }))
const maskRightStyle = computed(() => ({ width: `${100 - upperDisplayPercent.value}%` }))
const fromThumbStyle = computed(() => ({ left: `${displayFromPercent.value}%` }))
const toThumbStyle = computed(() => ({ left: `${displayToPercent.value}%` }))

const formatValue = (value) => props.formatValue(value)
const tickFormatter = props.tickFormatter

const summaryText = computed(() => {
    if (props.summary) return props.summary
    return `${props.startLabel}: ${formatValue(range.value.from)} · ${props.endLabel}: ${formatValue(range.value.to)}`
})

const trackGradient = computed(() => {
    if (isDescending.value && props.gradientReverse) return props.gradientReverse
    return props.gradient
})

const trackStyle = computed(() => ({
    '--interval-gradient': trackGradient.value
}))

const sortedTicks = computed(() => {
    const uniques = Array.from(
        new Set(
            (props.ticks || [])
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
        )
    )
    return uniques.sort((a, b) => a - b)
})

const markerInfo = computed(() => {
    if (!props.marker || props.marker.value === undefined) return null
    const numeric = Number(props.marker.value)
    if (!Number.isFinite(numeric)) return null
    const clamped = clampValue(numeric)
    const percent = valueToRatio(clamped) * 100
    const label = props.marker.label ?? formatValue(clamped)
    return {
        percent,
        label,
        hint: props.marker.hint || props.marker.title || '',
        variant: props.marker.variant || '',
        fromBackend: props.marker.fromBackend === true
    }
})

const startAria = computed(() => props.startAriaLabel || `${props.startLabel}: ${formatValue(range.value.from)}`)
const endAria = computed(() => props.endAriaLabel || `${props.endLabel}: ${formatValue(range.value.to)}`)

const emitUpdate = (from, to) => {
    emit('update:modelValue', { from, to })
}

const applyValue = (field, rawValue) => {
    let { from, to } = range.value
    const baseStep = props.step > 0 ? props.step : Math.max(rangeSpan.value / 100, 1)
    let requiredGap = props.gap > 0 ? props.gap : baseStep
    requiredGap = Math.max(requiredGap, baseStep)
    requiredGap = Math.min(requiredGap, rangeSpan.value)

    let candidate = snapValue(rawValue)
    const descending = from > to

    if (field === 'from') {
        if (!descending) {
            const minAllowed = props.min
            const maxAllowed = Math.min(props.max, to - requiredGap)
            candidate = snapValue(clampBetween(candidate, minAllowed, maxAllowed))
            from = candidate
            if (to - from < requiredGap) {
                to = snapValue(clampBetween(from + requiredGap, from + requiredGap, props.max))
            }
        } else {
            const minAllowed = Math.min(props.max, to + requiredGap)
            const maxAllowed = props.max
            candidate = snapValue(clampBetween(candidate, minAllowed, maxAllowed))
            from = candidate
            if (from - to < requiredGap) {
                to = snapValue(clampBetween(from - requiredGap, props.min, from - requiredGap))
            }
        }
    } else {
        if (!descending) {
            const minAllowed = Math.max(props.min, from + requiredGap)
            const maxAllowed = props.max
            candidate = snapValue(clampBetween(candidate, minAllowed, maxAllowed))
            to = candidate
            if (to - from < requiredGap) {
                from = snapValue(clampBetween(to - requiredGap, props.min, to - requiredGap))
            }
        } else {
            const minAllowed = props.min
            const maxAllowed = Math.max(props.min, from - requiredGap)
            candidate = snapValue(clampBetween(candidate, minAllowed, maxAllowed))
            to = candidate
            if (from - to < requiredGap) {
                from = snapValue(clampBetween(to + requiredGap, to + requiredGap, props.max))
            }
        }
    }

    // Final enforcement after adjustments
    if (from <= to) {
        if (to - from < requiredGap) {
            to = snapValue(clampBetween(from + requiredGap, from + requiredGap, props.max))
            if (to - from < requiredGap) {
                from = snapValue(clampBetween(to - requiredGap, props.min, to - requiredGap))
            }
        }
    } else {
        if (from - to < requiredGap) {
            to = snapValue(clampBetween(from - requiredGap, props.min, from - requiredGap))
            if (from - to < requiredGap) {
                from = snapValue(clampBetween(to + requiredGap, to + requiredGap, props.max))
            }
        }
    }

    from = clampValue(from)
    to = clampValue(to)

    emitUpdate(from, to)
}

const invertValues = () => {
    if (!props.allowInvert) return
    const { from, to } = range.value
    const nextFrom = snapValue(to)
    const nextTo = snapValue(from)
    emitUpdate(nextFrom, nextTo)
    emit('invert', { from: nextFrom, to: nextTo })
}

const pointerRatio = (clientX, rect) => {
    if (!rect || rect.width === 0) return 0
    const ratio = (clientX - rect.left) / rect.width
    return Math.min(Math.max(ratio, 0), 1)
}

const ratioToValue = (ratio) => {
    const normalized = isDescending.value ? 1 - ratio : ratio
    const unclamped = props.min + normalized * rangeSpan.value
    return clampValue(unclamped)
}

const startDrag = (field, event) => {
    const track = trackRef.value
    if (!track) return
    const rect = track.getBoundingClientRect()
    if (!rect || rect.width === 0) return

    event.preventDefault()

    const pointerId = event.pointerId ?? 0
    const pointerType = event.pointerType || 'mouse'
    const startX = event.clientX
    const startY = event.clientY
    let dragging = false
    let offsetRatio = 0

    const currentValue = field === 'from' ? range.value.from : range.value.to
    const currentRatio = valueToRatio(currentValue)
    const captureTarget = event.currentTarget

    const cleanup = () => {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleCancel)
        if (dragging && captureTarget?.releasePointerCapture) {
            try { captureTarget.releasePointerCapture(pointerId) } catch { /* noop */ }
        }
        activeDrag = null
        dragging = false
    }

    const handleMove = (e) => {
        if (e.pointerId !== pointerId) return

        const dx = Math.abs(e.clientX - startX)
        const dy = Math.abs(e.clientY - startY)

        if (!dragging) {
            if (dx < 4 && dy < 4) return
            const verticalDominant = dy > dx * 1.5 && dy > 10
            if (pointerType === 'touch' && verticalDominant) { cleanup(); return }

            const pointerRatioAtStart = pointerRatio(startX, rect)
            offsetRatio = pointerRatioAtStart - currentRatio
            if (captureTarget?.setPointerCapture) captureTarget.setPointerCapture(pointerId)
            activeDrag = { pointerId, offsetRatio, rect }
            dragging = true
        }

        if (pointerType === 'touch') e.preventDefault()
        const drag = activeDrag
        if (!drag) return
        const ratioRaw = pointerRatio(e.clientX, drag.rect)
        const adjustedRatio = Math.min(Math.max(ratioRaw - (drag.offsetRatio ?? 0), 0), 1)
        const nextValue = ratioToValue(adjustedRatio)
        applyValue(field, nextValue)
    }

    const handleUp = (e) => { if (e.pointerId === pointerId) cleanup() }
    const handleCancel = (e) => {
        if (e.pointerId !== pointerId) return
        cleanup()
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleCancel)
}

const handleKey = (field, event) => {
    let delta = 0
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') delta = -props.step
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') delta = props.step

    if (delta !== 0) {
        event.preventDefault()
        const base = field === 'from' ? range.value.from : range.value.to
        applyValue(field, base + delta)
        return
    }

    if (event.key === 'Home') {
        event.preventDefault()
        applyValue(field, props.min)
    } else if (event.key === 'End') {
        event.preventDefault()
        applyValue(field, props.max)
    }
}
</script>

<template>
    <div class="interval-slider">
        <p v-if="summaryText" class="interval-slider__summary">{{ summaryText }}</p>
        <div class="interval-slider__control">
            <div class="interval-slider__track-wrapper">
                <div class="interval-slider__track" ref="trackRef" :style="trackStyle">
                    <div class="interval-slider__mask interval-slider__mask--left" :style="maskLeftStyle"></div>
                    <div class="interval-slider__mask interval-slider__mask--right" :style="maskRightStyle"></div>

                    <button type="button" class="interval-slider__thumb interval-slider__thumb--from" role="slider"
                        :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="Math.round(range.from)"
                        :aria-label="startAria" aria-orientation="horizontal" :style="fromThumbStyle"
                        @pointerdown="startDrag('from', $event)" @keydown="handleKey('from', $event)"></button>

                    <button type="button" class="interval-slider__thumb interval-slider__thumb--to" role="slider"
                        :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="Math.round(range.to)"
                        :aria-label="endAria" aria-orientation="horizontal" :style="toThumbStyle"
                        @pointerdown="startDrag('to', $event)" @keydown="handleKey('to', $event)"></button>

                    <span v-if="markerInfo" class="interval-slider__marker" :class="{
                        'interval-slider__marker--backend': markerInfo.fromBackend,
                        [`interval-slider__marker--${markerInfo.variant}`]: markerInfo.variant
                    }" :style="{ left: `${markerInfo.percent}%` }" :title="markerInfo.hint || undefined">
                        <span class="interval-slider__marker-label">{{ markerInfo.label }}</span>
                    </span>
                </div>

                <div v-if="sortedTicks.length" class="interval-slider__ticks">
                    <span v-for="tick in sortedTicks" :key="tick" class="interval-slider__tick"
                        :style="{ left: `${valueToRatio(tick) * 100}%` }">
                        <span class="interval-slider__tick-mark"></span>
                        <span class="interval-slider__tick-label">{{ tickFormatter(tick) }}</span>
                    </span>
                </div>
            </div>

            <button v-if="allowInvert" type="button" class="interval-slider__invert" @click="invertValues"
                title="Поменять начало и конец">
                ⇄
            </button>
        </div>
    </div>
</template>

<style scoped>
.interval-slider {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.interval-slider__summary {
    margin: 0;
    font-size: 13px;
    color: #dbeafe;
}

.interval-slider__control {
    display: flex;
    align-items: center;
    gap: 12px;
}

.interval-slider__track-wrapper {
    flex: 1;
    position: relative;
    min-width: 0;
}

.interval-slider__track {
    position: relative;
    height: 36px;
    border-radius: 18px;
    border: 1px solid rgba(96, 165, 250, 0.4);
    overflow: visible;
    background: transparent;
}

.interval-slider__track::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--interval-gradient, linear-gradient(90deg, #4c1d95 0%, #5eead4 100%));
}

.interval-slider__mask {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(15, 23, 42, 0.65);
    pointer-events: none;
    z-index: 1;
}

.interval-slider__mask--left {
    left: 0;
    border-top-left-radius: 18px;
    border-bottom-left-radius: 18px;
}

.interval-slider__mask--right {
    right: 0;
    border-top-right-radius: 18px;
    border-bottom-right-radius: 18px;
}

.interval-slider__thumb {
    position: absolute;
    top: 50%;
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    transform: translate(-50%, -50%);
    cursor: pointer;
    z-index: 3;
    touch-action: none;
}

.interval-slider__thumb::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 16px;
    height: 28px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(124, 58, 237, 0.85));
    border: 2px solid rgba(125, 211, 252, 0.8);
    box-shadow: 0 2px 6px rgba(13, 18, 33, 0.4);
    transform: translate(-50%, -50%);
}

.interval-slider__thumb:focus-visible::after {
    box-shadow: 0 0 0 3px rgba(191, 219, 254, 0.45);
}

.interval-slider__marker {
    position: absolute;
    top: calc(36px + 6px);
    transform: translate(-50%, 0);
    background: rgba(15, 23, 42, 0.9);
    border-radius: 8px;
    padding: 3px 6px;
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    color: #f8fafc;
    pointer-events: auto;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.45);
    white-space: nowrap;
    z-index: 4;
}

.interval-slider__marker--backend {
    background: rgba(30, 64, 175, 0.9);
}

.interval-slider__marker-label {
    font-variant-numeric: tabular-nums;
}

.interval-slider__ticks {
    position: relative;
    height: 24px;
    margin-top: 8px;
}

.interval-slider__tick {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: #cbd5f5;
    pointer-events: none;
}

.interval-slider__tick-mark {
    width: 2px;
    height: 8px;
    border-radius: 1px;
    background: rgba(148, 163, 184, 0.6);
}

.interval-slider__tick-label {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.interval-slider__invert {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 14px;
    height: 36px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.35);
    color: #e2e8f0;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    font-size: 14px;
}

.interval-slider__invert:hover {
    background: rgba(59, 130, 246, 0.35);
    transform: translateY(-1px);
}

.interval-slider__invert-text {
    font-size: 13px;
}

@media (max-width: 680px) {
    .interval-slider__invert {
        padding: 0 12px;
        font-size: 13px;
    }
}
</style>
