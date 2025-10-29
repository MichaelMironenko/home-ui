<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { trackFunctionCall } from '../lib/requestMetrics'

const router = useRouter()
const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(true)
const error = ref('')
const scenarios = ref([])
const toggling = ref({})

async function loadConfig() {
  try {
    const res = await fetch('/config.json')
    const raw = await res.json()
    cfg.value.base = (raw.scenariosUrl || raw.scenariosURL || raw.scenarioUrl || '').replace(/\/+$/, '')
    cfg.value.keyHeader = raw.keyHeader || raw['x-api-key-header'] || 'x-api-key'
    cfg.value.keyValue = raw.keyValue || raw.apiKey || raw['x-api-key'] || ''
  } catch (err) {
    error.value = `Не удалось загрузить config: ${err}`
  }
}

async function scenariosRequest(path, options = {}) {
  if (!cfg.value.base) throw new Error('scenarios URL not configured')
  const headers = { ...(options.headers || {}) }
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
  if (cfg.value.keyValue) headers[cfg.value.keyHeader || 'x-api-key'] = cfg.value.keyValue
  trackFunctionCall()
  const res = await fetch(`${cfg.value.base}${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) {
    throw new Error(json?.error || res.statusText || 'Request failed')
  }
  return json
}

async function loadScenarios() {
  if (!cfg.value.base) {
    scenarios.value = []
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const data = await scenariosRequest('/list')
    if (Array.isArray(data?.scenarios)) {
      scenarios.value = data.scenarios.map((entry) => {
        const key = String(entry?.key || '').trim()
        const cleanedId = key.replace(/^scenarios\//, '').replace(/\.json$/i, '')
        const id = String(entry?.id || cleanedId || '').trim()
        const name = String(entry?.name || cleanedId || id || '').trim() || 'Без имени'
        return {
          id,
          name,
          key,
          size: Number(entry?.size) || 0,
          lastModified: entry?.lastModified || '',
          pause: entry?.pause || null,
          status: summarizeStatusRecord(entry?.status || null),
        }
      })
    } else if (data?.ok === false && data?.error) {
      scenarios.value = []
      error.value = data.error
    } else {
      scenarios.value = []
      error.value = 'Не удалось получить список сценариев'
    }
  } catch (err) {
    error.value = String(err)
    scenarios.value = []
  } finally {
    loading.value = false
  }
}

const hasScenarios = computed(() => scenarios.value.length > 0)

const formatBytes = (value) => {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatModified(item) {
  if (!item?.lastModified) return ''
  try {
    return new Date(item.lastModified).toLocaleString('ru-RU')
  } catch (_) {
    return item.lastModified
  }
}

function openScenario(id) {
  if (!id) return
  router.push({ name: 'scenario-edit', params: { id } })
}

function createScenario() {
  router.push({ name: 'scenario-create' })
}

function isPaused(item) {
  return !!item?.pause
}

function pauseLabel(item) {
  if (!item?.pause) return ''
  if (item.pause.until) {
    try {
      return `Пауза до ${new Date(item.pause.until).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    } catch (_) { /* ignore */ }
  }
  return 'На паузе'
}

function summarizeStatusRecord(status) {
  if (!status) return null
  const summary = {
    ts: status.ts || null,
    origin: status.origin || null,
  }
  if (status.result) {
    summary.result = {
      active: !!status.result.active,
      reason: status.result.reason || null,
    }
  }
  if (status.error) summary.error = status.error
  return summary
}

function statusText(item) {
  const status = item?.status
  if (!status) return 'Нет данных'
  if (status.error) return `Ошибка: ${status.error.message || status.error}`
  if (status.result) {
    if (status.result.reason === 'manual_pause') return 'На паузе'
    if (status.result.reason === 'presence_guard') return 'Заблокирован по присутствию'
    if (status.result.active) return 'Активен'
    if (status.result.reason) return status.result.reason
    if (status.result.active === false) return 'Не активен'
  }
  return 'Нет данных'
}

