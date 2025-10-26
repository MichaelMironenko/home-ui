<script setup>
import { computed } from 'vue'

const props = defineProps({
    modelValue: {
        type: Object,
        required: true
    },
    sensorOptions: {
        type: Array,
        default: () => []
    },
    support: {
        type: Object,
        default: () => ({ available: false, partial: false })
    },
    runtime: {
        type: Object,
        default: () => ({ active: false, value: null, source: null })
    }
})

const emit = defineEmits(['update:modelValue'])

const parseNumber = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
}

const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min
    return Math.min(Math.max(value, min), max)
}

const updateValue = (patch) => {
    const next = {
        enabled: Boolean(props.modelValue?.enabled),
        mode: props.modelValue?.mode === 'sensor' ? 'sensor' : 'manual',
        manual: {
            from: props.modelValue?.manual?.from ?? 80,
            to: props.modelValue?.manual?.to ?? 20
        },
        sensor: {
            sensorId: props.modelValue?.sensor?.sensorId || '',
            sensorMin: props.modelValue?.sensor?.sensorMin ?? 0,
            sensorMax: props.modelValue?.sensor?.sensorMax ?? 2000,
            outputMin: props.modelValue?.sensor?.outputMin ?? 10,
            outputMax: props.modelValue?.sensor?.outputMax ?? 100
        }
    }
    if (patch.enabled !== undefined) next.enabled = patch.enabled
    if (patch.mode) next.mode = patch.mode
    if (patch.manual) next.manual = { ...next.manual, ...patch.manual }
    if (patch.sensor) next.sensor = { ...next.sensor, ...patch.sensor }
    emit('update:modelValue', next)
}

const toggleEnabled = (checked) => {
    updateValue({ enabled: checked })
}

const setMode = (mode) => {
    updateValue({ mode: mode === 'sensor' ? 'sensor' : 'manual' })
}

const updateManual = (field, value) => {
    const numeric = clamp(parseNumber(value) ?? (field === 'from' ? 80 : 20), 1, 100)
    updateValue({ manual: { [field]: numeric } })
}

const swapManual = () => {
    const from = props.modelValue?.manual?.from ?? 80
    const to = props.modelValue?.manual?.to ?? 20
    updateValue({ manual: { from: to, to: from } })
}

const updateSensor = (field, value) => {
    updateValue({ sensor: { [field]: parseNumber(value) } })
}

const updateSensorId = (value) => {
    updateValue({ sensor: { sensorId: value } })
}

const TRACK_SIDE_PADDING = 20

const manualVisual = computed(() => {
    const fromValue = clamp(props.modelValue?.manual?.from ?? 80, 1, 100)
    const toValue = clamp(props.modelValue?.manual?.to ?? 20, 1, 100)
    const fromPercent = fromValue - 1
    const toPercent = toValue - 1
    const startPercent = Math.min(fromValue, toValue) - 1
    const widthPercent = Math.max(0, Math.abs(toValue - fromValue))
    return {
        fromValue,
        toValue,
        fromPercent,
        toPercent,
        startPercent,
        widthPercent
    }
})

const currentMarker = computed(() => {
    if (!props.runtime?.active) return null
    const raw = parseNumber(props.runtime?.value)
    if (!Number.isFinite(raw)) return null
    const clampedVal = clamp(raw, 0, 100)
    const sliderValue = Math.max(clampedVal, 1)
    return {
        value: Math.round(clampedVal),
        percent: sliderValue - 1,
        fromBackend: props.runtime?.source === 'backend'
    }
})
</script>

