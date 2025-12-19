<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'

import { applyBrightnessMode } from '../../utils/stopStateRules'
import { computeEnvironment } from '../../utils/scenarioUtils'
import AutoBrightnessGraph from './AutoBrightnessGraph.vue'
import BottomSheet from './BottomSheet.vue'
import SegmentedControl from './SegmentedControl.vue'

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
    },
    time: {
        type: Object,
        default: () => ({})
    }
})

const emit = defineEmits(['close'])

const isStartContext = computed(() => props.context !== 'end')
const autoMode = computed(() => Boolean(props.autoBrightness?.enabled))
const temperatureGradient = 'linear-gradient(90deg, #ff9b0a 0%, #fffbe8 70%, #c8edff 100%)'
const brightnessGradient = 'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,1) 100%)'
const sheetTitle = computed(() => (props.context === 'end' ? 'Конец сценария' : 'Начало сценария'))
const timeSectionTitle = computed(() => (props.context === 'end' ? 'Время окончания' : 'Время старта'))

const MINUTES_PER_DAY = 1440
const OFFSET_LIMIT = 60
const SUN_OFFSET_STEP = 5
const WHEEL_ITEM_HEIGHT = 34
const MINUTE_STEP = 5
const WHEEL_SCROLL_IDLE_MS = 180
const WHEEL_SCROLL_CHECK_MS = 80

const timeMode = ref('clock')
const clockMinutesValue = ref(0)
const sunAnchorOffsets = reactive({
    sunrise: 0,
    sunset: 0
})
const sunEnvironment = computed(() => computeEnvironment(props.time || {}))

const SENSOR_MAX_FALLBACK = 100000
const SENSOR_MIN_FLOOR = 1
const autoBrightnessViewMode = ref('basic')
const stopTimeWriteEnabled = ref(false)

const selectedSensorOption = computed(() =>
    (props.sensorOptions || []).find((option) => option?.id === props.autoBrightness?.sensorId) || null
)
const fallbackSensorOption = computed(() => (props.sensorOptions || [])[0] || null)

const sensorMinLimit = computed(() => {
    const candidate = Number(selectedSensorOption.value?.minValue)
    if (Number.isFinite(candidate) && candidate > 0) return Math.max(SENSOR_MIN_FLOOR, Math.round(candidate))
    const fallback = Number(fallbackSensorOption.value?.minValue)
    if (Number.isFinite(fallback) && fallback > 0) return Math.max(SENSOR_MIN_FLOOR, Math.round(fallback))
    return SENSOR_MIN_FLOOR
})

const sensorMaxLimit = computed(() => {
    const selected = Number(selectedSensorOption.value?.maxValue)
    const fallback = Number(fallbackSensorOption.value?.maxValue)
    const luxValues = [
        Number(props.autoBrightness?.luxMin),
        Number(props.autoBrightness?.luxMax)
    ].filter((value) => Number.isFinite(value))
    const candidates = [selected, fallback, ...luxValues].filter((value) =>
        Number.isFinite(value) && value > sensorMinLimit.value
    )
    const maxSource = candidates.length ? Math.max(...candidates) : SENSOR_MAX_FALLBACK
    const bounded = Math.max(sensorMinLimit.value + 1, Math.round(maxSource))
    return Math.min(SENSOR_MAX_FALLBACK, bounded)
})

watch(
    () => props.open,
    (open) => {
        if (!open) {
            stopTimeWriteEnabled.value = false
        }
    }
)

