<script setup>
import { computed, ref, watch } from 'vue'

import { applyBrightnessMode } from '../../utils/stopStateRules'

const props = defineProps({
    open: {
        type: Boolean,
        default: false
    },
    stop: {
        type: Object,
        required: true
    },
    palette: {
        type: Array,
        required: true
    },
    context: {
        type: String,
        default: 'start'
    },
    autoBrightness: {
        type: Object,
        required: true
    },
    sensorOptions: {
        type: Array,
        default: () => []
    }
})

const emit = defineEmits(['close'])

const isStartContext = computed(() => props.context !== 'end')
const autoMode = computed(() => Boolean(props.autoBrightness?.enabled))
const temperatureGradient = 'linear-gradient(90deg, #ff9b0a 0%, #fffbe8 70%, #c8edff 100%)'
const brightnessGradient = 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 100%)'
const sheetTitle = computed(() => (props.context === 'end' ? 'Финальное состояние' : 'Стартовое состояние'))

const sheetClosing = ref(false)
const sheetTranslate = ref(0)
const sheetDragStartY = ref(null)
const sheetDragActive = ref(false)
const sheetDragElement = ref(null)

watch(
    () => props.open,
    (open) => {
        if (!open) resetSheetState()
    }
)

function resetSheetState() {
    sheetClosing.value = false
    sheetTranslate.value = 0
    sheetDragStartY.value = null
    sheetDragActive.value = false
    sheetDragElement.value = null
}

function requestClose() {
    sheetClosing.value = true
    sheetTranslate.value = 200
    setTimeout(() => {
        resetSheetState()
        emit('close')
    }, 250)
}

function startSheetDrag(event) {
    if (event.pointerType === 'mouse') return
    sheetDragStartY.value = event.clientY
    sheetDragActive.value = true
    sheetDragElement.value = event.currentTarget
    sheetDragElement.value?.setPointerCapture?.(event.pointerId)
}

function handleSheetDrag(event) {
    if (!sheetDragActive.value || sheetDragStartY.value == null) return
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    const delta = event.clientY - sheetDragStartY.value
    sheetTranslate.value = Math.max(0, delta)
}

function endSheetDrag(event) {
    if (!sheetDragActive.value) return
    sheetDragElement.value?.releasePointerCapture?.(event.pointerId)
    if (sheetTranslate.value > 120) {
        requestClose()
    } else {
        sheetTranslate.value = 0
    }
    sheetDragActive.value = false
    sheetDragStartY.value = null
    sheetDragElement.value = null
}

const sheetTransform = computed(() => {
    const translate = Math.max(sheetTranslate.value, 0)
    return `translateY(${translate}px)`
})

function toggle(prop) {
    if (!isStartContext.value) return
    props.stop[prop] = !props.stop[prop]
}

function setColorMode(mode) {
    props.stop.colorMode = mode
}

function updateTemperature(value) {
    const numeric = Math.round(Number(value) || 0)
    props.stop.temperature = Math.max(1000, Math.min(6500, numeric))
}

function updateBrightness(value) {
    const numeric = Math.round(Number(value) || 0)
    props.stop.brightness = Math.max(1, Math.min(100, numeric))
}

function setBrightnessMode(mode) {
    if (!isStartContext.value) return
    applyBrightnessMode(mode, props.autoBrightness, props.stop)
}

