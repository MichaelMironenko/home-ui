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
      <p class="card-subtitle error" v-else-if="error">{{ error }}</p>
      <p class="card-subtitle" v-else>{{ summary }}</p>
    </div>
    <span class="card-action">›</span>
  </button>
</template>

<style scoped>
.card-button {
  border: none;
  border-radius: 20px;
  background: #0b1220;
  padding: 16px;
  color: #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  text-align: left;
}

.card-title {
  margin: 0;
  font-weight: 600;
  font-size: 15px;
}

.card-subtitle {
  margin: 4px 0 0;
  color: #cdd5e7;
  font-size: 14px;
  font-weight: 500;
}
.card-subtitle.error {
  color: #f87171;
}

.card-action {
  color: #cdd5e7;
  font-weight: 400;
  font-size: 30px;
  line-height: 1;
}
</style>
