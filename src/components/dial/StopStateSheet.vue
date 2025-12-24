<script setup>
import { computed, ref, toRaw, toRef, watch } from 'vue'

import { useStopTimeEditor } from '../../composables/useStopTimeEditor'
import BottomSheet from './BottomSheet.vue'
import SegmentedControl from './SegmentedControl.vue'
import StopBrightnessEditor from './StopBrightnessEditor.vue'
import StopColorEditor from './StopColorEditor.vue'
import WheelPicker from './WheelPicker.vue'

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

const emit = defineEmits(['close', 'update:stop', 'update:autoBrightness'])

function cloneValue(value) {
    return value ? structuredClone(toRaw(value)) : {}
}

const stopDraft = ref(cloneValue(props.stop))
const autoDraft = ref(cloneValue(props.autoBrightness))

watch(
    () => props.stop,
    (value) => {
        stopDraft.value = cloneValue(value)
    },
    { deep: true }
)
watch(
    () => props.autoBrightness,
    (value) => {
        autoDraft.value = cloneValue(value)
    },
    { deep: true }
)

function commitStop(patch) {
    stopDraft.value = { ...stopDraft.value, ...patch }
    emit('update:stop', stopDraft.value)
}

function commitAutoBrightness(patch) {
    autoDraft.value = { ...autoDraft.value, ...patch }
    emit('update:autoBrightness', autoDraft.value)
}

const openRef = toRef(props, 'open')
const sensorOptionsRef = toRef(props, 'sensorOptions')
const timeRef = toRef(props, 'time')

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

const isStartContext = computed(() => props.context !== 'end')
const sheetTitle = computed(() => (props.context === 'end' ? 'Конец сценария' : 'Начало сценария'))

const {
    timeMode,
    clockHour,
    clockMinute,
    clockHourWheel,
    clockMinuteWheel,
    activeSunAnchor,
    activeSunOffset,
    sunWheelValues,
    sunAnchorLabel,
    selectTimeMode,
    setClockHour,
    setClockMinute,
    setSunOffset
} = useStopTimeEditor(stopDraft, timeRef, openRef, commitStop)

function setSunOffsetValue(value) {
    setSunOffset(activeSunAnchor.value, value)
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
                            <WheelPicker :values="clockHourWheel" :model-value="clockHour" :active="open"
                                :format-value="formatClockValue" @update:model-value="setClockHour" />
                            <div class="clock-separator" aria-hidden="true">:</div>
                            <WheelPicker :values="clockMinuteWheel" :model-value="clockMinute" :active="open"
                                :format-value="formatClockValue" @update:model-value="setClockMinute" />
                        </div>
                    </div>
                </div>
                <div v-else class="sun-wheel">
                    <div class="picker single">
                        <div class="highlight" aria-hidden="true" />
                        <div class="fadeTop" aria-hidden="true" />
                        <div class="fadeBottom" aria-hidden="true" />
                        <WheelPicker :values="sunWheelValues" :model-value="activeSunOffset" :active="open"
                            :format-value="formatSunValue" @update:model-value="setSunOffsetValue" />
                    </div>
                </div>
            </section>

            <StopColorEditor :stop="stopDraft" :palette="palette" :is-start-context="isStartContext"
                @update:stop="commitStop" />

            <StopBrightnessEditor :stop="stopDraft" :auto-brightness="autoDraft" :sensor-options="sensorOptions"
                :is-start-context="isStartContext" :open="open" @update:stop="commitStop"
                @update:autoBrightness="commitAutoBrightness" />
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

:deep(.control-block) {
    position: relative;
    display: flex;
    flex-direction: column;

}

:deep(.control-block + .control-block) {
    padding-top: 18px;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
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

.clock-picker .scroller-row {
    display: flex;
    gap: 2px;
    justify-content: center;
    height: 100%;
    -webkit-tap-highlight-color: transparent;
}

.clock-picker :deep(.scroller) {
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

</style>