function lock(value, min, max) {
    return Math.max(min, Math.min(max, value))
}
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="stop-sheet-overlay" @touchmove.passive>
            <div class="stop-sheet-backdrop" @click="requestClose" />
            <div class="stop-sheet-panel" :class="{ closing: sheetClosing }" :style="{ transform: sheetTransform }">
                <header class="stop-sheet-header" @pointerdown="startSheetDrag" @pointermove="handleSheetDrag"
                    @pointerup="endSheetDrag" @pointercancel="endSheetDrag">
                    <button type="button" class="stop-sheet-close" @click="requestClose">Закрыть</button>
                    <h3>{{ sheetTitle }}</h3>
                </header>
                <div class="stop-sheet-content">
                    <div class="stop-editor">
                        <section v-if="isStartContext || stop.useColor" class="control-block">
                            <div class="block-header">
                                <div>
                                    <p>{{ isStartContext ? 'Изменять цвет' : 'Цвет' }}</p>
                                    <small v-if="isStartContext">Отключите, если нужен только диммирование</small>
                                </div>
                                <button v-if="isStartContext" type="button" class="toggle" :class="{ active: stop.useColor }"
                                    @click="toggle('useColor')">
                                    <span />
                                </button>
                            </div>
                            <template v-if="stop.useColor">
                                <div class="segmented" v-if="isStartContext">
                                    <button type="button" :class="{ active: stop.colorMode === 'temperature' }"
                                        @click="setColorMode('temperature')">
                                        Температура
                                    </button>
                                    <button type="button" :class="{ active: stop.colorMode === 'rgb' }"
                                        @click="setColorMode('rgb')">Цвет</button>
                                </div>
                                <div v-if="stop.colorMode === 'temperature'" class="slider-block">
                                    <label>
                                        {{ stop.temperature }}K
                                        <input class="gradient-range" type="range" min="1700" max="6500" step="100"
                                            :style="{ '--range-gradient': temperatureGradient }" :value="stop.temperature"
                                            @input="updateTemperature($event.target.value)" />
                                    </label>
                                </div>
                                <div v-else class="palette">
                                    <button v-for="color in palette" :key="color" type="button" class="swatch"
                                        :class="{ active: stop.colorHex === color }"
                                        :style="{ background: color }"
                                        @click="stop.colorHex = color" />
                                    <label class="custom-color">
                                        <input type="color" :value="stop.colorHex" @input="stop.colorHex = $event.target.value" />
                                        <span>{{ stop.colorHex?.toUpperCase?.() }}</span>
                                    </label>
                                </div>
                            </template>
                            <p v-else class="block-hint">Цвет не изменяется</p>
                        </section>

                        <section v-if="isStartContext || stop.useBrightness" class="control-block">
                            <div class="block-header">
                                <div>
                                    <p>{{ isStartContext ? 'Изменять яркость' : 'Яркость' }}</p>
                                    <small v-if="isStartContext">Переключитесь на автояркость, чтобы связать её с датчиком</small>
                                </div>
                                <button v-if="isStartContext" type="button" class="toggle"
                                    :class="{ active: stop.useBrightness }" @click="toggle('useBrightness')">
                                    <span />
                                </button>
                            </div>
                            <template v-if="stop.useBrightness">
                                <div class="segmented" v-if="isStartContext">
                                    <button type="button" :class="{ active: !autoMode }"
                                        @click="setBrightnessMode('manual')">Ручной</button>
                                    <button type="button" :class="{ active: autoMode }"
                                        @click="setBrightnessMode('auto')">Авто</button>
                                </div>

                                <div v-if="autoMode">
                                    <template v-if="isStartContext">
                                        <label class="field">
                                            Датчик освещенности
                                            <select v-model="autoBrightness.sensorId">
                                                <option v-if="!sensorOptions.length" disabled value="">Нет датчиков</option>
                                                <option v-for="sensor in sensorOptions" :key="sensor.id" :value="sensor.id">
                                                    {{ sensor.name }}
                                                </option>
                                            </select>
                                        </label>
                                        <div class="range-pair">
                                            <label class="field">
                                                Минимум, лк
                                                <input type="number" min="0" :max="autoBrightness.luxMax - 10"
                                                    v-model.number="autoBrightness.luxMin"
                                                    @change="autoBrightness.luxMin = lock(autoBrightness.luxMin, 0, autoBrightness.luxMax - 10)" />
                                            </label>
                                            <label class="field">
                                                Максимум, лк
                                                <input type="number" :min="autoBrightness.luxMin + 10"
                                                    v-model.number="autoBrightness.luxMax"
                                                    @change="autoBrightness.luxMax = lock(autoBrightness.luxMax, autoBrightness.luxMin + 10, 1000)" />
                                            </label>
                                        </div>
                                        <div class="range-pair">
                                            <label class="field">
                                                Яркость при мин.
                                                <input type="number" min="1" :max="autoBrightness.brightnessMax"
                                                    v-model.number="autoBrightness.brightnessMin"
                                                    @change="autoBrightness.brightnessMin = lock(autoBrightness.brightnessMin, 1, autoBrightness.brightnessMax)" />
                                            </label>
                                            <label class="field">
                                                Яркость при макс.
                                                <input type="number" :min="autoBrightness.brightnessMin" max="100"
                                                    v-model.number="autoBrightness.brightnessMax"
                                                    @change="autoBrightness.brightnessMax = lock(autoBrightness.brightnessMax, autoBrightness.brightnessMin, 100)" />
                                            </label>
                                        </div>
                                    </template>
                                    <p v-else class="auto-note">Автояркость по датчику. Для редактирования выберите стартовое
                                        состояние.
                                    </p>
                                </div>

                                <div v-else class="slider-block">
                                    <label>
                                        {{ stop.brightness }}%
                                        <input class="gradient-range" type="range" min="1" max="100"
                                            :style="{ '--range-gradient': brightnessGradient }" :value="stop.brightness"
                                            @input="updateBrightness($event.target.value)" />
                                    </label>
                                </div>
                            </template>
                            <p v-else class="block-hint">Яркость не изменяется</p>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.stop-sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    pointer-events: auto;
}

