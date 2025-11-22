<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const isLoginRoute = computed(() => route.name === 'login')
const currentUser = computed(() => auth.user.value)

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
        <RouterLink to="/scenario-dial" class="nav-link" active-class="active">Песочница</RouterLink>
      </nav>
      <div class="user-section" v-if="currentUser">
        <div class="user-info">
          <span class="user-name">{{ currentUser.displayName || currentUser.login }}</span>
          <span v-if="currentUser.email" class="user-email">{{ currentUser.email }}</span>
        </div>
        <button type="button" class="logout-btn" @click="logout">Выйти</button>
      </div>
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
  background: #0f172a;
  color: #e2e8f0;
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 24px;
  background: #111827;
  color: #f9fafb;
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
  color: #d1d5db;
  text-decoration: none;
  font-weight: 500;
}

.nav-link:hover {
  color: #f9fafb;
}

.nav-link.active {
  color: #60a5fa;
}

.user-section {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #1f2937;
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
  color: #f8fafc;
}

.user-email {
  font-size: 12px;
  color: #94a3b8;
}

.logout-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  background: #ef4444;
  color: #0f172a;
  cursor: pointer;
}

.logout-btn:hover {
  background: #f87171;
}
</style>
