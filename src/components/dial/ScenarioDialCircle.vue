<script setup>
import { computed } from 'vue'

const props = defineProps({
  dialRef: {
    type: [Function, Object],
    default: null
  },
  dialMetrics: {
    type: Object,
    required: true
  },
  dayNightGradient: {
    type: String,
    required: true
  },
  scenarioArc: {
    type: String,
    required: true
  },
  scenarioArcColor: {
    type: String,
    required: true
  },
  scenarioArcWidth: {
    type: Number,
    default: 32
  },
  baseRingWidth: {
    type: Number,
    default: 40
  },
  tickMarks: {
    type: Array,
    required: true
  },
  hourNumberItems: {
    type: Array,
    required: true
  },
  sunIconCoord: {
    type: Object,
    required: true
  },
  moonIconCoord: {
    type: Object,
    required: true
  },
  startLabel: {
    type: String,
    required: true
  },
  endLabel: {
    type: String,
    required: true
  },
  startHandleStyle: {
    type: Object,
    required: true
  },
  endHandleStyle: {
    type: Object,
    required: true
  },
  showStartOffset: {
    type: Boolean,
    default: false
  },
  startOffsetStyle: {
    type: Object,
    default: () => ({})
  },
  showEndOffset: {
    type: Boolean,
    default: false
  },
  endOffsetStyle: {
    type: Object,
    default: () => ({})
  },
  gradientStartColor: {
    type: String,
    required: true
  },
  gradientEndColor: {
    type: String,
    required: true
  },
  gradientCoords: {
    type: Object,
    default: null
  },
  offsetArcs: {
    type: Array,
    default: () => []
  },
  offsetArcWidth: {
    type: Number,
    default: 10
  },
  ringRadius: {
    type: Number,
    default: null
  },
  arcRadius: {
    type: Number,
    default: null
  },
  offsetArcRadius: {
    type: Number,
    default: null
  },
  offsetLabels: {
    type: Array,
    default: () => []
  },
  dialFaceRatio: {
    type: Number,
    default: 0.62
  },
  sunriseMarker: {
    type: Object,
    required: true
  },
  sunsetMarker: {
    type: Object,
    required: true
  }
})

const emit = defineEmits([
  'open-start-editor',
  'open-end-editor',
  'pointer-move',
  'pointer-up',
  'pointer-cancel',
  'pointer-leave',
  'start-pointerdown',
  'end-pointerdown',
  'start-offset-pointerdown',
  'end-offset-pointerdown'
])

const dialViewBox = computed(() => {
  const size = Number(props.dialMetrics?.size) || 0
  const fallback = size > 0 ? size : 320
  return `0 0 ${fallback} ${fallback}`
})

const gradientVector = computed(() => {
  const start = props.gradientCoords?.start
  const end = props.gradientCoords?.end
  const radius = Number(props.dialMetrics?.radius) || 0
  const fallbackRadius = radius > 0 ? radius : 160
  const fallback = {
    start: { x: fallbackRadius, y: fallbackRadius },
    end: { x: fallbackRadius, y: Math.max(fallbackRadius - 100, 0) }
  }
  if (start && end && Number.isFinite(start.x) && Number.isFinite(start.y) && Number.isFinite(end.x) && Number.isFinite(end.y)) {
    return { start, end }
  }
  return fallback
})
</script>