function setColorMode(mode) {
    if (!isStartContext.value) return
    props.stop.useColor = true
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

const colorSelection = computed(() => {
    if (!props.stop.useColor) return 'off'
    return props.stop.colorMode === 'rgb' ? 'rgb' : 'temperature'
})

const brightnessSelection = computed(() => {
    if (!props.stop.useBrightness) return 'off'
    return autoMode.value ? 'auto' : 'manual'
})

function setColorSelection(value) {
    if (!isStartContext.value) return
    if (value === 'off') {
        props.stop.useColor = false
        return
    }
    setColorMode(value === 'rgb' ? 'rgb' : 'temperature')
}

function setBrightnessSelection(value) {
    if (!isStartContext.value) return
    if (value === 'off') {
        props.stop.useBrightness = false
        if (props.autoBrightness) props.autoBrightness.enabled = false
        return
    }
    props.stop.useBrightness = true
    setBrightnessMode(value === 'auto' ? 'auto' : 'manual')
}

watch(
    () => props.stop.useBrightness,
    (enabled) => {
        if (!enabled && props.autoBrightness) props.autoBrightness.enabled = false
    },
    { immediate: true }
)

function getSunClockMinutes(anchor, offsetMin = 0) {
    const env = sunEnvironment.value
    const base = anchor === 'sunrise' ? env.sunriseMin : env.sunsetMin
    return normalizeMinutes(base + (Number(offsetMin) || 0))
}

function hydrateTimeFromStop() {
    const mode = props.stop?.mode
    if (mode === 'sunrise' || mode === 'sunset') {
        const snapped = snapSunOffsetValue(props.stop?.offset)
        sunAnchorOffsets[mode] = snapped
        timeMode.value = mode
        clockMinutesValue.value = getSunClockMinutes(mode, snapped)
        return
    }
    timeMode.value = 'clock'
    const numeric = Number(props.stop?.clockMinutes)
    clockMinutesValue.value = Number.isFinite(numeric) ? snapClockMinutesValue(numeric) : 0
}

watch(
    () => props.stop.clockMinutes,
    (minutes) => {
        if (props.open && stopTimeWriteEnabled.value) return
        const numeric = Number(minutes)
        if (Number.isFinite(numeric)) {
            clockMinutesValue.value = snapClockMinutesValue(numeric)
        }
    },
    { immediate: true }
)

watch(
    () => [props.stop.mode, props.stop.offset],
    ([mode, offset]) => {
        if (props.open && stopTimeWriteEnabled.value) return
        if (mode === 'sunrise' || mode === 'sunset') {
            const snapped = snapSunOffsetValue(offset)
            sunAnchorOffsets[mode] = snapped
            timeMode.value = mode
            clockMinutesValue.value = getSunClockMinutes(mode, snapped)
        } else {
            timeMode.value = 'clock'
        }
    },
    { immediate: true }
)

watch(
    () => [props.time?.tz, props.time?.lat, props.time?.lon],
    () => {
        if (props.open && stopTimeWriteEnabled.value) return
        const mode = props.stop.mode
        if (mode === 'sunrise' || mode === 'sunset') {
            clockMinutesValue.value = getSunClockMinutes(mode, snapSunOffsetValue(props.stop.offset))
        }
    }
)

watch(
    () => [props.stop.mode, props.stop.offset, props.stop.clockMinutes],
    () => {
        if (props.open) return
        hydrateTimeFromStop()
    },
    { immediate: true }
)

watch(
    () => [props.time?.tz, props.time?.lat, props.time?.lon],
    () => {
        if (props.open) return
        const mode = props.stop.mode
        if (mode === 'sunrise' || mode === 'sunset') {
            clockMinutesValue.value = getSunClockMinutes(mode, clampOffset(props.stop.offset))
        }
    }
)

watch(clockMinutesValue, (value) => {
    if (!props.open || !stopTimeWriteEnabled.value) return
    if (timeMode.value === 'clock') {
        props.stop.mode = 'clock'
        props.stop.offset = 0
        props.stop.clockMinutes = value
    }
})

const clockHour = computed(() => Math.floor(clockMinutesValue.value / 60))
const clockMinute = computed(() => clockMinutesValue.value % 60)
const clockHourWheel = computed(() => Array.from({ length: 24 }, (_, index) => index))
const clockMinuteWheel = computed(() => Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP))

