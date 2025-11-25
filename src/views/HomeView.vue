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
    gap: 8px;
    padding: 24px 16px 40px;
}

.card {
    background: transparent;
    border-radius: 0;
    border: none;
    padding: 0;
    box-shadow: none;
}
</style>
