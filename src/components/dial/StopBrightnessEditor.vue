<script setup>
import { computed, toRef, watch } from 'vue'

import { useAutoBrightnessEditor } from '../../composables/useAutoBrightnessEditor'
import { useRangeLinkMetrics } from '../../composables/useRangeLinkMetrics'
import { luxToPercent } from '../../utils/autoBrightnessMapping'
import { formatLuxLabel, formatLuxTick, formatPercentValue } from '../../utils/formatters'
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps({
    stop: {
        type: Object,
        required: true
    },
    autoBrightness: {
        type: Object,
        required: true
    },
    sensorOptions: {
        type: Array,
        default: () => []
    },
    isStartContext: {
        type: Boolean,
        default: true
    },
    open: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['update:stop', 'update:autoBrightness'])

const openRef = toRef(props, 'open')
const sensorOptionsRef = toRef(props, 'sensorOptions')
const autoDraft = toRef(props, 'autoBrightness')

const brightnessGradient = 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 100%)'

function commitStop(patch) {
    emit('update:stop', patch)
}

function commitAutoBrightness(patch) {
    emit('update:autoBrightness', patch)
}

const autoMode = computed(() => Boolean(autoDraft.value?.enabled))

function setBrightnessMode(mode) {
    if (!props.isStartContext) return
    const isAuto = mode === 'auto'
    commitAutoBrightness({ enabled: isAuto })
    if (isAuto) commitStop({ useBrightness: true })
}

const brightnessSelection = computed(() => {
    if (!props.stop.useBrightness) return 'off'
    return autoMode.value ? 'auto' : 'manual'
})

function setBrightnessSelection(value) {
    if (!props.isStartContext) return
    if (value === 'off') {
        commitStop({ useBrightness: false })
        commitAutoBrightness({ enabled: false })
        return
    }
    commitStop({ useBrightness: true })
    setBrightnessMode(value === 'auto' ? 'auto' : 'manual')
}

function updateBrightness(value) {
    const numeric = Math.round(Number(value) || 0)
    commitStop({ brightness: Math.max(1, Math.min(100, numeric)) })
}

watch(
    () => props.stop.useBrightness,
    (enabled) => {
        if (!enabled && autoDraft.value?.enabled) commitAutoBrightness({ enabled: false })
    },
    { immediate: true }
)

const {
    autoRangeBoardRef,
    luxTrackRef,
    brightnessTrackRef,
    luxMinPercent,
    luxMaxPercent,
    brightnessMinPercent,
    brightnessMaxPercent,
    luxMinSlider,
    luxMaxSlider,
    brightnessMinSlider,
    brightnessMaxSlider,
    luxTicks,
    capabilityBounds,
    startRangeDrag
} = useAutoBrightnessEditor(autoDraft, sensorOptionsRef, openRef, toRef(props, 'isStartContext'), commitAutoBrightness)

const { linkMetrics } = useRangeLinkMetrics(autoRangeBoardRef, luxTrackRef, brightnessTrackRef, openRef)

const linkViewBox = computed(() => `0 0 ${linkMetrics.width} ${linkMetrics.height}`)
const linkLuxTopY = computed(
    () => linkMetrics.trackTop + (luxMaxPercent.value / 100) * linkMetrics.trackHeight
)
const linkLuxBottomY = computed(
    () => linkMetrics.trackTop + (luxMinPercent.value / 100) * linkMetrics.trackHeight
)
const linkBrightnessTopY = computed(
    () => linkMetrics.trackTop + (brightnessMinPercent.value / 100) * linkMetrics.trackHeight
)
const linkBrightnessBottomY = computed(
    () => linkMetrics.trackTop + (brightnessMaxPercent.value / 100) * linkMetrics.trackHeight
)

const brightnessTicks = [0, 25, 50, 75, 100]

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

function rangeStyle(min, max) {
    const top = clamp(Math.min(min, max), 0, 100)
    const height = clamp(Math.abs(max - min), 0, 100)
    return { top: `${top}%`, height: `${height}%` }
}

function rangeShadeTop(min) {
    const height = clamp(Math.min(min, 100), 0, 100)
    return { top: '0%', height: `${height}%` }
}

function rangeShadeBottom(max) {
    const top = clamp(Math.max(max, 0), 0, 100)
    return { top: `${top}%`, height: `${100 - top}%` }
}

const luxRangeStyle = computed(() => rangeStyle(luxMinPercent.value, luxMaxPercent.value))
const brightnessRangeStyle = computed(() => rangeStyle(brightnessMinPercent.value, brightnessMaxPercent.value))
const brightnessShadeTopStyle = computed(() => rangeShadeTop(brightnessMinPercent.value))
const brightnessShadeBottomStyle = computed(() => rangeShadeBottom(brightnessMaxPercent.value))

