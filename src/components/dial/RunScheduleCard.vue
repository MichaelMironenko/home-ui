<script setup>
import DialCardButton from './DialCardButton.vue'

defineProps({
  summary: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['open'])
</script>

<template>
  <DialCardButton @click="emit('open')">
    <div>
      <p class="card-title">Запускать</p>
      <p class="card-subtitle">{{ summary }}</p>
    </div>
  </DialCardButton>
</template>

<style scoped>
.card-title {
  margin: 0;
  font-weight: 600;
  font-size: 15px;
}

.card-subtitle {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 500;
}
</style>
