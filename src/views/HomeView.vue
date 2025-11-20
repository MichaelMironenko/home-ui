<script setup>
import { ref, onMounted } from 'vue'
import DeviceGrid from '../components/DeviceGrid.vue'
import { getConfig } from '../lib/api'

const apiBase = ref(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const cfg = await getConfig()
    const raw = cfg.api || cfg.scenariosURL || ''
    const normalized = raw.replace(/\/$/, '')
    apiBase.value = normalized || '/api'
  } catch (err) {
    console.warn('[home] failed to load config', err)
    apiBase.value = '/api'
  } finally {
    loading.value = false
  }
})
</script>

<template>
    <main class="home">
        <header class="hero">
            <h1>Устройства</h1>
            <router-link class="link" to="/scenarios">Перейти к сценариям</router-link>
        </header>

    <section class="card" v-if="!loading && apiBase">
      <DeviceGrid :api-base="apiBase" path="/catalog" />
    </section>
    <section class="card" v-else>
      <p>Загрузка списка устройств…</p>
    </section>
  </main>
</template>

<style scoped>
.home {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px 16px 40px;
}

.hero {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.link {
    text-decoration: none;
    color: #3b82f6;
}

.card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #e5e7eb;
    padding: 16px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}
</style>