const luxMinLabel = computed(() => formatLuxLabel(autoDraft.value?.luxMin ?? capabilityBounds.value.min))
const luxMaxLabel = computed(() => formatLuxLabel(autoDraft.value?.luxMax ?? capabilityBounds.value.max))
const brightnessMinLabel = computed(() => formatPercentValue(autoDraft.value?.brightnessMin ?? 0))
const brightnessMaxLabel = computed(() => formatPercentValue(autoDraft.value?.brightnessMax ?? 100))

function luxTickPosition(value) {
    return luxToPercent(value, capabilityBounds.value)
}

function handleSensorChange(event) {
    commitAutoBrightness({ sensorId: event.target.value })
}
</script>

<template>
    <section class="control-block brightness-section">
        <div class="block-header">
            <div class="block-title">
                <h3 class="block-title-text">Яркость</h3>
            </div>
            <div v-if="isStartContext" class="header-controls">
                <SegmentedControl aria-label="Режим яркости" dense fit :disabled="!isStartContext"
                    :model-value="brightnessSelection" @update:model-value="setBrightnessSelection" :options="[
                        { value: 'off', label: 'Выкл' },
                        { value: 'manual', label: 'Ручной' },
                        { value: 'auto', label: 'Авто' }
                    ]" />
            </div>
        </div>
        <div class="brightness-content">
            <template v-if="stop.useBrightness">
                <div v-if="autoMode">
                    <template v-if="isStartContext">
                        <label class="field">
                            Датчик света с улицы
                            <select :value="autoBrightness.sensorId" @change="handleSensorChange">
                                <option v-if="!sensorOptions.length" disabled value="">Нет датчиков</option>
                                <option v-for="sensor in sensorOptions" :key="sensor.id" :value="sensor.id">
                                    {{ sensor.name }}{{ sensor.currentLux != null ? ` (Сейчас: ${sensor.currentLux} лк)` : '' }}
                                </option>
                            </select>
                        </label>
                        <div class="auto-range-editor">
                            <div class="auto-range-board" ref="autoRangeBoardRef">
                                <svg v-if="linkMetrics.width > 10" class="auto-range-links" :viewBox="linkViewBox"
                                    preserveAspectRatio="none" aria-hidden="true">
                                    <line class="auto-range-link auto-range-link--top" :x1="linkMetrics.leftX"
                                        :x2="linkMetrics.rightX" :y1="linkLuxTopY" :y2="linkBrightnessTopY" />
                                    <line class="auto-range-link auto-range-link--bottom" :x1="linkMetrics.leftX"
                                        :x2="linkMetrics.rightX" :y1="linkLuxBottomY" :y2="linkBrightnessBottomY" />
                                </svg>
                                <div class="auto-scale">
                                    <div class="auto-scale-title">
                                        <span>За окном</span>
                                        <small>лк</small>
                                    </div>
                                    <div class="auto-scale-body">
                                        <div class="auto-scale-track" ref="luxTrackRef"
                                            @pointerdown="startRangeDrag('lux', $event)">
                                            <div class="auto-scale-range" :style="luxRangeStyle" />
                                            <span class="auto-scale-handle auto-scale-handle--max"
                                                :style="{ top: `${luxMaxPercent}%` }" />
                                            <span class="auto-scale-handle auto-scale-handle--min"
                                                :style="{ top: `${luxMinPercent}%` }" />
                                            <input class="auto-scale-input auto-scale-input--min" type="range" min="0"
                                                max="100" step="1" v-model="luxMinSlider" />
                                            <input class="auto-scale-input auto-scale-input--max" type="range" min="0"
                                                max="100" step="1" v-model="luxMaxSlider" />
                                        </div>
                                        <div class="auto-scale-overlay">
                                            <span class="auto-scale-value auto-scale-value--min"
                                                :style="{ top: `${luxMinPercent}%` }">
                                                {{ luxMinLabel }}
                                            </span>
                                            <span class="auto-scale-value auto-scale-value--max"
                                                :style="{ top: `${luxMaxPercent}%` }">
                                                {{ luxMaxLabel }}
                                            </span>
                                            <span v-for="tick in luxTicks" :key="`lux-tick-${tick}`"
                                                class="auto-scale-tick" :style="{ top: `${luxTickPosition(tick)}%` }">
                                                {{ formatLuxTick(tick) }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="auto-scale auto-scale--brightness">
                                    <div class="auto-scale-title">
                                        <span>Яркость ламп</span>
                                        <small>%</small>
                                    </div>
                                    <div class="auto-scale-body">
                                        <div class="auto-scale-track" ref="brightnessTrackRef"
                                            @pointerdown="startRangeDrag('brightness', $event)">
                                            <div class="auto-scale-shade auto-scale-shade--top"
                                                :style="brightnessShadeTopStyle" />
                                            <div class="auto-scale-shade auto-scale-shade--bottom"
                                                :style="brightnessShadeBottomStyle" />
                                            <div class="auto-scale-range" :style="brightnessRangeStyle" />
                                            <span class="auto-scale-handle auto-scale-handle--min"
                                                :style="{ top: `${brightnessMinPercent}%` }" />
                                            <span class="auto-scale-handle auto-scale-handle--max"
                                                :style="{ top: `${brightnessMaxPercent}%` }" />
                                            <input class="auto-scale-input auto-scale-input--min" type="range" min="0"
                                                max="100" step="1" v-model="brightnessMinSlider" />
                                            <input class="auto-scale-input auto-scale-input--max" type="range" min="0"
                                                max="100" step="1" v-model="brightnessMaxSlider" />
                                        </div>
                                        <div class="auto-scale-overlay">
                                            <span class="auto-scale-value auto-scale-value--min"
                                                :style="{ top: `${brightnessMinPercent}%` }">
                                                {{ brightnessMinLabel }}
                                            </span>
                                            <span class="auto-scale-value auto-scale-value--max"
                                                :style="{ top: `${brightnessMaxPercent}%` }">
                                                {{ brightnessMaxLabel }}
                                            </span>
                                            <span v-for="tick in brightnessTicks" :key="`b-tick-${tick}`"
                                                class="auto-scale-tick" :style="{ top: `${tick}%` }">
                                                {{ tick }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <p class="auto-range-note">
                                Выберите датчик освещенности (желательно направленный в окно). Задайте диапазон
                                освещенности — экспериментально определите, при каких значениях свет должен
                                выключаться. Укажите минимальную и максимальную яркость ламп: при 0% лампы выключатся.
                            </p>
                        </div>
                    </template>
                    <p v-else class="auto-note">Автояркость по датчику. Для редактирования выберите стартовое
                        состояние.</p>
                </div>
                <div v-else class="slider-block">
                    <label>
                        <span class="slider-value">{{ stop.brightness }}%</span>
                        <input class="gradient-range" type="range" min="1" max="100"
                            :style="{ '--range-gradient': brightnessGradient }" :value="stop.brightness"
                            @input="updateBrightness($event.target.value)" />
                    </label>
                </div>
            </template>
            <p v-else class="block-hint">Яркость не изменяется</p>
        </div>
    </section>
</template>

<style scoped>
.block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1rem;
}

.block-title {
    flex: 0 0 auto;
}

.block-title-text {
    margin: 0;
    font-weight: 600;
    font-size: 1.125rem;
}

.block-header small {
    color: #94a3b8;
}

.header-controls {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    min-width: 0;
}

.block-hint,
.auto-note {
    margin: 0;
    color: #94a3b8;
    font-size: 14px;
}

.slider-block label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.92);
}