<template>
  <section class="dial-section">
    <div class="time-header">
      <button type="button" class="time-chip start" @click="emit('open-start-editor')">
        <span>Старт</span>
        <strong>{{ startLabel }}</strong>
      </button>
      <button type="button" class="time-chip end" @click="emit('open-end-editor')">
        <span>Финиш</span>
        <strong>{{ endLabel }}</strong>
      </button>
    </div>

    <div
      :ref="dialRef"
      class="dial"
      :style="{ '--dial-face-ratio': dialFaceRatio }"
      @pointermove="(event) => emit('pointer-move', event)"
      @pointerup="(event) => emit('pointer-up', event)"
      @pointercancel="(event) => emit('pointer-cancel', event)"
      @pointerleave="(event) => emit('pointer-leave', event)"
    >
      <svg class="dial-ring-svg" width="100%" height="100%" :viewBox="dialViewBox" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient
            id="dialGradient"
            gradientUnits="userSpaceOnUse"
            :x1="gradientVector.start.x"
            :y1="gradientVector.start.y"
            :x2="gradientVector.end.x"
            :y2="gradientVector.end.y"
          >
            <stop offset="0%" :stop-color="gradientStartColor" />
            <stop offset="100%" :stop-color="gradientEndColor" />
          </linearGradient>
        </defs>
        <circle
          class="dial-ring-base"
          :cx="dialMetrics.radius"
          :cy="dialMetrics.radius"
          :r="ringRadius ?? dialMetrics.radius - 24"
          :style="{ strokeWidth: `${baseRingWidth}px` }"
        />
        <path
          v-for="arc in offsetArcs"
          :key="arc.key"
          class="offset-arc-path"
          :d="arc.path"
          :style="{ strokeWidth: `${offsetArcWidth}px` }"
        />
        <path
          class="dial-arc"
          :d="scenarioArc"
          :style="{ stroke: scenarioArcColor, strokeWidth: `${scenarioArcWidth}px` }"
        />
        <text
          v-for="label in offsetLabels"
          :key="label.key"
          class="offset-label"
          :x="label.x"
          :y="label.y"
        >
          {{ label.text }}
        </text>
      </svg>

      <div class="dial-face">
        <div class="day-night-layer" :style="{ background: dayNightGradient }" />
        <svg viewBox="0 0 200 200" class="dial-face-svg">
          <circle class="dial-face-bg" cx="100" cy="100" r="86" />
          <g class="tick-group">
            <line v-for="tick in tickMarks" :key="tick.index" :class="{ major: tick.major }" :x1="tick.x1" :y1="tick.y1" :x2="tick.x2" :y2="tick.y2" />
          </g>
          <g class="hour-number-group">
            <text v-for="item in hourNumberItems" :key="item.hour" :x="item.x" :y="item.y">
              {{ item.hour }}
            </text>
          </g>
          <text class="face-symbol" :x="sunIconCoord.x" :y="sunIconCoord.y">☀️</text>
          <text class="face-symbol" :x="moonIconCoord.x" :y="moonIconCoord.y">🌙</text>
          <circle class="sunrise-dot" :cx="sunriseMarker.x" :cy="sunriseMarker.y" r="4" />
          <circle class="sunset-dot" :cx="sunsetMarker.x" :cy="sunsetMarker.y" r="4" />
        </svg>
      </div>

      <button class="dial-handle start" :style="startHandleStyle" @pointerdown="(event) => emit('start-pointerdown', event)" />
      <button class="dial-handle end" :style="endHandleStyle" @pointerdown="(event) => emit('end-pointerdown', event)" />

      <button
        v-if="showStartOffset"
        class="offset-handle"
        :style="startOffsetStyle"
        @pointerdown="(event) => emit('start-offset-pointerdown', event)"
      >
        ±
      </button>
      <button
        v-if="showEndOffset"
        class="offset-handle dusk"
        :style="endOffsetStyle"
        @pointerdown="(event) => emit('end-offset-pointerdown', event)"
      >
        ±
      </button>
    </div>
  </section>
</template>

<style scoped>
.dial-section {
  background: #0b1220;
  border-radius: 28px;
  padding: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
}

.time-header {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.time-chip {
  border: none;
  background: #101931;
  color: inherit;
  border-radius: 16px;
  padding: 10px;
  text-align: left;
}

.time-chip span {
  display: block;
  font-size: 12px;
  color: #a5b4fc;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.time-chip strong {
  display: block;
  margin-top: 4px;
  font-size: 20px;
  font-weight: 600;
}

.dial {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  overflow: hidden;
  touch-action: none;
  background: radial-gradient(circle at 50% 50%, #0c101a 58%, #060708 100%);
}

.dial-ring-svg {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.dial-ring-base {
  fill: none;
  stroke: #0d1423;
}

.dial-arc {
  fill: none;
  stroke-linecap: round;
  filter: drop-shadow(0px 0px 10px rgba(99, 102, 241, 0.35));
}

.offset-arc-path {
  fill: none;
  stroke: rgba(148, 163, 184, 0.8);
  opacity: 0.8;
  stroke-linecap: round;
}

.offset-label {
  fill: #e2e8f0;
  font-size: 12px;
  text-anchor: middle;
  dominant-baseline: middle;
  font-weight: 600;
}

.dial-face {
  position: absolute;
  width: calc(var(--dial-face-ratio, 0.62) * 100%);
  height: calc(var(--dial-face-ratio, 0.62) * 100%);
  top: calc((1 - var(--dial-face-ratio, 0.62)) / 2 * 100%);
  left: calc((1 - var(--dial-face-ratio, 0.62)) / 2 * 100%);
  border-radius: 50%;
  background: radial-gradient(circle, #0f182c, #070b15 65%);
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.12);
  overflow: hidden;
}

.day-night-layer {
  position: absolute;
  inset: 0;
  opacity: 0.45;
}

.dial-face-svg {
  width: 100%;
  height: 100%;
  position: relative;
}

.dial-face-bg {
  fill: transparent;
}

.tick-group line {
  stroke: rgba(148, 163, 184, 0.5);
  stroke-width: 1.3;
}

.tick-group line.major {
  stroke-width: 1.2;
}

.hour-number-group text {
  font-size: 11px;
  fill: #d5def8;
  text-anchor: middle;
  dominant-baseline: middle;
  font-weight: 600;
}

.face-symbol {
  font-size: 16px;
  text-anchor: middle;
  dominant-baseline: middle;
}

.sunrise-dot,
.sunset-dot {
  stroke: #050915;
  stroke-width: 2;
}

.sunrise-dot {
  fill: #fbbf24;
}

.sunset-dot {
  fill: #fb7185;
}

.dial-handle {
  position: absolute;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid #08142a;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45);
  cursor: grab;
  z-index: 3;
  touch-action: none;
}

.offset-handle {
  position: absolute;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.5);
  background: rgba(16, 24, 39, 0.9);
  color: #fbbf24;
  z-index: 3;
  touch-action: none;
  font-size: 16px;
  font-weight: 700;
}

.offset-handle.dusk {
  color: #f97316;
}
</style>
