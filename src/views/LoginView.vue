<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'

const route = useRoute()
const auth = useAuth()

watchEffect(() => {
  setDocumentTitle('Вход')
  setDocumentDescription('Авторизуйтесь через Яндекс ID, чтобы управлять сценариями света и устройствами в ExtraHub.')
})

const redirectUrl = computed(() => {
  const raw = route.query.redirect
  if (typeof raw === 'string' && raw.length) {
    try {
      const url = new URL(raw, window.location.origin)
      return url.toString()
    } catch (_) {
      return window.location.origin + raw
    }
  }
  return window.location.href
})

const errorMessage = computed(() => {
  const err = route.query.loginError
  if (typeof err !== 'string' || !err.length) return ''
  if (err === 'access_denied') return 'Доступ не предоставлен. Попробуйте ещё раз.'
  if (err === 'no_code') return 'Авторизация не завершена. Попробуйте снова.'
  return 'Не удалось выполнить вход. Попробуйте снова.'
})

function startLogin() {
  auth.login(redirectUrl.value)
}
</script>

<template>
  <main class="login-view">
    <section class="login-card">
      <h1>Вход</h1>
      <p class="lead">
        Чтобы защитить управление домом, требуется авторизация через Яндекс ID.
      </p>
      <p class="hint">
        После входа вы вернётесь на страницу <strong>{{ route.query.redirect || '/' }}</strong>.
      </p>
      <p v-if="errorMessage" class="error">
        {{ errorMessage }}
      </p>
      <button type="button" class="login-btn" @click="startLogin">
        Войти через Яндекс ID
      </button>
    </section>
  </main>
</template>

<style scoped>
.login-view {
  min-height: calc(100vh - 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
}

.login-card {
  width: min(420px, 100%);
  background: #111827;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.4);
  text-align: center;
}

h1 {
  margin: 0 0 12px;
  font-size: 28px;
  color: #f8fafc;
}

.lead {
  margin: 0 0 8px;
  color: #cbd5f5;
}

.hint {
  margin: 0 0 24px;
  color: #94a3b8;
}

.error {
  color: #fecaca;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.4);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.login-btn {
  width: 100%;
  border: none;
  border-radius: 12px;
  padding: 14px 18px;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
  background: linear-gradient(120deg, #ffd54f, #ffb347);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.login-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 30px rgba(251, 191, 36, 0.35);
}
</style>
