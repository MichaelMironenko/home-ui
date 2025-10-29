<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Smart Home</h1>
      <nav>
        <RouterLink to="/" class="nav-link" exact-active-class="active">Главная</RouterLink>
        <RouterLink to="/scenarios" class="nav-link" active-class="active">Сценарии</RouterLink>
        <RouterLink to="/events" class="nav-link" active-class="active">История</RouterLink>
      </nav>
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
</style>
