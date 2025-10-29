<script setup>
import { computed } from 'vue'
import RangeIntervalSlider from './RangeIntervalSlider.vue'

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

const updateSensor = (field, value) => {
    updateValue({ sensor: { [field]: parseNumber(value) } })
}

const updateSensorId = (value) => {
    updateValue({ sensor: { sensorId: value } })
}

const BRIGHTNESS_GRADIENT = 'linear-gradient(90deg, rgba(15, 23, 42, 0.92) 0%, rgba(248, 250, 252, 1) 100%)'
const BRIGHTNESS_GRADIENT_REVERSED = 'linear-gradient(90deg, rgba(248, 250, 252, 1) 0%, rgba(15, 23, 42, 0.92) 100%)'
const BRIGHTNESS_TICKS = [1, 25, 50, 75, 100]
const formatPercent = (value) => `${Math.round(value)}%`

const manualRange = computed(() => {
    const from = clamp(props.modelValue?.manual?.from ?? 80, 1, 100)
    const to = clamp(props.modelValue?.manual?.to ?? 20, 1, 100)
    return { from, to }
})

const manualSummary = computed(
    () => `Плавное изменение яркости от ${manualRange.value.from}% до ${manualRange.value.to}%`
)

const manualMarker = computed(() => {
    if (!props.runtime?.active) return null
    if (props.runtime?.source !== 'backend') return null
    const raw = parseNumber(props.runtime?.value)
    if (!Number.isFinite(raw)) return null
    const clampedValue = clamp(raw, 1, 100)
    const rounded = Math.round(clampedValue)
    return {
        value: clampedValue,
        label: `Сейчас ${rounded}%`,
        hint: 'Факт с устройств',
        fromBackend: true
    }
})

const handleManualRangeChange = (rangeUpdate) => {
    if (!rangeUpdate) return
    const fromNumeric = clamp(parseNumber(rangeUpdate.from) ?? manualRange.value.from, 1, 100)
    const toNumeric = clamp(parseNumber(rangeUpdate.to) ?? manualRange.value.to, 1, 100)
    updateValue({ manual: { from: fromNumeric, to: toNumeric } })
}
</script>

<template>
    <section class="blk">
        <header class="blk__header">
            <div>
                <h2>Изменение яркости</h2>
                <template v-if="modelValue.enabled">
                    <p class="blk__hint">
                        Сценарий плавно управляет яркостью выбранных устройств.
                    </p>
                    <p v-if="support.hasSelection && !support.available" class="blk__hint warn">Выбранные устройства не
                        поддерживают регулировку яркости.</p>
                    <p v-else-if="support.hasSelection && support.partial" class="blk__hint warn">
                        Часть устройств без регулировки яркости — сценарий применится только к совместимым.
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
                <RangeIntervalSlider :model-value="manualRange" :min="1" :max="100" :step="1" :gap="1"
                    :gradient="BRIGHTNESS_GRADIENT" :gradient-reverse="BRIGHTNESS_GRADIENT_REVERSED"
                    :summary="manualSummary" start-label="Старт" end-label="Финиш"
                    :ticks="BRIGHTNESS_TICKS" :tick-formatter="formatPercent" :format-value="formatPercent"
                    :marker="manualMarker" @update:modelValue="handleManualRangeChange"
                    @invert="handleManualRangeChange" />
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