const activeSunAnchor = computed(() => (timeMode.value === 'sunrise' || timeMode.value === 'sunset' ? timeMode.value : ''))
const activeSunOffset = computed(() => (activeSunAnchor.value ? sunAnchorOffsets[activeSunAnchor.value] : 0))
const sunWheelValues = computed(() => {
    if (!activeSunAnchor.value) return []
    const values = []
    for (let offset = -OFFSET_LIMIT; offset <= OFFSET_LIMIT; offset += SUN_OFFSET_STEP) {
        values.push(offset)
    }
    return values
})
const sunAnchorLabel = computed(() => {
    if (activeSunAnchor.value === 'sunrise') return 'Рассвет'
    if (activeSunAnchor.value === 'sunset') return 'Закат'
    return ''
})
const hourWheelRef = ref(null)
const minuteWheelRef = ref(null)
const sunWheelRef = ref(null)
const customColorInputRef = ref(null)
const wheelPointerDown = reactive({
    hour: false,
    minute: false,
    sun: false
})
const wheelLastScrollAt = reactive({
    hour: 0,
    minute: 0,
    sun: 0
})
const wheelSyncLock = reactive({
    hour: false,
    minute: false,
    sun: false
})
const wheelProgrammaticUntil = reactive({
    hour: 0,
    minute: 0,
    sun: 0
})
const wheelScrollTimers = {
    hour: null,
    minute: null,
    sun: null
}

function selectTimeMode(mode) {
    if (mode !== 'clock' && mode !== 'sunrise' && mode !== 'sunset') return
    const previousMode = timeMode.value
    timeMode.value = mode
    if (mode === 'clock') {
        if (previousMode === 'sunrise' || previousMode === 'sunset') {
            const derived = getSunClockMinutes(previousMode, sunAnchorOffsets[previousMode] || 0)
            clockMinutesValue.value = snapClockMinutesValue(derived)
        }
        props.stop.mode = 'clock'
        props.stop.offset = 0
        props.stop.clockMinutes = clockMinutesValue.value
        syncClockWheels('auto')
    } else {
        props.stop.mode = mode
        props.stop.offset = sunAnchorOffsets[mode]
        nextTick().then(() => syncSunWheel('auto'))
    }
}

function setClockMinutes(value) {
    clockMinutesValue.value = snapClockMinutesValue(value)
}

function setClockHour(hour) {
    const normalized = ((Number(hour) % 24) + 24) % 24
    const minutes = clockMinutesValue.value % 60
    setClockMinutes(normalized * 60 + minutes)
}

function setClockMinute(minute) {
    const normalized = ((Number(minute) % 60) + 60) % 60
    const hours = Math.floor(clockMinutesValue.value / 60)
    setClockMinutes(hours * 60 + normalized)
}

function selectClockWheel(part, value) {
    if (part === 'hour') setClockHour(value)
    else setClockMinute(value)
}

function handleWheelScroll(type) {
    if (!props.open) return
    if (wheelSyncLock[type]) return
    if (wheelPointerDown[type]) return
    if ((wheelProgrammaticUntil[type] || 0) > Date.now()) return
    wheelLastScrollAt[type] = Date.now()
    scheduleWheelFinalize(type)
}

function scheduleWheelFinalize(type) {
    if (wheelScrollTimers[type]) clearTimeout(wheelScrollTimers[type])
    wheelScrollTimers[type] = window.setTimeout(() => {
        if (!props.open) return
        if (wheelSyncLock[type]) return
        if (wheelPointerDown[type]) {
            scheduleWheelFinalize(type)
            return
        }
        if ((wheelProgrammaticUntil[type] || 0) > Date.now()) {
            scheduleWheelFinalize(type)
            return
        }
        const idleFor = Date.now() - (wheelLastScrollAt[type] || 0)
        if (idleFor < WHEEL_SCROLL_IDLE_MS) {
            scheduleWheelFinalize(type)
            return
        }
        finalizeWheelScroll(type)
    }, WHEEL_SCROLL_CHECK_MS)
}

function beginWheelPointer(type, event) {
    wheelPointerDown[type] = true
    event.currentTarget?.setPointerCapture?.(event.pointerId)
}

function endWheelPointer(type, event) {
    wheelPointerDown[type] = false
    event?.currentTarget?.releasePointerCapture?.(event.pointerId)
    handleWheelScroll(type)
}

