<script setup>
const props = defineProps({
  modelValue: {
    type: Object,
    required: true
  },
  sensorOptions: {
    type: Array,
    required: true
  }
})

function lock(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function toggleEnabled() {
  props.modelValue.enabled = !props.modelValue.enabled
}
</script>

<template>
  <div>
    <div class="toggle-row">
      <div>
        <p>Включить автояркость</p>
        <small>Связывает яркость ламп с уровнем освещенности</small>
      </div>
      <button type="button" class="toggle" :class="{ active: modelValue.enabled }" @click="toggleEnabled">
        <span />
      </button>
    </div>
    <template v-if="modelValue.enabled">
      <label class="field">
        Датчик освещенности
        <select v-model="modelValue.sensorId">
          <option v-for="sensor in sensorOptions" :key="sensor.id" :value="sensor.id">
            {{ sensor.name }}
          </option>
        </select>
      </label>
      <div class="range-pair">
        <label class="field">
          Минимум, лк
          <input
            type="number"
            min="0"
            :max="modelValue.luxMax - 10"
            v-model.number="modelValue.luxMin"
            @change="modelValue.luxMin = lock(modelValue.luxMin, 0, modelValue.luxMax - 10)"
          />
        </label>
        <label class="field">
          Максимум, лк
          <input
            type="number"
            :min="modelValue.luxMin + 10"
            v-model.number="modelValue.luxMax"
            @change="modelValue.luxMax = lock(modelValue.luxMax, modelValue.luxMin + 10, 1000)"
          />
        </label>
      </div>
      <div class="range-pair">
        <label class="field">
          Яркость при мин.
          <input
            type="number"
            min="0"
            :max="modelValue.brightnessMax"
            v-model.number="modelValue.brightnessMin"
            @change="modelValue.brightnessMin = lock(modelValue.brightnessMin, 0, modelValue.brightnessMax)"
          />
        </label>
        <label class="field">
          Яркость при макс.
          <input
            type="number"
            :min="Math.max(modelValue.brightnessMin, 0)"
            max="100"
            v-model.number="modelValue.brightnessMax"
            @change="modelValue.brightnessMax = lock(modelValue.brightnessMax, Math.max(modelValue.brightnessMin, 0), 100)"
          />
        </label>
      </div>
    </template>
  </div>
</template>

<style scoped>
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-row p {
  margin: 0;
  font-weight: 600;
}

.toggle-row small {
  color: #94a3b8;
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

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field input,
.field select {
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: inherit;
  border-radius: 10px;
  padding: 8px 10px;
}

.range-pair {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

@media (max-width: 640px) {
  .range-pair {
    flex-direction: column;
  }
}
</style>
