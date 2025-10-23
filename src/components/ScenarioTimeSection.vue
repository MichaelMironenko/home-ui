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
const updateStartOffset = (value) => emitValue({ start: { offsetMin: clampOffset(value) } })
const updateEndOffset = (value) => emitValue({ end: { offsetMin: clampOffset(value) } })

const toggleDay = (day, checked) => {
  const set = new Set(normalizeDays(props.modelValue?.days))
  const numericDay = Number(day)
  if (checked) set.add(numericDay)
  else set.delete(numericDay)
  if (!set.size) set.add(numericDay)
  emitValue({ days: Array.from(set) })
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
          <button
            type="button"
            :class="['mode-chip', { active: modelValue.start?.type !== 'sun' }]"
            @click="setStartClock"
          >
            Время
          </button>
          <button
            type="button"
            :class="['mode-chip', { active: modelValue.start?.type === 'sun' && modelValue.start?.anchor !== 'sunset' }]"
            @click="setStartSun('sunrise')"
          >
            Рассвет
          </button>
          <button
            type="button"
            :class="['mode-chip', { active: modelValue.start?.type === 'sun' && modelValue.start?.anchor === 'sunset' }]"
            @click="setStartSun('sunset')"
          >
            Закат
          </button>
        </div>

        <div v-if="modelValue.start?.type !== 'sun'" class="field">
          <label>Время</label>
          <input
            type="time"
            step="60"
            :value="modelValue.start?.time || '18:00'"
            @input="updateStartTime($event.target.value)"
          />
        </div>

        <div v-else class="field">
          <label>Смещение (мин)</label>
          <div class="offset">
            <input
              type="number"
              :value="modelValue.start?.offsetMin ?? 0"
              @input="updateStartOffset($event.target.value)"
            />
            <span>{{ modelValue.start?.anchor === 'sunrise' ? 'от рассвета' : 'от заката' }}</span>
          </div>
        </div>
      </fieldset>

      <fieldset class="slot">
        <legend>Финиш</legend>
        <div class="mode-switch">
          <button
            type="button"
            :class="['mode-chip', { active: modelValue.end?.type !== 'sun' }]"
            @click="setEndClock"
          >
            Время
          </button>
          <button
            type="button"
            :class="['mode-chip', { active: modelValue.end?.type === 'sun' && modelValue.end?.anchor !== 'sunset' }]"
            @click="setEndSun('sunrise')"
          >
            Рассвет
          </button>
          <button
            type="button"
            :class="['mode-chip', { active: modelValue.end?.type === 'sun' && modelValue.end?.anchor === 'sunset' }]"
            @click="setEndSun('sunset')"
          >
            Закат
          </button>
        </div>

        <div v-if="modelValue.end?.type !== 'sun'" class="field">
          <label>Время</label>
          <input
            type="time"
            step="60"
            :value="modelValue.end?.time || '23:00'"
            @input="updateEndTime($event.target.value)"
          />
        </div>

        <div v-else class="field">
          <label>Смещение (мин)</label>
          <div class="offset">
            <input
              type="number"
              :value="modelValue.end?.offsetMin ?? 0"
              @input="updateEndOffset($event.target.value)"
            />
            <span>{{ modelValue.end?.anchor === 'sunrise' ? 'от рассвета' : 'от заката' }}</span>
          </div>
        </div>
      </fieldset>
    </div>

    <div class="days">
      <span class="days__label">Дни недели</span>
      <div class="days__set">
        <label
          v-for="day in DAY_OPTIONS"
          :key="day.value"
          class="day"
        >
          <input
            type="checkbox"
            :value="day.value"
            :checked="normalizeDays(modelValue.days).includes(Number(day.value))"
            @change="toggleDay(day.value, $event.target.checked)"
          />
          <span>{{ day.label }}</span>
        </label>
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

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #cbd5f5;
}

input[type='time'],
input[type='number'] {
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

.offset {
  display: flex;
  gap: 8px;
  align-items: center;
}

.offset span {
  font-size: 12px;
  color: #94a3b8;
}

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

.day input:checked + span {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(124, 58, 237, 0.85));
  border-color: rgba(59, 130, 246, 0.6);
  color: #fff;
}
</style>
