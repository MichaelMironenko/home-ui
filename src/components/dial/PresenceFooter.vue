<script setup>
const props = defineProps({
  options: {
    type: Array,
    required: true
  },
  value: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['update:value', 'save', 'delete'])

function select(value) {
  if (props.value === value) return
  emit('update:value', value)
}
</script>

<template>
  <section class="presence-section">
    <div class="presence-toggle">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="presence-btn"
        :class="{ active: value === option.id }"
        @click="select(option.id)"
      >
        {{ option.label }}
      </button>
    </div>
    <div class="action-row">
      <button type="button" class="ghost" @click="emit('delete')">Удалить</button>
      <button type="button" class="primary" @click="emit('save')">Сохранить</button>
    </div>
  </section>
</template>

<style scoped>
.presence-section {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.presence-toggle {
  background: #0b1220;
  border-radius: 999px;
  padding: 4px;
  display: flex;
  gap: 6px;
}

.presence-btn {
  flex: 1;
  border: none;
  background: transparent;
  color: #94a3b8;
  padding: 8px;
  border-radius: 999px;
  font-weight: 600;
}

.presence-btn.active {
  background: #6366f1;
  color: white;
}

.action-row {
  display: flex;
  gap: 12px;
}

.primary,
.ghost {
  flex: 1;
  border: none;
  border-radius: 16px;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
}

.primary {
  background: #7c3aed;
  color: white;
}

.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #f87171;
}
</style>
