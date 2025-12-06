<script setup>
import { ref, onMounted } from 'vue'
import DeviceGrid from '../components/DeviceGrid.vue'
import { getConfig } from '../lib/api'
import { setDocumentTitle } from '../utils/pageTitle'

const apiBase = ref(null)
const loading = ref(true)

setDocumentTitle('Главная')

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
    <main class="page-shell">
        <DeviceGrid v-if="apiBase" :api-base="apiBase" path="/catalog" />
        <p v-else class="text-dimmed">Загрузка списка устройств…</p>
    </main>
</template>