function setSunOffsetValue(anchor, value) {
    if (!anchor) return
    const snapped = snapSunOffsetValue(value)
    sunAnchorOffsets[anchor] = snapped
    if (timeMode.value === anchor) {
        props.stop.mode = anchor
        props.stop.offset = snapped
        clockMinutesValue.value = getSunClockMinutes(anchor, snapped)
    }
}

function formatClockValue(value) {
    return String(value).padStart(2, '0')
}

function formatOffsetDuration(value) {
    const abs = Math.abs(value)
    const hours = Math.floor(abs / 60)
    const minutes = abs % 60
    const parts = []
    if (hours) parts.push(`${hours} ч`)
    if (minutes || !parts.length) parts.push(`${minutes} мин`)
    return parts.join(' ')
}

function formatSunValue(value) {
    if (!activeSunAnchor.value) return ''
    if (value === 0) return sunAnchorLabel.value
    const sign = value > 0 ? '+' : '-'
    return `${sign}${formatOffsetDuration(value)}`
}

function normalizeMinutes(value) {
    let next = Number(value) % MINUTES_PER_DAY
    if (Number.isNaN(next)) return 0
    if (next < 0) next += MINUTES_PER_DAY
    return next
}

function clampOffset(value) {
    const numeric = Math.round(Number(value) || 0)
    return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, numeric))
}

function snapClockMinutesValue(value) {
    const normalized = normalizeMinutes(value)
    const snapped = Math.round(normalized / MINUTE_STEP) * MINUTE_STEP
    return normalizeMinutes(snapped)
}

function snapSunOffsetValue(value) {
    const numeric = Number(value) || 0
    const snapped = Math.round(numeric / SUN_OFFSET_STEP) * SUN_OFFSET_STEP
    return clampOffset(snapped)
}

function finalizeWheelScroll(type) {
    const element = getWheelElement(type)
    if (!element) return
    const values = type === 'sun' ? sunWheelValues.value : null
    if (type === 'sun' && (!values || !values.length)) return
    const minuteWheelCount = clockMinuteWheel.value.length
    const maxIndex = type === 'hour' ? 23 : type === 'minute' ? Math.max(0, minuteWheelCount - 1) : values.length - 1
    const rawIndex = Math.round((element.scrollTop || 0) / WHEEL_ITEM_HEIGHT)
    const index = Math.max(0, Math.min(maxIndex, rawIndex))
    if (type === 'hour') {
        setClockHour(index)
        scrollWheelToValue('hour', index, 'smooth')
    } else if (type === 'minute') {
        const minuteValue = clockMinuteWheel.value[index] ?? 0
        setClockMinute(minuteValue)
        scrollWheelToValue('minute', minuteValue, 'smooth')
    } else {
        const value = values[index]
        setSunOffsetValue(activeSunAnchor.value, value)
        scrollWheelToValue('sun', value, 'smooth')
    }
}

function getWheelElement(type) {
    if (type === 'hour') return hourWheelRef.value
    if (type === 'minute') return minuteWheelRef.value
    if (type === 'sun') return sunWheelRef.value
    return null
}

function scrollWheelToValue(type, value, behavior = 'smooth') {
    if (!props.open) return
    const element = getWheelElement(type)
    if (!element) return
    const index = valueToIndex(type, value)
    const top = index * WHEEL_ITEM_HEIGHT
    const durationMs = behavior === 'smooth' ? 320 : 80
    wheelSyncLock[type] = true
    wheelProgrammaticUntil[type] = Date.now() + durationMs
    element.scrollTo({ top, behavior })
    window.setTimeout(() => {
        wheelSyncLock[type] = false
    }, durationMs)
}

function valueToIndex(type, value) {
    if (type === 'hour') return ((Number(value) % 24) + 24) % 24
    if (type === 'minute') {
        const minute = ((Number(value) % 60) + 60) % 60
        return Math.round(minute / MINUTE_STEP)
    }
    const values = sunWheelValues.value
    const index = values.indexOf(Number(value))
    return index >= 0 ? index : 0
}

async function syncClockWheels(behavior = 'auto') {
    if (!props.open) return
    await nextTick()
    requestAnimationFrame(() => {
        scrollWheelToValue('hour', clockHour.value, behavior)
        scrollWheelToValue('minute', clockMinute.value, behavior)
    })
}

