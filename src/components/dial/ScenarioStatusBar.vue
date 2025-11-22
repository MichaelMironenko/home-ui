<script setup>
const props = defineProps({
  status: {
    type: String,
    required: true
  },
  options: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['update:status'])

function setStatus(value) {
  if (props.status === value) return
  emit('update:status', value)
}
</script>

<template>
  <div class="status-row">
    <div class="status-chip" :class="status">
      {{ options.find((opt) => opt.id === status)?.label }}
    </div>
    <div class="status-toggle">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="status-toggle-btn"
        :class="{ active: status === option.id }"
        @click="setStatus(option.id)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.status-chip {
  padding: 6px 14px;
  border-radius: 999px;
  font-weight: 600;
  background: #10b981;
  color: #062b1f;
}

.status-chip.paused {
  background: #fbbf24;
  color: #3b2601;
}

.status-chip.off {
  background: #475569;
  color: #f8fafc;
}

.status-toggle {
  display: flex;
  gap: 6px;
  background: #121827;
  padding: 4px;
  border-radius: 999px;
}

.status-toggle-btn {
  border: none;
  background: transparent;
  color: #94a3b8;
  padding: 6px 12px;
  border-radius: 999px;
  font-weight: 600;
}

.status-toggle-btn.active {
  background: #6366f1;
  color: white;
}
</style>