<template>
    <section class="blk">
        <header class="blk__header">
            <div>
                <h2>Изменение яркости</h2>
                <p class="blk__hint">
                    Сценарий плавно управляет яркостью выбранных устройств.
                </p>
                <p v-if="support.hasSelection && !support.available" class="blk__hint warn">Выбранные устройства не
                    поддерживают регулировку яркости.</p>
                <p v-else-if="support.hasSelection && support.partial" class="blk__hint warn">
                    Часть устройств без регулировки яркости — сценарий применится только к совместимым.
                </p>
            </div>
            <button type="button" class="switch" role="switch" :aria-checked="modelValue.enabled"
                @click="toggleEnabled(!modelValue.enabled)">
                <span class="switch__track">
                    <span class="switch__thumb"></span>
                </span>

            </button>
        </header>

        <div v-if="modelValue.enabled" class="body">
            <div class="mode-switch">
                <button type="button" :class="['mode-chip', { active: modelValue.mode !== 'sensor' }]"
                    @click="setMode('manual')">
                    Ручной диапазон
                </button>
                <button type="button" :class="['mode-chip', { active: modelValue.mode === 'sensor' }]"
                    @click="setMode('sensor')">
                    По датчику
                </button>
            </div>

            <div v-if="modelValue.mode !== 'sensor'" class="manual">
                <div class="gradient">
                    <div class="gradient__bar">
                        <div class="gradient__fill"
                            :style="{ left: `${manualVisual.startPercent}%`, width: `${manualVisual.widthPercent}%` }">
                        </div>
                    </div>
                    <div class="gradient__markers">
                        <span class="marker-label marker-label--from"
                            :style="{ left: `calc(${manualVisual.fromPercent}% + ${TRACK_SIDE_PADDING}px)` }">
                            <span>Старт</span>
                        </span>
                        <span class="marker-label marker-label--to"
                            :style="{ left: `calc(${manualVisual.toPercent}% + ${TRACK_SIDE_PADDING}px)` }">
                            <span>Финиш</span>
                        </span>
                        <span v-if="currentMarker" class="gradient__marker gradient__marker--current"
                            :style="{ left: `calc(${currentMarker.percent}% + ${TRACK_SIDE_PADDING}px)` }"
                            :title="currentMarker.fromBackend ? 'Факт с устройств' : 'Расчётное значение'">
                            Сейчас {{ currentMarker.value }}%
                        </span>
                    </div>
                    <input class="slider slider--from" type="range" min="1" max="100"
                        :value="modelValue.manual?.from ?? 80" @input="updateManual('from', $event.target.value)" />
                    <input class="slider slider--to" type="range" min="1" max="100" :value="modelValue.manual?.to ?? 20"
                        @input="updateManual('to', $event.target.value)" />
                </div>

                <div class="manual__inputs">
                    <label class="manual__field">
                        <span>Старт</span>
                        <input type="number" min="1" max="100" :value="modelValue.manual?.from ?? 80"
                            @input="updateManual('from', $event.target.value)" />
                    </label>
                    <button type="button" class="swap" @click="swapManual" title="Поменять местами">
                        ⇄
                    </button>
                    <label class="manual__field">
                        <span>Финиш</span>
                        <input type="number" min="1" max="100" :value="modelValue.manual?.to ?? 20"
                            @input="updateManual('to', $event.target.value)" />
                    </label>
                </div>
            </div>

            <div v-else class="sensor">
                <label>
                    <span>Датчик</span>
                    <select :value="modelValue.sensor?.sensorId" @change="updateSensorId($event.target.value)">
                        <option value="">Выберите датчик…</option>
                        <option v-for="sensor in sensorOptions" :key="sensor.id" :value="sensor.id">
                            {{ sensor.name }}
                            <template v-if="sensor.detail">— {{ sensor.detail }}</template>
                        </option>
                    </select>
                </label>
                <div class="sensor__pairs">
                    <div class="sensor__phrase">
                        <label class="sensor__line sensor__line--sensor">
                            <div class="sensor__row">
                                <span class="sensor__text">Когда на датчике</span>
                                <div class="sensor__control">
                                    <input type="number" maxlength="5" inputmode="decimal"
                                        :value="modelValue.sensor?.sensorMin ?? 0"
                                        @input="updateSensor('sensorMin', $event.target.value)" />
                                    <span class="unit">лк</span>
                                </div>
                            </div>
                            <small>Укажите минимум</small>
                        </label>
                        <label class="sensor__line sensor__line--output">
                            <div class="sensor__row">
                                <span class="sensor__text">Яркость ламп</span>
                                <div class="sensor__control">
                                    <input type="number" min="1" max="100" maxlength="5" inputmode="decimal"
                                        :value="modelValue.sensor?.outputMax ?? 100"
                                        @input="updateSensor('outputMax', $event.target.value)" />
                                    <span class="unit">%</span>
                                </div>
                            </div>
                        </label>

                    </div>
                    <div class="sensor__phrase">
                        <label class="sensor__line sensor__line--sensor">
                            <div class="sensor__row">
                                <span class="sensor__text">Когда на датчике</span>
                                <div class="sensor__control">
                                    <input type="number" maxlength="5" inputmode="decimal"
                                        :value="modelValue.sensor?.sensorMax ?? 0"
                                        @input="updateSensor('sensorMax', $event.target.value)" />
                                    <span class="unit">лк</span>
                                </div>
                            </div>
                            <small>Укажите максимум</small>
                        </label>
                        <label class="sensor__line sensor__line--output">
                            <div class="sensor__row">
                                <span class="sensor__text">Яркость ламп</span>
                                <div class="sensor__control">
                                    <input type="number" min="1" max="100" maxlength="5" inputmode="decimal"
                                        :value="modelValue.sensor?.outputMin ?? 10"
                                        @input="updateSensor('outputMin', $event.target.value)" />
                                    <span class="unit">%</span>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        <p v-else class="muted">Блок отключён — яркость не изменяется.</p>
    </section>
</template>