async function togglePause(item) {
  if (!item?.id || toggling.value[item.id]) return
  toggling.value = { ...toggling.value, [item.id]: true }
  try {
    if (isPaused(item)) {
      const res = await scenariosRequest('/resume', { method: 'POST', body: { id: item.id } })
      item.pause = res?.result?.pause || null
      if (res?.status) item.status = summarizeStatusRecord(res.status)
    } else {
      const res = await scenariosRequest('/pause', { method: 'POST', body: { id: item.id } })
      item.pause = res?.pause || { setAt: Date.now(), reason: { source: 'manual' } }
      if (res?.status) item.status = summarizeStatusRecord(res.status)
    }
  } catch (err) {
    error.value = String(err)
  } finally {
    toggling.value = { ...toggling.value, [item.id]: false }
  }
}

onMounted(async () => {
  await loadConfig()
  await loadScenarios()
})
</script>

<template>
  <main class="list">
    <header class="hero">
      <div>
        <h1>Сценарии</h1>
        <p class="subtitle">Управляйте сценариями освещения и автоматизации</p>
      </div>
      <button class="primary" type="button" @click="createScenario">Создать новый сценарий</button>
    </header>

    <section class="panel" v-if="loading">
      <p>Загрузка списка…</p>
    </section>

    <section class="panel error" v-else-if="error">
      <p>{{ error }}</p>
    </section>

    <section class="grid" v-else>
      <article v-if="!hasScenarios" class="empty">
        Пока нет сохранённых сценариев
      </article>
      <article
        v-for="item in scenarios"
        :key="item.id || item.key || item.name"
        class="card"
        :class="{ paused: isPaused(item) }"
      >
            <header class="card__header">
                <div
                    class="card__title"
                    role="button"
                    tabindex="0"
                    @click="openScenario(item.id)"
                    @keyup.enter="openScenario(item.id)"
                >
                    <h2>{{ item.name }}</h2>
                    <p v-if="isPaused(item)" class="status status--paused">{{ pauseLabel(item) }}</p>
                    <p v-else class="status status--active">{{ statusText(item) }}</p>
                </div>
          <button
            type="button"
            class="toggle"
            :disabled="toggling[item.id]"
            @click.stop="togglePause(item)"
          >
            <span v-if="isPaused(item)">▶ Возобновить</span>
            <span v-else>⏸ Пауза</span>
          </button>
        </header>
        <footer class="card__meta">
          <span v-if="item.lastModified">Изменён: {{ formatModified(item) }}</span>
          <span>{{ formatBytes(item.size) }}</span>
        </footer>
      </article>
    </section>
  </main>
</template>

<style scoped>
.list {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 16px 40px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hero h1 {
  margin: 0;
  font-size: 28px;
}

.subtitle {
  margin: 4px 0 0;
  color: #6b7280;
}

.primary {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid #2563eb;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: transform .1s ease, box-shadow .15s;
}

.primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(59, 130, 246, 0.35);
}

.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}

.panel.error {
  color: #b91c1c;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.12);
}

.card.paused {
  border-color: #f97316;
  box-shadow: 0 6px 18px rgba(249, 115, 22, 0.28);
}

.card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.card__title {
  flex: 1;
  cursor: pointer;
}

.card__title h2 {
  margin: 0;
  font-size: 18px;
}

.status {
  margin: 4px 0 0;
  font-size: 13px;
  color: #b45309;
}

.status--active {
  color: #0f766e;
}

.toggle {
  background: rgba(15, 23, 42, 0.06);
  border: 1px solid rgba(15, 23, 42, 0.15);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, transform .1s ease;
}

.toggle:hover:enabled {
  background: rgba(37, 99, 235, 0.12);
  transform: translateY(-1px);
}

.toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
}

.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: #6b7280;
  background: #fff;
  border-radius: 16px;
  padding: 32px;
  border: 1px dashed #d1d5db;
}
</style>
