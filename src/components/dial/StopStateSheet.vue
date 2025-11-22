<script setup>
const props = defineProps({
  stop: {
    type: Object,
    required: true
  },
  palette: {
    type: Array,
    required: true
  }
})

function toggle(prop) {
  props.stop[prop] = !props.stop[prop]
}

function setColorMode(mode) {
  props.stop.colorMode = mode
}

function updateTemperature(value) {
  const numeric = Math.round(Number(value) || 0)
  props.stop.temperature = Math.max(2000, Math.min(6500, numeric))
}

function updateBrightness(value) {
  const numeric = Math.round(Number(value) || 0)
  props.stop.brightness = Math.max(1, Math.min(100, numeric))
}
</script>

<template>
  <div class="stop-editor">
    <div class="toggle-row">
      <div>
        <p>Изменять цвет</p>
        <small>Отключите, если нужен только диммирование</small>
      </div>
      <button type="button" class="toggle" :class="{ active: stop.useColor }" @click="toggle('useColor')">
        <span />
      </button>
    </div>

    <div v-if="stop.useColor" class="color-mode">
      <div class="segmented">
        <button type="button" :class="{ active: stop.colorMode === 'temperature' }" @click="setColorMode('temperature')">
          Температура
        </button>
        <button type="button" :class="{ active: stop.colorMode === 'rgb' }" @click="setColorMode('rgb')">Цвет</button>
      </div>

      <div v-if="stop.colorMode === 'temperature'" class="slider-block">
        <label>
          {{ stop.temperature }}K
          <input type="range" min="2000" max="6500" step="100" :value="stop.temperature" @input="updateTemperature($event.target.value)" />
        </label>
      </div>
      <div v-else class="palette">
        <button
          v-for="color in palette"
          :key="color"
          type="button"
          class="swatch"
          :class="{ active: stop.colorHex === color }"
          :style="{ background: color }"
          @click="stop.colorHex = color"
        />
        <label class="custom-color">
          <input type="color" :value="stop.colorHex" @input="stop.colorHex = $event.target.value" />
          <span>{{ stop.colorHex?.toUpperCase?.() }}</span>
        </label>
      </div>
    </div>

    <div class="toggle-row">
      <div>
        <p>Изменять яркость</p>
      </div>
      <button type="button" class="toggle" :class="{ active: stop.useBrightness }" @click="toggle('useBrightness')">
        <span />
      </button>
    </div>
    <div v-if="stop.useBrightness" class="slider-block">
      <label>
        {{ stop.brightness }}%
        <input type="range" min="1" max="100" :value="stop.brightness" @input="updateBrightness($event.target.value)" />
      </label>
    </div>
  </div>
</template>

<style scoped>
.stop-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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

.color-mode {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
</style>
