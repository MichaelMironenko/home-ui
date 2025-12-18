<script setup>
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'

setDocumentTitle('Страница не найдена')
setDocumentDescription('Страница не найдена — вернитесь на главную или к списку сценариев ExtraHub.')
</script>

<template>
  <main class="not-found">
    <h1>Страница не найдена</h1>
    <p>Похоже, вы перешли по несуществующему адресу.</p>
    <RouterLink class="btn" :to="{ name: 'landing' }">На главную</RouterLink>
    <RouterLink class="btn secondary" :to="{ name: 'scenarios-list' }">К сценариям</RouterLink>
  </main>
</template>

<style scoped>
.not-found {
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: flex-start;
  justify-content: center;
  padding: 0 24px;
  color: #f8fafc;
}

.not-found h1 {
  margin: 0;
  font-size: 28px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 10px;
  font-weight: 600;
  text-decoration: none;
  background: rgba(59, 130, 246, 0.18);
  color: #e0f2fe;
  transition: background 0.15s ease;
}

.btn.secondary {
  background: rgba(45, 212, 191, 0.12);
  color: #ccfbf1;
}

.btn:hover {
  background: rgba(59, 130, 246, 0.3);
}
</style>
