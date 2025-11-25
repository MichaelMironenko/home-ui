<script setup>
import { computed } from 'vue'

import { applyBrightnessMode } from '../../utils/stopStateRules'

const props = defineProps({
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

const isStartContext = computed(() => props.context !== 'end')
const autoMode = computed(() => Boolean(props.autoBrightness?.enabled))
const temperatureGradient = 'linear-gradient(90deg, #ff9b0a 0%, #fffbe8 70%, #c8edff 100%)'
const brightnessGradient = 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 100%)'

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
                <div class="segmented">
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
                        <input class="gradient-range" type="range" min="1000" max="6500" step="100"
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
                <button v-if="isStartContext" type="button" class="toggle" :class="{ active: stop.useBrightness }"
                    @click="toggle('useBrightness')">
                    <span />
                </button>
            </div>
            <template v-if="stop.useBrightness">
                <div class="segmented" v-if="isStartContext">
                    <button type="button" :class="{ active: !autoMode }"
                        @click="setBrightnessMode('manual')">Ручной</button>
                    <button type="button" :class="{ active: autoMode }" @click="setBrightnessMode('auto')">Авто</button>
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
                    <p v-else class="auto-note">Автояркость по датчику. Для редактирования выберите стартовое состояние.
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
</template>

<style scoped>
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