async function syncSunWheel(behavior = 'auto') {
    if (!props.open) return
    if (!activeSunAnchor.value) return
    await nextTick()
    requestAnimationFrame(() => {
        scrollWheelToValue('sun', activeSunOffset.value, behavior)
    })
}

watch(
    () => clockHour.value,
    (value) => {
        if (!props.open || wheelSyncLock.hour) return
        scrollWheelToValue('hour', value, 'smooth')
    }
)

watch(
    () => clockMinute.value,
    (value) => {
        if (!props.open || wheelSyncLock.minute) return
        scrollWheelToValue('minute', value, 'smooth')
    }
)

watch(
    () => [activeSunAnchor.value, activeSunOffset.value],
    ([anchor, offset]) => {
        if (!props.open || !anchor || wheelSyncLock.sun) return
        scrollWheelToValue('sun', offset, 'smooth')
    }
)

watch(
    () => props.open,
    async (open) => {
        if (open) {
            stopTimeWriteEnabled.value = false
            hydrateTimeFromStop()
            if (timeMode.value === 'clock') await syncClockWheels('auto')
            else await syncSunWheel('auto')
            stopTimeWriteEnabled.value = true
        }
    },
    { immediate: true }
)

function lock(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

function enforceSensorBounds() {
    const target = props.autoBrightness
    if (!target) return
    const minBound = sensorMinLimit.value
    const maxBound = sensorMaxLimit.value
    const nextLuxMin = lock(Math.round(target.luxMin ?? minBound), minBound, Math.max(minBound, (target.luxMax ?? maxBound) - 1))
    target.luxMin = nextLuxMin
    target.luxMax = lock(Math.round(target.luxMax ?? maxBound), Math.max(nextLuxMin + 1, minBound + 1), maxBound)
    const nextBrightnessMin = lock(
        Math.round(target.brightnessMin ?? 10),
        0,
        Math.max(0, (target.brightnessMax ?? 100) - 1)
    )
    target.brightnessMin = nextBrightnessMin
    target.brightnessMax = lock(Math.round(target.brightnessMax ?? 90), Math.max(nextBrightnessMin + 1, 1), 100)
}

watch([() => props.autoBrightness?.sensorId, sensorMaxLimit], () => {
    enforceSensorBounds()
}, { immediate: true })

watch(
    autoBrightnessViewMode,
    (mode) => {
        if (mode === 'basic' && props.autoBrightness) {
            props.autoBrightness.brightnessMin = 0
        }
    },
    { immediate: true }
)

function handleAutoBrightnessChange(patch) {
    if (!patch || typeof patch !== 'object') return
    const target = props.autoBrightness
    if (!target) return
    if (patch.luxMin != null) {
        const minBound = sensorMinLimit.value
        const clamped = lock(Math.round(patch.luxMin), minBound, Math.max(minBound, target.luxMax - 1))
        target.luxMin = clamped
    }
    if (patch.luxMax != null) {
        const maxBound = sensorMaxLimit.value
        const clamped = lock(Math.round(patch.luxMax), Math.max(target.luxMin + 1, sensorMinLimit.value + 1), maxBound)
        target.luxMax = clamped
    }
    if (patch.brightnessMin != null) {
        const clamped = lock(Math.round(patch.brightnessMin), 0, Math.max(0, target.brightnessMax - 1))
        target.brightnessMin = clamped
    }
    if (patch.brightnessMax != null) {
        const clamped = lock(Math.round(patch.brightnessMax), Math.max(target.brightnessMin + 1, 1), 100)
        target.brightnessMax = clamped
    }
}

const simpleDarkBrightness = computed({
    get: () => Math.round(props.autoBrightness?.brightnessMax ?? 100),
    set: (value) => {
        if (!props.autoBrightness) return
        const clamped = lock(Math.round(value), 0, 100)
        props.autoBrightness.brightnessMax = Math.max(clamped, props.autoBrightness.brightnessMin)
    }
})

const simpleLightLux = computed({
    get: () => Math.round(props.autoBrightness?.luxMax ?? sensorMaxLimit.value),
    set: (value) => {
        if (!props.autoBrightness) return
        const clamped = lock(Math.round(value), sensorMinLimit.value + 1, sensorMaxLimit.value)
        props.autoBrightness.luxMax = clamped
        if (props.autoBrightness.luxMin >= clamped) {
            props.autoBrightness.luxMin = Math.max(sensorMinLimit.value, clamped - 1)
        }
    }
})

function openCustomColorPicker() {
    customColorInputRef.value?.click?.()
}
</script>

<template>
    <BottomSheet :open="open" :title="sheetTitle" @close="emit('close')">
        <div class="stop-editor">
                        <section class="control-block time-section">


                            <SegmentedControl aria-label="Выбор режима времени" :model-value="timeMode"
                                @update:model-value="selectTimeMode" :options="[
                                    { value: 'clock', label: 'Время' },
                                    { value: 'sunrise', label: 'Рассвет' },
                                    { value: 'sunset', label: 'Закат' }
                                ]" />
                            <div v-if="timeMode === 'clock'" class="time-wheel">
                                <div class="picker clock-picker">
                                    <div class="highlight" aria-hidden="true" />
                                    <div class="fadeTop" aria-hidden="true" />
                                    <div class="fadeBottom" aria-hidden="true" />
                                    <div class="scroller-row">
                                        <div class="scroller" ref="hourWheelRef" @scroll="handleWheelScroll('hour')"
                                            @pointerdown="beginWheelPointer('hour', $event)"
                                            @pointerup="endWheelPointer('hour', $event)"
                                            @pointercancel="endWheelPointer('hour', $event)"
                                            @pointerleave="endWheelPointer('hour', $event)">
                                            <button v-for="(value, index) in clockHourWheel"
                                                :key="`hour-${index}-${value}`" type="button"
                                                :class="['item', { active: value === clockHour }]"
                                                @click="selectClockWheel('hour', value)">
                                                {{ formatClockValue(value) }}
                                            </button>
                                        </div>
                                        <div class="clock-separator" aria-hidden="true">:</div>
                                        <div class="scroller" ref="minuteWheelRef" @scroll="handleWheelScroll('minute')"
                                            @pointerdown="beginWheelPointer('minute', $event)"
                                            @pointerup="endWheelPointer('minute', $event)"
                                            @pointercancel="endWheelPointer('minute', $event)"
                                            @pointerleave="endWheelPointer('minute', $event)">
                                            <button v-for="(value, index) in clockMinuteWheel"
                                                :key="`minute-${index}-${value}`" type="button"
                                                :class="['item', { active: value === clockMinute }]"
                                                @click="selectClockWheel('minute', value)">
                                                {{ formatClockValue(value) }}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="sun-wheel">
                                <div class="picker single">
                                    <div class="highlight" aria-hidden="true" />
                                    <div class="fadeTop" aria-hidden="true" />
                                    <div class="fadeBottom" aria-hidden="true" />
                                    <div class="scroller" ref="sunWheelRef" @scroll="handleWheelScroll('sun')"
                                        @pointerdown="beginWheelPointer('sun', $event)"
                                        @pointerup="endWheelPointer('sun', $event)"
                                        @pointercancel="endWheelPointer('sun', $event)"
                                        @pointerleave="endWheelPointer('sun', $event)">
                                        <button v-for="(value, index) in sunWheelValues" :key="`sun-${index}-${value}`"
                                            type="button" :class="['item', { active: value === activeSunOffset }]"
                                            @click="setSunOffsetValue(activeSunAnchor, value)">
                                            {{ formatSunValue(value) }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>

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
                                                :style="{ '--range-gradient': temperatureGradient }"
                                                :value="stop.temperature"
                                                @input="updateTemperature($event.target.value)" />
                                        </label>
                                    </div>
                                    <div v-else class="palette">
                                        <button v-for="color in palette" :key="color" type="button" class="swatch"
                                            :class="{ active: stop.colorHex === color }" :style="{ background: color }"
                                            @click="stop.colorHex = color" />
                                        <button type="button" class="swatch swatch-add" aria-label="Выбрать свой цвет"
                                            @pointerdown.stop @click="openCustomColorPicker">
                                            <svg viewBox="0 0 24 24" aria-hidden="true" class="swatch-add-icon">
                                                <path
                                                    d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1Z" />
                                            </svg>
                                        </button>
                                        <input ref="customColorInputRef" class="custom-color-input" type="color"
                                            :value="stop.colorHex" @input="stop.colorHex = $event.target.value" />
                                    </div>
                                </template>
                                <p v-else class="block-hint">Цвет не изменяется</p>
                            </div>
                        </section>

                        <section class="control-block brightness-section">
                            <div class="block-header">
                                <div class="block-title">
                                    <h3 class="block-title-text">Яркость</h3>
                                </div>
                                <div v-if="isStartContext" class="header-controls">
                                    <SegmentedControl aria-label="Режим яркости" dense fit :disabled="!isStartContext"
                                        :model-value="brightnessSelection" @update:model-value="setBrightnessSelection"
                                        :options="[
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
                                                <select v-model="autoBrightness.sensorId">
                                                    <option v-if="!sensorOptions.length" disabled value="">Нет датчиков
                                                    </option>
                                                    <option v-for="sensor in sensorOptions" :key="sensor.id"
                                                        :value="sensor.id">
                                                        {{ sensor.name }}{{ sensor.currentLux != null ? ` (Сейчас:
                                                        ${sensor.currentLux} лк)` : '' }}
                                                    </option>
                                                </select>
                                            </label>
                                            <div class="auto-mode-toggle">
                                                <button type="button"
                                                    :class="['auto-mode-btn', { active: autoBrightnessViewMode === 'basic' }]"
                                                    @click="autoBrightnessViewMode = 'basic'">
                                                    Простой режим
                                                </button>
                                                <button type="button"
                                                    :class="['auto-mode-btn', { active: autoBrightnessViewMode === 'advanced' }]"
                                                    @click="autoBrightnessViewMode = 'advanced'">
                                                    Продвинутый
                                                </button>
                                            </div>
                                            <div v-if="autoBrightnessViewMode === 'basic'" class="auto-simple">
                                                <div class="auto-simple-line">
                                                    <span class="auto-simple-emoji">🌙</span>
                                                    <p class="auto-simple-text">
                                                        Когда темно — яркость ламп
                                                        <label>
                                                            <input type="number" min="0" max="100"
                                                                v-model.number="simpleDarkBrightness" />
                                                            <span>%</span>
                                                        </label>
                                                    </p>
                                                </div>
                                                <div class="auto-simple-line">
                                                    <span class="auto-simple-emoji">☀️</span>
                                                    <p class="auto-simple-text">
                                                        Выключить лампы, когда на датчике больше
                                                        <label>
                                                            <input type="number" :min="sensorMinLimit + 1"
                                                                :max="sensorMaxLimit" v-model.number="simpleLightLux" />
                                                            <span>лк</span>
                                                        </label>
                                                    </p>
                                                </div>
                                            </div>
                                            <template v-else>
                                                <AutoBrightnessGraph :lux-min="autoBrightness.luxMin"
                                                    :lux-max="autoBrightness.luxMax"
                                                    :brightness-min="autoBrightness.brightnessMin"
                                                    :brightness-max="autoBrightness.brightnessMax"
                                                    :sensor-min-limit="sensorMinLimit"
                                                    :sensor-max-limit="sensorMaxLimit"
                                                    @change="handleAutoBrightnessChange" />
                                                <p class="auto-graph-note">
                                                    Перетащите круги: 🌙 задаёт минимум датчика и яркость в темноте, ☀️
                                                    —
                                                    порог
                                                    яркого света и уровень света при нём. Подписи показывают текущие
                                                    значения.
                                                </p>
                                            </template>
                                        </template>
                                        <p v-else class="auto-note">Автояркость по датчику. Для редактирования выберите
                                            стартовое
                                            состояние.
                                        </p>
                                    </div>

                                    <div v-else class="slider-block">
                                        <label>
                                            <span class="slider-value">{{ stop.brightness }}%</span>
                                            <input class="gradient-range" type="range" min="1" max="100"
                                                :style="{ '--range-gradient': brightnessGradient }"
                                                :value="stop.brightness"
                                                @input="updateBrightness($event.target.value)" />
                                        </label>
                                    </div>
                                </template>
                                <p v-else class="block-hint">Яркость не изменяется</p>
                            </div>
                        </section>
                        <p v-if="!isStartContext" class="mode-note">
                            Выбрать другой режим изменения цвета и яркости можно в настройках стартового состояния.
                        </p>
        </div>
    </BottomSheet>
</template>

<style scoped>
.stop-editor {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.control-block {
    position: relative;
    display: flex;
    flex-direction: column;

}

.control-block+.control-block {
    margin-top: 6px;
}


.time-wheel {
    display: flex;
    gap: 16px;
    justify-content: center;
}

.sun-wheel {
    display: flex;
    justify-content: center;
}

.picker {
    position: relative;
    --item-height: 34px;
    --picker-height: 180px;
    --item-font-size: 18px;
    --picker-bg: rgb(12 19 36);
    height: var(--picker-height);
    width: 100%;
    max-width: 320px;
    overflow: hidden;
    background: transparent;
    border-radius: 18px;
}

.picker.single {
    max-width: 100%;
}

.scroller {
    height: 100%;
    overflow-y: auto;
    padding: calc((var(--picker-height) - var(--item-height)) / 2) 0;
    scrollbar-width: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.clock-picker .scroller-row {
    display: flex;
    gap: 2px;
    justify-content: center;
    height: 100%;
    -webkit-tap-highlight-color: transparent;
}

.clock-picker .scroller {
    width: 68px;
}

.clock-separator {
    font-size: var(--item-font-size);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    z-index: 4;
    pointer-events: none;
    width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.scroller::-webkit-scrollbar {
    display: none;
}

.item {
    height: var(--item-height);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--item-font-size);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    border: none;
    background: transparent;
    width: 100%;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.item:focus,
.item:focus-visible {
    outline: none;
}

.highlight {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: calc(var(--item-font-size) * 1.75);
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.08);
    pointer-events: none;
    z-index: 2;
}



.fadeTop,
.fadeBottom {
    position: absolute;
    left: 0;
    right: 0;
    height: 70px;
    pointer-events: none;
    z-index: 3;
}

.fadeTop {
    top: 0;
    background: linear-gradient(to bottom, rgb(12 19 36 / 100%), rgb(12 19 36 / 50%));
}

.fadeBottom {
    bottom: 0;
    background: linear-gradient(to top, rgb(12 19 36 / 100%), rgb(12 19 36 / 50%));
}

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
.block-note,
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

.temperature-label {
    gap: 10px;
}

.temperature-value {
    display: inline-flex;
    align-items: center;
    font-size: 1rem;
}

.slider-value {
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

.mode-note {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.75);
    margin: 0;
    padding: 0 2px 12px;
    text-align: center;
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
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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

.range-pair {
    display: flex;
    gap: 12px;
    align-items: flex-start;
}

.range-pair .field {
    flex: 1;
    min-width: 0;
}

.auto-mode-toggle {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.auto-mode-btn {
    flex: 1;
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 12px;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.4);
    color: #e2e8f0;
    font-weight: 600;
}

.auto-mode-btn.active {
    background: rgba(99, 102, 241, 0.25);
    border-color: #6366f1;
}

.auto-simple {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.auto-simple-line {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.5);
}

.auto-simple-emoji {
    font-size: 22px;
}

.auto-simple-text {
    margin: 0;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
}

.auto-simple-text label {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    font-weight: 600;
}

.auto-simple-text input {
    width: 80px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: transparent;
    color: inherit;
    padding: 6px 8px;
    text-align: right;
}

.auto-graph-note {
    margin: 10px 0 0;
    font-size: 12px;
    color: #94a3b8;
}

@media (max-width: 640px) {
    .range-pair {
        flex-direction: column;
    }
}
</style>
