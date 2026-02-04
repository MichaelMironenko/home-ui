<script setup>
import { computed } from 'vue'

import SegmentedControl from './SegmentedControl.vue'

const props = defineProps({
    stop: {
        type: Object,
        required: true
    },
    palette: {
        type: Array,
        required: true
    },
    isStartContext: {
        type: Boolean,
        default: true
    }
})

const emit = defineEmits(['update:stop'])

const temperatureGradient = 'linear-gradient(90deg, #ff9b0a 0%, #fffbe8 70%, #c8edff 100%)'

function commitStop(patch) {
    emit('update:stop', patch)
}

function setColorMode(mode) {
    if (!props.isStartContext) return
    commitStop({ useColor: true, colorMode: mode })
}

function updateTemperature(value) {
    const numeric = Math.round(Number(value) || 0)
    commitStop({ temperature: Math.max(1000, Math.min(6500, numeric)) })
}

const colorSelection = computed(() => {
    if (!props.stop.useColor) return 'off'
    return props.stop.colorMode === 'rgb' ? 'rgb' : 'temperature'
})

function setColorSelection(value) {
    if (!props.isStartContext) return
    if (value === 'off') {
        commitStop({ useColor: false })
        return
    }
    setColorMode(value === 'rgb' ? 'rgb' : 'temperature')
}

function setPaletteColor(color) {
    commitStop({ colorHex: color })
}

function setCustomColor(event) {
    commitStop({ colorHex: event.target.value })
}
</script>

<template>
    <section class="control-block color-section">
        <div class="block-header">
            <div class="block-title">
                <h3 class="block-title-text">Цвет</h3>
            </div>
            <div v-if="isStartContext" class="header-controls">
                <SegmentedControl aria-label="Режим цвета" dense fit :disabled="!isStartContext"
                    :model-value="colorSelection" @update:model-value="setColorSelection" :options="[
                        { value: 'off', label: 'Выкл' },
                        { value: 'temperature', label: 'Температура' },
                        { value: 'rgb', label: 'Цвет' }
                    ]" />
            </div>
        </div>
        <div class="color-content">
            <template v-if="stop.useColor">
                <div v-if="stop.colorMode === 'temperature'" class="slider-block">
                    <label class="temperature-label">
                        <span class="temperature-value">{{ stop.temperature }}K</span>
                        <input class="gradient-range" type="range" min="1700" max="6500" step="100"
                            :style="{ '--range-gradient': temperatureGradient }" :value="stop.temperature"
                            @input="updateTemperature($event.target.value)" />
                    </label>
                </div>
                <div v-else class="palette">
                    <button v-for="color in palette" :key="color" type="button" class="swatch"
                        :class="{ active: stop.colorHex === color }" :style="{ background: color }"
                        @click="setPaletteColor(color)" />
                    <label v-if="false" class="swatch swatch-add" aria-label="Выбрать свой цвет" @pointerdown.stop>
                        <svg viewBox="0 0 24 24" aria-hidden="true" class="swatch-add-icon">
                            <path
                                d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1Z" />
                        </svg>
                        <input class="custom-color-input" type="color" :value="stop.colorHex"
                            @input="setCustomColor" @pointerdown.stop />
                    </label>
                </div>
            </template>
            <p v-else class="block-hint">Цвет не изменяется</p>
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

.block-hint {
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

.temperature-label {
    gap: 10px;
}

.temperature-value {
    display: inline-flex;
    align-items: center;
    font-size: 1rem;
}

.color-content {
    min-height: 86px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
}

.color-content .block-hint {
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

.palette {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    padding: 16px 0;
}

.swatch {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    border: 2px solid transparent;
}

.swatch.active {
    border-color: white;
}

.swatch-add {
    background: transparent;
    border-color: rgba(148, 163, 184, 0.35);
    color: rgba(248, 250, 252, 0.9);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 500;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    position: relative;
    overflow: hidden;
}

.swatch-add:active {
    background: rgba(148, 163, 184, 0.12);
}

.swatch-add-icon {
    width: 18px;
    height: 18px;
    fill: currentColor;
}

.custom-color-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
}
</style>