<style scoped>
.blk {
    background: rgba(17, 24, 39, 0.7);
    border-radius: 16px;
    border: 1px solid rgba(55, 65, 81, 0.6);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.blk__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.blk__header h2 {
    margin: 0;
    font-size: 18px;
    color: #e5e7eb;
}

.blk__hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: #94a3b8;
}

.blk__hint.warn {
    color: #fcd34d;
}

.switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: none;
    background: transparent;
    color: #cbd5f5;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 0;
    transition: color 0.2s ease;
}

.switch:focus-visible {
    outline: none;
    color: #f8fafc;
}

.switch__track {
    position: relative;
    width: 44px;
    height: 26px;
    border-radius: 999px;
    background: rgba(71, 85, 105, 0.6);
    transition: background 0.2s ease;
}

.switch__thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #1f2937;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.45);
    transition: transform 0.2s ease, background 0.2s ease;
}

.switch[aria-checked='true'] .switch__track {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.85), rgba(124, 58, 237, 0.85));
}

.switch[aria-checked='true'] .switch__thumb {
    transform: translateX(18px);
    background: #f8fafc;
}

.switch__label {
    font-weight: 500;
}

.body {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.mode-switch {
    display: inline-flex;
    gap: 10px;
}

.mode-chip {
    border: 1px solid rgba(59, 130, 246, 0.4);
    background: rgba(17, 24, 39, 0.75);
    color: #bfdbfe;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.mode-chip.active {
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(124, 58, 237, 0.85));
    border-color: rgba(59, 130, 246, 0.6);
    color: #fff;
}

.manual {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.gradient {
    position: relative;
    height: 90px;
}

.gradient__bar {
    position: absolute;
    inset: 18px 20px;
    background: linear-gradient(90deg, #000, #fff);
    border-radius: 999px;
    overflow: hidden;
}

.gradient__fill {
    position: absolute;
    top: 0;
    height: 100%;
    background: rgba(59, 130, 246, 0.45);
    border-radius: inherit;
    pointer-events: none;
}

.gradient__markers {
    position: absolute;
    inset: 0 0 auto 0;
    height: 100%;
    pointer-events: none;
}

.gradient__marker,
.marker-label {
    position: absolute;
    top: 20px;
    transform: translate(-50%, -50%);
    z-index: 3;
    pointer-events: none;
}

.marker-label::before {
    content: '';
    position: absolute;
    inset: -18px -24px;
}

.marker-label span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 12px;
    border-radius: 999px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    background: rgba(30, 64, 175, 0.7);
    color: #dbeafe;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    white-space: nowrap;
}

.marker-label--to span {
    color: #ede9fe;
    border-color: rgba(129, 140, 248, 0.4);
    background: rgba(79, 70, 229, 0.7);
}

.gradient__marker--current {
    top: 68px;
    height: auto;
    min-width: 72px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 500;
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(74, 222, 128, 0.35);
    color: #bbf7d0;
    text-transform: none;
}

.slider {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    width: 100%;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    /* Let page scroll vertically when gesture is vertical */
    touch-action: pan-y;
}

.slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #60a5fa;
    border: 2px solid #1f2937;
    cursor: pointer;
}

.slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #60a5fa;
    border: 2px solid #1f2937;
    cursor: pointer;
}

.slider--from {
    top: 0;
}

.slider--to {
    bottom: 0;
}

.manual__inputs {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
}

.manual__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #cbd5f5;
}

.manual__field input {
    width: 72px;
}

.swap {
    width: 72px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid rgba(96, 165, 250, 0.35);
    background: rgba(17, 24, 39, 0.65);
    color: #bfdbfe;
    font-size: 18px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}

.swap:hover {
    background: rgba(37, 99, 235, 0.35);
    border-color: rgba(59, 130, 246, 0.6);
}

input[type='number'] {
    width: 72px;
    padding: 6px 8px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #f9fafb;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

input[type='number']:focus,
select:focus {
    outline: none;
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
}

select {
    width: 100%;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #f9fafb;
}

.sensor {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.sensor__pairs {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sensor__phrase {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
}

.sensor__line {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    color: #cbd5f5;
}

.sensor__row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.sensor__text {
    white-space: nowrap;
    font-size: 13px;
}

.sensor__line small {
    font-size: 11px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.sensor__line--output small {
    display: none;
}

.sensor__control {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(17, 24, 39, 0.4);
    border-radius: 10px;
    border: 1px solid rgba(71, 85, 105, 0.6);
    padding: 6px 8px;
}

.sensor__control input {
    width: 5ch;
    min-width: 5ch;
    max-width: 5ch;
    padding: 4px 0;
    height: 28px;
    border: none;
    background: transparent;
    color: #f9fafb;
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.sensor__control input:focus {
    outline: none;
}

.sensor__control .unit {
    font-size: 11px;
    color: #9ca3af;
    text-transform: uppercase;
}

.muted {
    font-size: 13px;
    color: #9ca3af;
}
</style>