.slider-value {
    display: inline-flex;
    align-items: center;
    font-size: 1rem;
}

.brightness-content {
    min-height: 76px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}

.brightness-content .block-hint {
    margin: 0;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
}

.gradient-range {
    --range-gradient: linear-gradient(90deg, #ffffff, #ffffff);
    -webkit-appearance: none;
    appearance: none;
    height: 32px;
    border-radius: 16px;
    outline: none;
    background: transparent;
}

.gradient-range::-webkit-slider-runnable-track {
    height: 32px;
    border-radius: 16px;
    background: var(--range-gradient);
}

.gradient-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(248, 250, 252, 0.9);
    background: transparent;
    box-shadow: 0 3px 9px rgba(0, 0, 0, 0.5);
    margin-top: 0px;
    cursor: pointer;
}

.gradient-range::-moz-range-track {
    height: 32px;
    border-radius: 16px;
    background: var(--range-gradient);
}

.gradient-range::-moz-range-thumb {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(248, 250, 252, 0.9);
    background: transparent;
    box-shadow: 0 3px 9px rgba(0, 0, 0, 0.5);
    cursor: pointer;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 600;
    font-size: 0.875rem;
    color: rgba(226, 232, 240, 0.92);
}

.field input,
.field select {
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.2);
    color: inherit;
    border-radius: 10px;
    padding: 8px 10px;
    font-weight: 500;
}

