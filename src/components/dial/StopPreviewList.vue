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

import { computePreviewIconStyle } from '../../utils/previewIcon'

const iconStyle = (summary, autoActive) => computePreviewIconStyle(summary, autoActive)
</script>

<template>
  <ul class="stop-preview">
    <li>
<button type="button" class="state-card" @click="emit('open-start')">
        <div class="state-icon"
          :class="{
            empty: !props.startSummary.hasColor && !props.startSummary.hasBrightness,
            'auto-active': props.autoBrightnessActive && props.startSummary.hasBrightness,
            'auto-color': props.autoBrightnessActive && props.startSummary.hasColor,
            'color-active': !props.autoBrightnessActive && props.startSummary.hasColor
          }"
          :style="iconStyle(props.startSummary, props.autoBrightnessActive)"></div>
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
            empty: !props.endSummary.hasColor && !props.endSummary.hasBrightness,
            'auto-active': props.autoBrightnessActive && props.endSummary.hasBrightness,
            'auto-color': props.autoBrightnessActive && props.endSummary.hasColor,
            'color-active': !props.autoBrightnessActive && props.endSummary.hasColor
          }"
          :style="iconStyle(props.endSummary, props.autoBrightnessActive)"></div>
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
  background: var(--state-icon-bg, rgba(255, 255, 255, 0.14));
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.25);
}

.state-icon.empty {
  background: transparent;
  box-shadow: inset 0 0 0 2px rgba(148, 163, 184, 0.6);
}

.state-icon.auto-active {
  animation: icon-auto-brightness 4.5s ease-in-out infinite;
  background: var(--state-icon-bg, rgba(255, 255, 255, 0.8));
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.8), 0 0 8px rgba(79, 70, 229, 0.4);
}

.state-icon.auto-active.auto-color {
  animation: icon-auto-color 4.5s ease-in-out infinite;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 8px rgba(79, 70, 229, 0.4);
}

@keyframes icon-auto-brightness {
  0% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.85;
  }
  100% {
    opacity: 0.3;
  }
}

@keyframes icon-auto-color {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
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
  font-weight: 400;
  font-size: 30px;
  line-height: 1;
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
