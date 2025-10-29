<script setup>
import { computed, ref } from 'vue'
import RangeIntervalSlider from './RangeIntervalSlider.vue'

const props = defineProps({
    modelValue: {
        type: Object,
        required: true
    },
    support: {
        type: Object,
        default: () => ({ available: false, partial: false })
    },
    runtime: {
        type: Object,
        default: () => ({ active: false, mode: 'temperature', temperature: null, colorHex: null, progress: null, source: null })
    }
})

const emit = defineEmits(['update:modelValue'])

const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min
    return Math.min(Math.max(value, min), max)
}

const TEMPERATURE_MIN = 2000
const TEMPERATURE_MAX = 7000
const TEMPERATURE_STEP = 100
const TEMPERATURE_GAP = 100
const TEMPERATURE_DEFAULT_FROM = 2000
const TEMPERATURE_DEFAULT_TO = 7000
const TEMPERATURE_NEUTRAL = 5500

const TEMPERATURE_GRADIENT_WARM = '#ffb56b'
const TEMPERATURE_GRADIENT_NEUTRAL = '#ffffff'
const TEMPERATURE_GRADIENT_COOL = '#6cb8ff'

const debugLog = (...args) => {
    if (import.meta.env?.DEV) console.debug(...args)
}

const snapToTemperatureStep = (value) => Math.round(value / TEMPERATURE_STEP) * TEMPERATURE_STEP

const temperaturePercentFor = (value) => {
    const clamped = clamp(value, TEMPERATURE_MIN, TEMPERATURE_MAX)
    return ((clamped - TEMPERATURE_MIN) / (TEMPERATURE_MAX - TEMPERATURE_MIN)) * 100
}

const parseNumber = (value) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
}

const updateValue = (patch) => {
    const next = {
        enabled: Boolean(props.modelValue?.enabled),
        mode: props.modelValue?.mode === 'colors' ? 'colors' : 'temperature',
        temperature: {
            fromK: props.modelValue?.temperature?.fromK ?? TEMPERATURE_DEFAULT_FROM,
            toK: props.modelValue?.temperature?.toK ?? TEMPERATURE_DEFAULT_TO
        },
        colors: {
            from: {
                h: props.modelValue?.colors?.from?.h ?? 35,
                s: props.modelValue?.colors?.from?.s ?? 70,
                v: props.modelValue?.colors?.from?.v ?? 90
            },
            to: {
                h: props.modelValue?.colors?.to?.h ?? 210,
                s: props.modelValue?.colors?.to?.s ?? 40,
                v: props.modelValue?.colors?.to?.v ?? 60
            }
        }
    }
    if (patch.enabled !== undefined) next.enabled = patch.enabled
    if (patch.mode) next.mode = patch.mode
    if (patch.temperature) next.temperature = { ...next.temperature, ...patch.temperature }
    if (patch.colors) {
        next.colors = {
            from: { ...next.colors.from, ...(patch.colors.from || {}) },
            to: { ...next.colors.to, ...(patch.colors.to || {}) }
        }
    }
    emit('update:modelValue', next)
}

const toggleEnabled = (checked) => {
    updateValue({ enabled: checked })
}

const setMode = (mode) => {
    updateValue({ mode: mode === 'colors' ? 'colors' : 'temperature' })
}

const kelvinToRgb = (kelvin) => {
    const temp = clamp(kelvin, 1000, 40000) / 100
    let r, g, b
    if (temp <= 66) {
        r = 255
        g = clamp(99.4708025861 * Math.log(temp) - 161.1195681661, 0, 255)
        b = temp <= 19 ? 0 : clamp(138.5177312231 * Math.log(temp - 10) - 305.0447927307, 0, 255)
    } else {
        r = clamp(329.698727446 * Math.pow(temp - 60, -0.1332047592), 0, 255)
        g = clamp(288.1221695283 * Math.pow(temp - 60, -0.0755148492), 0, 255)
        b = 255
    }
    return { r, g, b }
}

