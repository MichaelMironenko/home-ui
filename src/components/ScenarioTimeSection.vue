<script setup>
const props = defineProps({
    modelValue: {
        type: Object,
        required: true
    }
})

const emit = defineEmits(['update:modelValue'])

const DAY_OPTIONS = Object.freeze([
    { value: '1', label: 'Пн' },
    { value: '2', label: 'Вт' },
    { value: '3', label: 'Ср' },
    { value: '4', label: 'Чт' },
    { value: '5', label: 'Пт' },
    { value: '6', label: 'Сб' },
    { value: '7', label: 'Вс' }
])

const clampOffset = (value) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return 0
    // Общая защита — оставил ±720 как было,
    // а сам ползунок ограничен ±60
    return Math.max(Math.min(num, 720), -720)
}

const normalizeTime = (block = {}, fallback = '18:00') => {
    if (block?.type === 'sun') {
        return {
            type: 'sun',
            anchor: block.anchor === 'sunset' ? 'sunset' : 'sunrise',
            offsetMin: Number.isFinite(block.offsetMin) ? block.offsetMin : 0
        }
    }
    return {
        type: 'clock',
        time: block?.time || fallback
    }
}

const normalizeDays = (days) => {
    const list = Array.isArray(days) ? days : [1, 2, 3, 4, 5, 6, 7]
    return Array.from(
        new Set(
            list
                .map((d) => Number(d))
                .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
        )
    ).sort((a, b) => a - b)
}

const emitValue = (patch) => {
    let start = normalizeTime(props.modelValue?.start, '18:00')
    let end = normalizeTime(props.modelValue?.end, '23:00')
    let days = normalizeDays(props.modelValue?.days)

    if (patch.start) start = normalizeTime({ ...start, ...patch.start }, start.type === 'clock' ? start.time : '18:00')
    if (patch.end) end = normalizeTime({ ...end, ...patch.end }, end.type === 'clock' ? end.time : '23:00')
    if (patch.days) days = normalizeDays(patch.days)

    emit('update:modelValue', {
        tz: props.modelValue?.tz,
        lat: props.modelValue?.lat,
        lon: props.modelValue?.lon,
        start,
        end,
        days
    })
}

const setStartClock = () => {
    const current = normalizeTime(props.modelValue?.start, '18:00')
    emitValue({ start: { type: 'clock', time: current.type === 'clock' ? current.time : '18:00' } })
}

const setStartSun = (anchor) => {
    const current = normalizeTime(props.modelValue?.start, '18:00')
    const offset = current.type === 'sun' ? current.offsetMin : 0
    emitValue({ start: { type: 'sun', anchor, offsetMin: offset } })
}

const setEndClock = () => {
    const current = normalizeTime(props.modelValue?.end, '23:00')
    emitValue({ end: { type: 'clock', time: current.type === 'clock' ? current.time : '23:00' } })
}

const setEndSun = (anchor) => {
    const current = normalizeTime(props.modelValue?.end, '23:00')
    const offset = current.type === 'sun' ? current.offsetMin : 0
    emitValue({ end: { type: 'sun', anchor, offsetMin: offset } })
}

const updateStartTime = (value) => emitValue({ start: { type: 'clock', time: value || '18:00' } })
const updateEndTime = (value) => emitValue({ end: { type: 'clock', time: value || '23:00' } })
const updateStartOffset = (value) => {
    // Ползунок ограничен ±60; на всякий — ещё раз обрежем
    const v = Math.max(Math.min(Number(value), 60), -60)
    emitValue({ start: { offsetMin: clampOffset(v) } })
}
const updateEndOffset = (value) => {
    const v = Math.max(Math.min(Number(value), 60), -60)
    emitValue({ end: { offsetMin: clampOffset(v) } })
}

const toggleDay = (day, checked) => {
    const set = new Set(normalizeDays(props.modelValue?.days))
    const numericDay = Number(day)
    if (checked) set.add(numericDay)
    else set.delete(numericDay)
    if (!set.size) set.add(numericDay)
    emitValue({ days: Array.from(set) })
}

// Вспомогательное форматирование подписей ползунка
const formatOffset = (min) => {
    const n = Number(min) || 0
    if (n === 0) return 'без смещения'
    const sign = n > 0 ? '+' : '–'
    const abs = Math.abs(n)
    const h = Math.floor(abs / 60)
    const m = abs % 60
    if (h && m) return `${sign}${h}ч ${m}мин`
    if (h) return `${sign}${h}ч`
    return `${sign}${m}мин`
}