.auto-range-editor {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.auto-range-board {
    position: relative;
    display: flex;
    justify-content: space-between;
    gap: 26px;
    padding: 24px 24px 32px;
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(5, 9, 20, 0.8);
}

.auto-range-links {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
}

.auto-range-link {
    stroke: rgba(148, 163, 184, 0.75);
    stroke-width: 1.6;
    stroke-linecap: round;
}

.auto-range-link--bottom {
    stroke: rgba(56, 189, 248, 0.8);
}

.auto-scale {
    position: relative;
    z-index: 2;
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    min-width: 0;
}

.auto-scale-body {
    position: relative;
    width: 36px;
    height: 220px;
}

.auto-scale-title {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    color: rgba(226, 232, 240, 0.92);
}

.auto-scale-title small {
    font-size: 0.75rem;
    color: #94a3b8;
    font-weight: 500;
}

.auto-scale-track {
    position: relative;
    height: 100%;
    width: 100%;
    border-radius: 8px;
    background: linear-gradient(180deg, #7d7d7d 0%, #0b1e3d 100%);
    box-shadow: inset 0 0 20px rgba(2, 7, 20, 0.6);
    touch-action: none;
}

.auto-scale--brightness .auto-scale-track {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 1) 100%);
    box-shadow: inset 0 0 16px rgba(2, 7, 20, 0.45), 0 0 18px rgba(255, 255, 255, 0.25);
}

.auto-scale-range {
    position: absolute;
    left: 0;
    right: 0;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(7, 14, 44, 0.8));
    box-shadow: none;
}

.auto-scale--brightness .auto-scale-range {
    background: transparent;
}

.auto-scale-shade {
    position: absolute;
    left: 0;
    right: 0;
    background: rgba(10, 10, 12, 0.45);
}

.auto-scale--brightness .auto-scale-shade {
    background: rgba(10, 10, 12, 0.55);
}

.auto-scale-handle {
    position: absolute;
    left: 50%;
    width: 100%;
    height: 8px;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    background: rgba(39, 46, 63, 0.85);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 2px 3px rgba(13, 14, 45, 0.45);
    z-index: 5;
    pointer-events: none;
}

.auto-scale-handle--min {
    background: rgba(24, 30, 46, 0.92);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 2px 4px rgba(8, 10, 20, 0.55);
}

.auto-scale-handle--max {
    background: rgba(248, 250, 252, 0.95);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 2px 4px rgba(13, 14, 45, 0.35);
}

.auto-scale-input {
    position: absolute;
    inset: 0;
    width: 100%;
    left: 0;
    transform: none;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    writing-mode: vertical-lr;
    direction: rtl;
    cursor: pointer;
    opacity: 0;
    pointer-events: none;
}

.auto-scale-input--min {
    z-index: 3;
}

.auto-scale-input--max {
    z-index: 2;
}

.auto-scale-input::-webkit-slider-runnable-track {
    background: transparent;
    border: none;
    height: 100%;
}

.auto-scale-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 1px;
    height: 1px;
    border-radius: 0;
    border: none;
    background: transparent;
    box-shadow: none;
}

.auto-scale-input--max::-webkit-slider-thumb {
    background: transparent;
}

.auto-scale-input::-moz-range-track {
    background: transparent;
    border: none;
    height: 100%;
}

.auto-scale-input::-moz-range-progress {
    background: transparent;
    border: none;
}

.auto-scale-input::-moz-range-thumb {
    width: 1px;
    height: 1px;
    border-radius: 0;
    border: none;
    background: transparent;
    box-shadow: none;
}

.auto-scale-input--max::-moz-range-thumb {
    background: transparent;
}

.auto-scale-value {
    position: absolute;
    left: 100%;
    margin-left: 4px;
    transform: translateY(-50%);
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 999px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    z-index: 4;
    color: rgba(248, 250, 252, 0.92);
    white-space: nowrap;
}

.auto-scale--brightness .auto-scale-value {
    left: auto;
    right: 100%;
    margin-left: 0;
    margin-right: 4px;
}

.auto-scale-tick {
    position: absolute;
    right: 100%;
    margin-right: 20px;
    transform: translateY(-50%);
    font-size: 11px;
    color: rgba(203, 213, 225, 0.85);
    white-space: nowrap;
}

.auto-scale-tick::before {
    content: '';
    position: absolute;
    right: -12px;
    top: 50%;
    width: 8px;
    height: 1px;
    background: rgba(148, 163, 184, 0.6);
    transform: translateY(-50%);
}

.auto-scale--brightness .auto-scale-tick {
    right: auto;
    left: 100%;
    margin-right: 0;
    margin-left: 12px;
}

.auto-scale--brightness .auto-scale-tick::before {
    left: -10px;
    right: auto;
}

.auto-scale-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 6;
}

.auto-range-note {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
}

@media (max-width: 640px) {
    .auto-range-board {
        gap: 12px;
        padding: 24px 0px 32px 16px;
    }

    .auto-scale-body {
        height: 180px;
        width: 36px;
    }
}
</style>