const hsvToRgb = (h, s, v) => {
    const hue = ((h ?? 0) % 360 + 360) % 360
    const sat = clamp(s ?? 0, 0, 100) / 100
    const val = clamp(v ?? 0, 0, 100) / 100
    const c = val * sat
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
    const m = val - c
    let r1 = 0, g1 = 0, b1 = 0
    if (hue < 60) { r1 = c; g1 = x; b1 = 0 }
    else if (hue < 120) { r1 = x; g1 = c; b1 = 0 }
    else if (hue < 180) { r1 = 0; g1 = c; b1 = x }
    else if (hue < 240) { r1 = 0; g1 = x; b1 = c }
    else if (hue < 300) { r1 = x; g1 = 0; b1 = c }
    else { r1 = c; g1 = 0; b1 = x }
    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255)
    }
}

const rgbToHex = (r, g, b) => {
    const parts = [r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    return `#${parts.join('')}`
}

const hsvToHex = (hsv) => {
    const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
}

const hexToRgb = (hex) => {
    const clean = String(hex || '').replace('#', '')
    if (clean.length !== 6) return { r: 0, g: 0, b: 0 }
    return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16)
    }
}

const rgbToHsv = (rgb) => {
    const rn = rgb.r / 255
    const gn = rgb.g / 255
    const bn = rgb.b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
        switch (max) {
            case rn:
                h = ((gn - bn) / delta) % 6
                break
            case gn:
                h = (bn - rn) / delta + 2
                break
            default:
                h = (rn - gn) / delta + 4
                break
        }
        h *= 60
        if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : delta / max
    const v = max
    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        v: Math.round(v * 100)
    }
}

const kelvinToHex = (kelvin) => {
    const rgb = kelvinToRgb(kelvin)
    return rgbToHex(rgb.r, rgb.g, rgb.b)
}

const colorGradient = (from, to) => {
    const start = hsvToHex(from)
    const end = hsvToHex(to)
    return `linear-gradient(90deg, ${start}, ${end})`
}

const setTemperatureRange = (fromK, toK) => {
    const fromSanitized = clamp(snapToTemperatureStep(fromK ?? TEMPERATURE_DEFAULT_FROM), TEMPERATURE_MIN, TEMPERATURE_MAX)
    const toSanitized = clamp(snapToTemperatureStep(toK ?? TEMPERATURE_DEFAULT_TO), TEMPERATURE_MIN, TEMPERATURE_MAX)
    updateValue({ temperature: { fromK: fromSanitized, toK: toSanitized } })
}

const handleTemperatureRangeChange = (rangeUpdate) => {
    if (!rangeUpdate) return
    const from = Number(rangeUpdate.from)
    const to = Number(rangeUpdate.to)
    setTemperatureRange(Number.isFinite(from) ? from : undefined, Number.isFinite(to) ? to : undefined)
}

const updateColorChannel = (scope, channel, value) => {
    const numeric = clamp(parseNumber(value) ?? 0, channel === 'h' ? 0 : 0, channel === 'h' ? 360 : 100)
    updateValue({ colors: { [scope]: { [channel]: numeric } } })
}

const updateColorHex = (scope, hex) => {
    const rgb = hexToRgb(hex)
    const hsv = rgbToHsv(rgb)
    updateValue({ colors: { [scope]: hsv } })
}

const activeMode = computed(() => (props.modelValue?.mode === 'colors' ? 'colors' : 'temperature'))

const temperatureRange = computed(() => {
    const fromRaw = clamp(props.modelValue?.temperature?.fromK ?? 4000, TEMPERATURE_MIN, TEMPERATURE_MAX)
    const toRaw = clamp(props.modelValue?.temperature?.toK ?? 2700, TEMPERATURE_MIN, TEMPERATURE_MAX)
    const fromK = clamp(snapToTemperatureStep(fromRaw), TEMPERATURE_MIN, TEMPERATURE_MAX)
    const toK = clamp(snapToTemperatureStep(toRaw), TEMPERATURE_MIN, TEMPERATURE_MAX)
    return { fromK, toK }
})

const temperatureSliderRange = computed(() => ({
    from: temperatureRange.value.fromK,
    to: temperatureRange.value.toK
}))