.stop-sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
}

.stop-sheet-panel {
    position: relative;
    width: min(560px, 100%);
    background: #0d1322;
    border-radius: 28px 28px 0 0;
    padding-bottom: 32px;
    animation: stop-sheet-slide-in 0.3s ease-out forwards;
    transform: translateY(0);
}

.stop-sheet-panel.closing {
    animation: stop-sheet-slide-out 0.25s ease-in forwards;
}

@keyframes stop-sheet-slide-in {
    from {
        transform: translateY(100%);
    }

    to {
        transform: translateY(0);
    }
}

@keyframes stop-sheet-slide-out {
    from {
        transform: translateY(0);
    }

    to {
        transform: translateY(100%);
    }
}

.stop-sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px 8px;
    cursor: grab;
}

.stop-sheet-header h3 {
    margin: 0;
}

.stop-sheet-close {
    border: none;
    background: transparent;
    color: #f8fafc;
    font-size: 16px;
    cursor: pointer;
}

.stop-sheet-content {
    padding: 0 24px 24px;
}

.stop-editor {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.control-block {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.block-header p {
    margin: 0;
    font-weight: 600;
}

.block-header small {
    color: #94a3b8;
}

.block-hint,
.block-note,
.auto-note {
    margin: 0;
    color: #94a3b8;
    font-size: 14px;
}

.toggle {
    width: 44px;
    height: 24px;
    border-radius: 999px;
    border: none;
    background: rgba(148, 163, 184, 0.4);
    padding: 0;
    position: relative;
}

.toggle span {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    top: 3px;
    left: 4px;
    transition: transform 0.2s;
}

.toggle.active {
    background: #34d399;
}

.toggle.active span {
    transform: translateX(18px);
}

.block-header .toggle {
    flex-shrink: 0;
}

.segmented {
    display: flex;
    background: #11182b;
    border-radius: 12px;
    padding: 4px;
}

.segmented button {
    flex: 1;
    border: none;
    background: transparent;
    color: #94a3b8;
    border-radius: 10px;
    padding: 8px;
    font-weight: 600;
}

.segmented .active {
    background: #6366f1;
    color: white;
}

.slider-block label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 600;
}

.slider-block input[type='range'] {
    width: 100%;
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

.palette {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
}

.swatch {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    border: 2px solid transparent;
}

.swatch.active {
    border-color: white;
}

.custom-color {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-size: 12px;
    color: #94a3b8;
}

.custom-color input {
    width: 42px;
    height: 42px;
    border: none;
    border-radius: 12px;
    padding: 0;
    background: transparent;
}

.custom-color.disabled input {
    cursor: not-allowed;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 600;
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

.range-pair {
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

.range-pair .field {
    flex: 1;
    min-width: 0;
}

@media (max-width: 640px) {
    .range-pair {
        flex-direction: column;
    }
}
</style>
