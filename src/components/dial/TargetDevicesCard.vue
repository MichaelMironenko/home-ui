<script setup>
defineProps({
  loading: Boolean,
  error: String,
  summary: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['open'])
</script>

<template>
  <button type="button" class="card-button" @click="emit('open')">
    <div>
      <p class="card-title">Устройства</p>
      <p class="card-subtitle" v-if="loading">Загружаем каталог…</p>
      <p class="card-subtitle" v-else-if="error">{{ error }}</p>
      <p class="card-subtitle" v-else>{{ summary }}</p>
    </div>
    <span class="card-action">Изменить</span>
  </button>
</template>

<style scoped>
.card-button {
  border: none;
  border-radius: 20px;
  background: #0b1220;
  padding: 16px;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.card-title {
  margin: 0;
  font-weight: 600;
}

.card-subtitle {
  margin: 4px 0 0;
  color: #a7b6d7;
  font-size: 14px;
}

.card-action {
  color: #6366f1;
  font-weight: 600;
}
</style>
