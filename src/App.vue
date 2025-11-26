<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const isLoginRoute = computed(() => route.name === 'login')
const currentUser = computed(() => auth.user.value)
const profileInitial = computed(() => {
  const value = currentUser.value?.email || currentUser.value?.login || ''
  const clean = String(value || '').trim()
  return clean ? clean.charAt(0).toUpperCase() : ''
})

async function logout() {
  await auth.logout()
  router.push({ name: 'login', query: { redirect: route.fullPath || '/' } })
}
</script>

<template>
  <div class="app-shell">
    <header v-if="!isLoginRoute" class="app-header">
      <h1>Smart Home</h1>
      <nav>
        <RouterLink to="/" class="nav-link" exact-active-class="active">Главная</RouterLink>
        <RouterLink to="/scenarios" class="nav-link" active-class="active">Сценарии</RouterLink>
        <RouterLink to="/events" class="nav-link" active-class="active">История</RouterLink>
      </nav>
      <RouterLink
        v-if="currentUser"
        :to="{ name: 'profile' }"
        class="profile-badge"
        :title="currentUser.email || 'Профиль'"
      >
        {{ profileInitial }}
      </RouterLink>
    </header>

    <router-view />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  background: var(--surface-muted);
  color: var(--text-primary);
  border-bottom: 1px solid var(--surface-border);
}

.app-header h1 {
  margin: 0;
  font-size: 22px;
}

nav {
  display: flex;
  gap: 14px;
}

.nav-link {
  color: var(--text-muted);
  text-decoration: none;
  font-weight: 500;
  transition: color var(--transition-base);
}

.nav-link:hover {
  color: var(--text-primary);
}

.nav-link.active {
  color: var(--primary);
}

.user-section {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(30, 41, 59, 0.5);
  padding: 10px 16px;
  border-radius: 12px;
}

.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  font-weight: 600;
  color: var(--text-primary);
}

.user-email {
  font-size: 12px;
  color: var(--text-muted);
}

.logout-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  background: var(--danger);
  color: var(--bg-primary);
  cursor: pointer;
}

.logout-btn:hover {
  background: #f87171;
}

.profile-badge {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.15);
  color: var(--primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  border: 1px solid transparent;
}

.profile-badge:hover {
  border-color: rgba(168, 85, 247, 0.5);
}
</style>
