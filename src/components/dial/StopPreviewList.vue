<script setup>
defineProps({
  startSummary: {
    type: Object,
    required: true
  },
  endSummary: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['open-start', 'open-end'])
</script>

<template>
  <ul class="stop-preview">
    <li>
      <button type="button" class="state-card" @click="emit('open-start')">
        <div class="state-icon start">🟠</div>
        <div>
          <p class="state-label">Старт</p>
          <p class="state-value">{{ startSummary.color }}</p>
          <p class="state-value">Яркость {{ startSummary.brightness }}</p>
        </div>
        <span class="chevron">›</span>
      </button>
    </li>
    <li>
      <button type="button" class="state-card" @click="emit('open-end')">
        <div class="state-icon end">🔵</div>
        <div>
          <p class="state-label">Финиш</p>
          <p class="state-value">{{ endSummary.color }}</p>
          <p class="state-value">Яркость {{ endSummary.brightness }}</p>
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
  font-size: 22px;
  background: rgba(255, 255, 255, 0.08);
}

.state-label {
  margin: 0;
  font-weight: 600;
}

.state-value {
  margin: 2px 0 0;
  color: #94a3b8;
  font-size: 14px;
}

.chevron {
  margin-left: auto;
  color: #475569;
  font-weight: 600;
}
</style>