const isTemperatureAscending = computed(() => temperatureRange.value.fromK <= temperatureRange.value.toK)

const temperatureGradientForward = computed(() => {
    const neutralPercent = temperaturePercentFor(TEMPERATURE_NEUTRAL)
    return `linear-gradient(90deg, ${TEMPERATURE_GRADIENT_WARM} 0%, ${TEMPERATURE_GRADIENT_NEUTRAL} ${neutralPercent}%, ${TEMPERATURE_GRADIENT_COOL} 100%)`
})

const temperatureGradientReverse = computed(() => {
    const neutralPercent = 100 - temperaturePercentFor(TEMPERATURE_NEUTRAL)
    return `linear-gradient(90deg, ${TEMPERATURE_GRADIENT_COOL} 0%, ${TEMPERATURE_GRADIENT_NEUTRAL} ${neutralPercent}%, ${TEMPERATURE_GRADIENT_WARM} 100%)`
})

const temperatureTicks = computed(() => {
    const ticks = []
    for (let value = TEMPERATURE_MIN; value <= TEMPERATURE_MAX; value += 1000) {
        ticks.push(value)
    }
    return ticks
})

const temperatureSummary = computed(
    () => `Изменение температуры от ${temperatureRange.value.fromK}K до ${temperatureRange.value.toK}K`
)

const formatTemperatureValue = (value) => `${Math.round(value)}K`

const temperatureMarker = computed(() => {
    if (!props.runtime?.active) {
        debugLog('[ColorRamp] temperatureMarker: runtime inactive', props.runtime)
        return null
    }
    if (activeMode.value === 'colors') {
        debugLog('[ColorRamp] temperatureMarker: mode colors, skip', props.runtime)
        return null
    }
    const runtimeValue = parseNumber(props.runtime?.temperature)
    if (!Number.isFinite(runtimeValue)) {
        debugLog('[ColorRamp] temperatureMarker: runtime temperature not finite', props.runtime?.temperature)
        return null
    }
    const clampedValue = clamp(runtimeValue, TEMPERATURE_MIN, TEMPERATURE_MAX)
    const rounded = Math.round(clampedValue)
    const marker = {
        value: clampedValue,
        label: `Сейчас ${rounded} K`,
        hint: props.runtime?.source ? `Источник: ${props.runtime.source}` : '',
        fromBackend: props.runtime?.source === 'backend'
    }
    debugLog('[ColorRamp] temperatureMarker: computed', marker)
    return marker
})

const colorMarker = computed(() => {
    if (!props.runtime?.active) return null
    if (activeMode.value !== 'colors') return null
    const progress = parseNumber(props.runtime?.progress)
    const percent = Number.isFinite(progress) ? clamp(progress * 100, 0, 100) : 50
    const hasVisual = typeof props.runtime?.colorHex === 'string' || props.runtime?.hsv
    if (!hasVisual && !Number.isFinite(progress)) return null
    let hex = props.runtime?.colorHex
    if ((!hex || hex === '') && props.runtime?.hsv) {
        hex = hsvToHex(props.runtime.hsv)
    }
    const displayValue = Number.isFinite(progress) ? `${Math.round(percent)}%` : ''
    return {
        percent,
        hex,
        value: displayValue
    }
})

</script>

