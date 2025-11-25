<script setup>
const props = defineProps({
  startSummary: {
    type: Object,
    required: true
  },
  endSummary: {
    type: Object,
    required: true
  },
  autoBrightnessActive: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['open-start', 'open-end'])

const iconStyle = (summary) => {
  if (!summary?.hasColor) return {}
  const color = summary.colorHex
  if (!color) return {}
  return { background: color, '--state-icon-color': color }
}
</script>

<template>
  <ul class="stop-preview">
    <li>
<button type="button" class="state-card" @click="emit('open-start')">
        <div class="state-icon"
          :class="{
            empty: !props.startSummary.hasColor,
            'auto-active': props.autoBrightnessActive,
            'color-active': props.autoBrightnessActive && props.startSummary.hasColor
          }"
          :style="iconStyle(props.startSummary)"></div>
        <div class="state-body">
          <p class="state-label">Старт</p>
          <p class="state-row">
            <template v-if="props.startSummary.values.length">
              <span v-for="value in props.startSummary.values" :key="value" class="state-value">{{ value }}</span>
            </template>
            <span v-else class="state-placeholder">{{ props.startSummary.placeholder }}</span>
          </p>
        </div>
        <span class="chevron">›</span>
      </button>
    </li>
    <li>
<button type="button" class="state-card" @click="emit('open-end')">
        <div class="state-icon"
          :class="{
            empty: !props.endSummary.hasColor,
            'auto-active': props.autoBrightnessActive,
            'color-active': props.autoBrightnessActive && props.endSummary.hasColor
          }"
          :style="iconStyle(props.endSummary)"></div>
        <div class="state-body">
          <p class="state-label">Финиш</p>
          <p class="state-row">
            <template v-if="props.endSummary.values.length">
              <span v-for="value in props.endSummary.values" :key="value" class="state-value">{{ value }}</span>
            </template>
            <span v-else class="state-placeholder">{{ props.endSummary.placeholder }}</span>
          </p>
        </div>
        <span class="chevron">›</span>
      </button>
    </li>
  </ul>
</template>

<style scoped>
.stop-preview {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.state-card {
  width: 100%;
  border: none;
  background: #0c1424;
  border-radius: 18px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: inherit;
}

.state-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.25);
}

.state-icon.color-active {
  animation: icon-color-pulse 2.4s ease-in-out infinite;
  box-shadow: 0 0 12px var(--state-icon-color, #94a3b8);
}

.state-card.auto-active .state-icon {
  background: var(--state-icon-color, #f8fafc);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.45), 0 0 10px rgba(194, 181, 255, 0.5);
}

.state-icon.empty {
  background: transparent;
  box-shadow: inset 0 0 0 2px rgba(148, 163, 184, 0.6);
}

.state-icon.auto-active {
  animation: icon-auto-pulse 3.6s ease-in-out infinite;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8), 0 0 8px rgba(79, 70, 229, 0.4);
}

@keyframes icon-auto-pulse {
  0% {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8), 0 0 10px rgba(79, 70, 229, 0.5);
  }
  50% {
    box-shadow: inset 0 0 0 2px rgba(148, 163, 184, 0.6), 0 0 4px rgba(79, 70, 229, 0.2);
  }
  100% {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8), 0 0 10px rgba(79, 70, 229, 0.5);
  }
}

@keyframes icon-color-pulse {
  0% {
    box-shadow: 0 0 6px var(--state-icon-color, #94a3b8);
  }
  50% {
    box-shadow: 0 0 18px var(--state-icon-color, #94a3b8);
  }
  100% {
    box-shadow: 0 0 6px var(--state-icon-color, #94a3b8);
  }
}

.state-label {
  margin: 0;
  font-weight: 600;
  color: #e5e7eb;
  text-align: left;
  font-size: 15px;
}

.state-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.state-row {
  margin: 0;
  display: flex;
  gap: 10px;
  align-items: center;
}

.state-value {
  color: #cbd5e1;
  font-size: 14px;
}

.state-placeholder {
  color: #475569;
  font-size: 14px;
}

.chevron {
  margin-left: auto;
  color: #475569;
  font-weight: 600;
}

@keyframes preview-auto-pulse {
  0% {
    transform: translateY(0);
    opacity: 1;
  }
  50% {
    transform: translateY(-2px);
    opacity: 0.85;
  }
  100% {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