const formatHMin = (min) => {
    const n = Math.abs(Number(min) || 0)
    const h = Math.floor(n / 60)
    const m = n % 60
    if (h && m) return `${h}ч ${m}мин`
    if (h) return `${h}ч`
    return `${m}мин`
}

const formatOffsetFinal = (anchor, offsetMin = 0) => {
    const a = anchor === 'sunset' ? 'заката' : 'рассвета'
    if (!offsetMin) return anchor === 'sunset' ? 'На закате' : 'На рассвете'
    const dir = offsetMin > 0 ? 'Через' : 'За'
    return `${dir} ${formatHMin(offsetMin)} ${offsetMin > 0 ? 'после' : 'до'} ${a}`
}

</script>

<template>
    <section class="blk">
        <header class="blk__header">
            <h2>Окно времени</h2>
            <p class="blk__hint">Рассвет и закат рассчитываются для фиксированной локации Europe/Moscow.</p>
        </header>

        <div class="time-grid">
            <fieldset class="slot">
                <legend>Старт</legend>
                <div class="mode-switch">
                    <button type="button" :class="['mode-chip', { active: modelValue.start?.type !== 'sun' }]"
                        @click="setStartClock">
                        Время
                    </button>
                    <button type="button"
                        :class="['mode-chip', { active: modelValue.start?.type === 'sun' && modelValue.start?.anchor !== 'sunset' }]"
                        @click="setStartSun('sunrise')">
                        Рассвет
                    </button>
                    <button type="button"
                        :class="['mode-chip', { active: modelValue.start?.type === 'sun' && modelValue.start?.anchor === 'sunset' }]"
                        @click="setStartSun('sunset')">
                        Закат
                    </button>
                </div>

                <div v-if="modelValue.start?.type !== 'sun'" class="field">
                    <label>Время</label>
                    <input type="time" step="60" :value="modelValue.start?.time || '18:00'"
                        @input="updateStartTime($event.target.value)" />
                </div>

                <div v-else class="field">
                    <!-- Итоговая строка вместо "Смещение" -->
                    <div class="offset-final">
                        {{ formatOffsetFinal(modelValue.start?.anchor, modelValue.start?.offsetMin ?? 0) }}
                    </div>

                    <div class="offset-slider">
                        <div class="offset-slider__track">
                            <span class="tick left"></span>
                            <span class="tick center"></span>
                            <span class="tick right"></span>

                            <input type="range" min="-60" max="60" step="5"
                                :value="Math.max(Math.min(modelValue.start?.offsetMin ?? 0, 60), -60)"
                                @input="updateStartOffset($event.target.value)" :class="[
                                    'range-track',
                                    modelValue.start?.anchor === 'sunrise' ? 'sunrise-track' : 'sunset-track'
                                ]"
                                :aria-label="`Смещение относительно ${modelValue.start?.anchor === 'sunrise' ? 'рассвета' : 'заката'}`" />
                        </div>

                        <!-- Подписи снизу -->
                        <div class="offset-slider__labels below">
                            <span>−1ч</span>
                            <span class="center">{{ modelValue.start?.anchor === 'sunrise' ? 'Рассвет' : 'Закат'
                                }}</span>
                            <span>+1ч</span>
                        </div>
                    </div>
                </div>
            </fieldset>

            <fieldset class="slot">
                <legend>Финиш</legend>
                <div class="mode-switch">
                    <button type="button" :class="['mode-chip', { active: modelValue.end?.type !== 'sun' }]"
                        @click="setEndClock">
                        Время
                    </button>
                    <button type="button"
                        :class="['mode-chip', { active: modelValue.end?.type === 'sun' && modelValue.end?.anchor !== 'sunset' }]"
                        @click="setEndSun('sunrise')">
                        Рассвет
                    </button>
                    <button type="button"
                        :class="['mode-chip', { active: modelValue.end?.type === 'sun' && modelValue.end?.anchor === 'sunset' }]"
                        @click="setEndSun('sunset')">
                        Закат
                    </button>
                </div>

                <div v-if="modelValue.end?.type !== 'sun'" class="field">
                    <label>Время</label>
                    <input type="time" step="60" :value="modelValue.end?.time || '23:00'"
                        @input="updateEndTime($event.target.value)" />
                </div>

                <div v-else class="field">
                    <div class="offset-final">
                        {{ formatOffsetFinal(modelValue.end?.anchor, modelValue.end?.offsetMin ?? 0) }}
                    </div>

                    <div class="offset-slider">
                        <div class="offset-slider__track">
                            <span class="tick left"></span>
                            <span class="tick center"></span>
                            <span class="tick right"></span>

                            <input type="range" min="-60" max="60" step="5"
                                :value="Math.max(Math.min(modelValue.end?.offsetMin ?? 0, 60), -60)"
                                @input="updateEndOffset($event.target.value)" :class="[
                                    'range-track',
                                    modelValue.end?.anchor === 'sunrise' ? 'sunrise-track' : 'sunset-track'
                                ]"
                                :aria-label="`Смещение относительно ${modelValue.end?.anchor === 'sunrise' ? 'рассвета' : 'заката'}`" />
                        </div>

                        <div class="offset-slider__labels below">
                            <span>−1ч</span>
                            <span class="center">{{ modelValue.end?.anchor === 'sunrise' ? 'Рассвет' : 'Закат' }}</span>
                            <span>+1ч</span>
                        </div>
                    </div>
                </div>
            </fieldset>
        </div>

        <div class="days">
            <span class="days__label">Дни недели</span>
            <div class="days__set">
                <label v-for="day in DAY_OPTIONS" :key="day.value" class="day">
                    <input type="checkbox" :value="day.value"
                        :checked="normalizeDays(modelValue.days).includes(Number(day.value))"
                        @change="toggleDay(day.value, $event.target.checked)" />
                    <span>{{ day.label }}</span>
                </label>
            </div>
        </div>
    </section>