<template>
    <section class="blk">
        <header class="blk__header">
            <div>
                <h2>Изменение цвета</h2>
                <template v-if="modelValue.enabled">
                    <p class="blk__hint">
                        Плавная смена температуры или цвета в течение окна сценария.
                    </p>
                    <p v-if="support.hasSelection && !support.available" class="blk__hint warn">Выбранные устройства не
                        поддерживают изменение цвета.</p>
                    <p v-else-if="support.hasSelection && support.partial" class="blk__hint warn">
                        Часть устройств без поддержки цвета — действие применится только к совместимым.
                    </p>
                </template>
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
                <button type="button" :class="['mode-chip', { active: modelValue.mode !== 'colors' }]"
                    @click="setMode('temperature')">
                    Температура
                </button>
                <button type="button" :class="['mode-chip', { active: modelValue.mode === 'colors' }]"
                    @click="setMode('colors')">
                    Цвета
                </button>
            </div>

            <div v-if="activeMode !== 'colors'" class="temperature">
                <RangeIntervalSlider
                    :model-value="temperatureSliderRange"
                    :min="TEMPERATURE_MIN"
                    :max="TEMPERATURE_MAX"
                    :step="TEMPERATURE_STEP"
                    :gap="TEMPERATURE_GAP"
                    :gradient="temperatureGradientForward"
                    :gradient-reverse="temperatureGradientReverse"
                    :summary="temperatureSummary"
                    start-label="Старт"
                    end-label="Финиш"
                    invert-label="Инвертировать"
                    :ticks="temperatureTicks"
                    :tick-formatter="formatTemperatureValue"
                    :format-value="formatTemperatureValue"
                    :marker="temperatureMarker"
                    @update:modelValue="handleTemperatureRangeChange"
                    @invert="handleTemperatureRangeChange"
                />
            </div>

            <div v-else class="colors">
                <div class="colors__row">
                    <div class="colors__endpoint">
                        <span class="colors__label">Старт</span>
                        <label class="colors__swatch">
                            <input type="color" :value="hsvToHex(modelValue.colors?.from ?? { h: 0, s: 0, v: 100 })"
                                @input="updateColorHex('from', $event.target.value)" />
                        </label>
                    </div>
                    <div class="colors__gradient-wrapper">
                        <div class="colors__gradient"
                            :style="{ background: colorGradient(modelValue.colors?.from ?? {}, modelValue.colors?.to ?? {}) }">
                        </div>
                        <div v-if="colorMarker" class="colors__tooltip" :style="{ left: `${colorMarker.percent}%` }">
                            <span class="colors__tooltip-label">Сейчас</span>
                            <span class="colors__tooltip-value">{{ colorMarker.value || '\u00A0' }}</span>
                        </div>
                    </div>
                    <div class="colors__endpoint colors__endpoint--right">
                        <span class="colors__label">Финиш</span>
                        <label class="colors__swatch">
                            <input type="color" :value="hsvToHex(modelValue.colors?.to ?? { h: 0, s: 0, v: 100 })"
                                @input="updateColorHex('to', $event.target.value)" />
                        </label>
                    </div>
                </div>
            </div>
        </div>
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

.temperature {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

input[type='number'] {
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #f9fafb;
    text-align: right;
    font-variant-numeric: tabular-nums;
    height: 40px;
}

input[type='range'] {
    width: 100%;
    accent-color: #60a5fa;
}

.colors__row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
}

.colors__endpoint {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: #cbd5f5;
    font-size: 12px;
    min-width: 56px;
}

.colors__label {
    white-space: nowrap;
}

.colors__swatch {
    display: inline-flex;
}

.colors__swatch input[type='color'] {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    border: 1px solid rgba(96, 165, 250, 0.45);
    background: none;
    padding: 0;
    cursor: pointer;
}

.colors__swatch input[type='color']::-webkit-color-swatch-wrapper {
    padding: 0;
    border-radius: 16px;
}

.colors__swatch input[type='color']::-webkit-color-swatch {
    border: none;
    border-radius: 16px;
}

.colors__gradient-wrapper {
    position: relative;
    flex: 1;
}

.colors__gradient {
    height: 48px;
    border-radius: 14px;
    border: 1px solid rgba(96, 165, 250, 0.4);
    overflow: hidden;
}

.colors__tooltip {
    position: absolute;
    top: calc(100% + 4px);
    transform: translateX(-50%);
    background: rgba(30, 41, 59, 0.9);
    border-radius: 8px;
    padding: 3px 6px;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    color: #f8fafc;
    pointer-events: none;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.45);
    white-space: nowrap;
}

.colors__tooltip-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.colors__tooltip-value {
    min-height: 12px;
    font-variant-numeric: tabular-nums;
}

.colors__tooltip::after {
    content: '';
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translate(-50%, -100%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 5px solid rgba(30, 41, 59, 0.9);
}

.muted {
    font-size: 13px;
    color: #9ca3af;
}
</style>
