<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import DeviceGrid from '../components/DeviceGrid.vue'
import { getConfig } from '../lib/api'
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'
import { useRunningScenarioMonitor } from '../composables/useRunningScenarioMonitor'

const apiBase = ref(null)
const loading = ref(true)
const monitor = useRunningScenarioMonitor()

setDocumentTitle('Устройства')
setDocumentDescription('Каталог и текущее состояние устройств Яндекс Дома: включайте, отключайте и проверяйте статусы в ExtraHub.')

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
    await monitor.refresh().catch(() => {})
    monitor.startAutoRefresh()
})

onUnmounted(() => {
    monitor.stopAutoRefresh()
})
</script>

<template>
    <main class="page-shell">
        <header class="page-header">
            <h1>Устройства</h1>
            <p class="devices-hint">
                Показываются только устройства с поддержкой изменения яркости/цвета и датчики, измеряющие освещенность.
            </p>
        </header>
        <DeviceGrid
            v-if="apiBase"
            :api-base="apiBase"
            path="/catalog"
            :auto-refresh="monitor.hasRunningScenario"
        />
        <p v-else class="text-dimmed">Загрузка списка устройств…</p>
    </main>
</template>

<style scoped>
.page-shell {
    padding: 24px 16px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.devices-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
}


.devices-hint {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
}

.text-dimmed {
    color: var(--text-muted);
}
</style>