</template>

<style scoped>
/* Контейнер и заголовок */
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
    flex-direction: column;
    gap: 6px;
}

.blk__header h2 {
    margin: 0;
    font-size: 18px;
    color: #e5e7eb;
}

.blk__hint {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
}

/* Сетка времени */
.time-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.slot {
    border: 1px solid rgba(55, 65, 81, 0.6);
    border-radius: 14px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.slot legend {
    font-size: 14px;
    color: #cbd5f5;
    padding: 0 6px;
}

/* Переключатели режима */
.mode-switch {
    display: inline-flex;
    gap: 8px;
}

.mode-chip {
    border: 1px solid rgba(59, 130, 246, 0.4);
    background: rgba(17, 24, 39, 0.75);
    color: #bfdbfe;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.mode-chip.active {
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(124, 58, 237, 0.85));
    border-color: rgba(59, 130, 246, 0.6);
    color: #fff;
}

/* Поля */
.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: #cbd5f5;
}

input[type='time'] {
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid #4b5563;
    background: #111827;
    color: #f9fafb;
    width: 110px;
}

input:focus {
    outline: none;
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
}

/* Итоговая строка */
.offset-final {
    font-size: 13px;
    color: #cbd5f5;
    padding-bottom: 4px;
    text-align: center;
}

/* ── Ползунок смещения ───────────────────────── */

.offset-slider {
    display: grid;
    gap: 6px;
}

.offset-slider__track {
    position: relative;
    padding: 0;
    /* убраны паддинги */
}

/* сам range */
.range-track {
    -webkit-appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 999px;
    outline: none;
    /* Allow vertical page scroll even when gesture starts on the slider */
    touch-action: pan-y;
    background: transparent;
}

/* Градиенты рассвет / закат */
.sunrise-track {
    background: linear-gradient(90deg, #0a0943 0%, #ddbf78 50%, #93c5fd 100%);
}

.sunset-track {
    background: linear-gradient(90deg, #93c5fd 0%, #ddbf78 50%, #0a0943 100%);
}

/* Thumb WebKit */
.range-track::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #3b82f6;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.range-track::-webkit-slider-runnable-track {
    height: 6px;
    background: transparent;
}

/* Thumb Firefox */
.range-track::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #3b82f6;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.range-track::-moz-range-track {
    height: 6px;
    background: transparent;
}

/* Подписи под шкалой */
.offset-slider__labels.below {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: #94a3b8;
    margin-top: 4px;
}

.offset-slider__labels .center {
    flex: 0 0 auto;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px dashed rgba(148, 163, 184, 0.5);
    color: #cbd5f5;
}

/* Дни недели */
.days {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.days__label {
    font-size: 12px;
    color: #94a3b8;
}

.days__set {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.day {
    position: relative;
}

.day input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
}

.day span {
    display: inline-flex;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(59, 130, 246, 0.4);
    background: rgba(17, 24, 39, 0.75);
    color: #bfdbfe;
    font-size: 12px;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.day input:checked+span {
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(124, 58, 237, 0.85));
    border-color: rgba(59, 130, 246, 0.6);
    color: #fff;
}
</style>
