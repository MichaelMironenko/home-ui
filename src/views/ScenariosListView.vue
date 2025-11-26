<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'

const router = useRouter()
const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(true)
const error = ref('')
const scenarios = ref([])
const toggling = ref({})

function normalizeBase(raw = '') {
  return raw.replace(/\/+$/, '')
}

async function loadConfig() {
  try {
    const raw = await getConfig()
    const apiBase =
      raw.api ||
      raw.apiBase ||
      raw.scenariosUrl ||
      raw.scenariosURL ||
      raw.scenarioUrl ||
      raw.scenariosBase ||
      ''
    cfg.value.base = normalizeBase(apiBase)
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
    credentials: options.credentials ?? 'include',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  if (!res.ok) {
    throw new Error(json?.error || text || res.statusText || 'Request failed')
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
              type: entry?.type || null,
              disabled: entry?.disabled === true,
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

function scenarioTypeLabel(type) {
  if (type === 'auto-light-v1') return 'Автоматический свет'
  return 'Сценарий V1'
}

function formatModified(item) {
  if (!item?.lastModified) return ''
  try {
    return new Date(item.lastModified).toLocaleString('ru-RU')
  } catch (_) {
    return item.lastModified
  }
}

function openScenario(item) {
  if (!item || !item.id) return
  if (item.type === 'auto-light-v1') {
    router.push({ name: 'auto-light-edit', params: { id: item.id } })
  } else {
    router.push({ name: 'scenario-edit', params: { id: item.id } })
  }
}

function createScenario() {
  router.push({ name: 'scenario-create' })
}

function createAutoLightScenario() {
  router.push({ name: 'auto-light-create' })
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
  if (item?.disabled) return 'Отключен'
  if (!status) return 'Нет данных'
  if (status.error) return `Ошибка: ${status.error.message || status.error}`
  if (status.result) {
    if (status.result.reason === 'manual_pause') return 'На паузе'
    if (status.result.reason === 'presence_guard') return 'Заблокирован по присутствию'
    if (status.result.reason === 'disabled') return 'Отключен'
    if (status.result.active) return 'Активен'
    if (status.result.reason) return status.result.reason
    if (status.result.active === false) return 'Не активен'
  }
  return 'Нет данных'
}

async function togglePause(item) {
  if (!item?.id || toggling.value[item.id]) return
  if (item?.disabled) {
    error.value = 'Сценарий отключен — включите его, чтобы управлять паузой'
    return
  }
  if (item?.disabled) return
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
<main class="page-shell list">
    <header class="hero">
      <div>
        <h1>Сценарии</h1>
        <p class="subtitle">Управляйте сценариями освещения и автоматизации</p>
      </div>
        <div class="actions">
        <button class="primary-button" type="button" @click="createScenario">Создать сценарий</button>
        <button class="primary-outline-button" type="button" @click="createAutoLightScenario">Автоматический свет</button>
      </div>
    </header>

    <section class="panel-card" v-if="loading">
      <p>Загрузка списка…</p>
    </section>

    <section class="panel-card" v-else-if="error">
      <p>{{ error }}</p>
    </section>

    <section class="grid" v-else>
      <article v-if="!hasScenarios" class="empty">
        Пока нет сохранённых сценариев
      </article>
      <article
        v-for="item in scenarios"
        :key="item.id || item.key || item.name"
        class="scenario-card"
        :class="{ paused: isPaused(item), disabled: item.disabled }"
      >
            <header class="card__header">
                <div
                    class="card__title"
                    role="button"
                    tabindex="0"
                    @click="openScenario(item)"
                    @keyup.enter="openScenario(item)"
                >
                    <h2>{{ item.name }}</h2>
                    <p v-if="item.disabled" class="status status--disabled">Отключен</p>
                    <p v-else-if="isPaused(item)" class="status status--paused">{{ pauseLabel(item) }}</p>
                    <p v-else class="status status--active">{{ statusText(item) }}</p>
                    <span v-if="item.type" class="type-chip">{{ scenarioTypeLabel(item.type) }}</span>
                </div>
          <button
            type="button"
            class="toggle"
            :disabled="toggling[item.id] || item.disabled"
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
  width: min(960px, 100%);
  margin: 0 auto;
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

.actions {
  display: flex;
  gap: 8px;
}

.hero h1 {
  margin: 0;
  font-size: 28px;
  color: var(--text-primary);
}

.subtitle {
  margin: 4px 0 0;
  color: var(--text-muted);
}

.type-chip {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.16);
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.scenario-card {
  background: var(--surface-card);
  border: 1px solid var(--surface-border);
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 12px 20px rgba(0, 0, 0, 0.45);
}

.scenario-card.paused {
  border-color: rgba(249, 115, 22, 0.55);
  box-shadow: 0 12px 24px rgba(249, 115, 22, 0.25);
}

.scenario-card.disabled {
  opacity: 0.65;
  border-style: dashed;
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
  color: var(--text-primary);
}

.status {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--primary);
}

.status--active {
  color: #34d399;
}

.status--disabled {
  color: var(--text-muted);
}

.toggle {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background .15s ease, transform .1s ease;
  color: var(--text-primary);
}

.toggle:hover:enabled {
  background: rgba(168, 85, 247, 0.12);
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
  color: var(--text-muted);
}

.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-muted);
  background: var(--surface-card);
  border-radius: 16px;
  padding: 32px;
  border: 1px dashed rgba(148, 163, 184, 0.4);
}
</style>
