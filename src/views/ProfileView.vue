<script setup>
import { ref, computed, onMounted } from 'vue'
import { useProfile } from '../composables/useProfile'
import { useAuth } from '../composables/useAuth'

const profileStore = useProfile()
const auth = useAuth()
const selectedTimezoneId = ref('')
const statusMessage = ref('')
const logoutRunning = ref(false)

const instructions = computed(() => profileStore.instructions)
const currentTimezoneLabel = computed(() => {
  if (profileStore.profile?.timezone?.name) {
    return profileStore.profile.timezone.name
  }
  const selected = timezoneOptions.value.find((tz) => tz.id === selectedTimezoneId.value)
  return selected?.name || 'не выбрана'
})

const timezoneOptions = computed(() => {
  const list = profileStore.timezoneList?.value ?? profileStore.timezoneList
  return Array.isArray(list) ? list : []
})
const timezoneLoading = computed(() => !!profileStore.timezoneSearchLoading.value)
const timezoneError = computed(() => profileStore.timezoneSearchError.value || '')

async function applySelectedTimezone() {
  statusMessage.value = ''
  const id = selectedTimezoneId.value
  if (!id) return
  const zone = timezoneOptions.value.find(tz => tz.id === id)
  if (!zone) return
  try {
    await profileStore.updateTimezone(zone.id)
    statusMessage.value = `Выбрана временная зона ${zone.name}`
  } catch (err) {
    console.warn('[profile] update timezone failed', err)
  }
}

onMounted(async () => {
  try {
    await profileStore.loadProfile()
    await profileStore.searchTimezones('')
    // выставляем селект из профиля, если уже есть зона
    if (profileStore.profile?.timezone?.id) {
      selectedTimezoneId.value = profileStore.profile.timezone.id
    }

    if (!profileStore.profile?.timezone) {
      try {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (browserTz) {
          const list = timezoneOptions.value
          const exact = Array.isArray(list) ? list.find((tz) => tz.timezone === browserTz) : null
          if (exact) {
            await profileStore.updateTimezone(exact.id)
            selectedTimezoneId.value = exact.id
          }
        }
      } catch (err) {
        console.warn('[profile] failed to detect browser timezone', err)
      }
    }
  } catch (err) {
    console.warn('[profile] initialization failed', err)
  }
})

async function handleLogout() {
  logoutRunning.value = true
  try {
    await auth.logout()
  } finally {
    logoutRunning.value = false
  }
}
</script>

<template>
  <main class="profile-page">
    <header class="profile-header">
      <div>
        <h1>Профиль</h1>
        <p class="profile-email">{{ profileStore.profile?.email || auth.user.value?.email || '—' }}</p>
      </div>
    </header>

    <section class="panel panel--dark">
      <div class="panel-heading">
        <h2>Временная зона</h2>
        <p>Выберите временную зону, чтобы сценарии работали в нужные часы.</p>
      </div>
      <div class="timezone-select-row">
        <select
          v-model="selectedTimezoneId"
          class="timezone-select"
          :disabled="timezoneLoading || timezoneOptions.length === 0"
        >
          <option value="">— Выберите зону —</option>
          <option
            v-for="timezone in timezoneOptions"
            :key="timezone.id"
            :value="timezone.id"
          >
            {{ timezone.name }}
          </option>
        </select>
        <button
          type="button"
          class="apply-btn"
          :disabled="!selectedTimezoneId || timezoneLoading"
          @click="applySelectedTimezone"
        >
          Применить
        </button>
      </div>
      <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
      <p v-if="timezoneError" class="error-message">
        Ошибка загрузки временных зон: {{ timezoneError }}
      </p>
      <p v-if="timezoneLoading" class="muted">
        Загружаем список временных зон…
      </p>
    </section>

    <section v-if="instructions" class="panel instructions-panel">
      <div class="panel-heading">
        <h2>Настройка присутствия</h2>
        <p>Скопируйте указанные настройки в Shortcuts (iOS) или Tasker (Android).</p>
      </div>
      <div class="instruction-grid">
        <div>
          <p class="label">Endpoint</p>
          <code>{{ instructions.endpoint }}</code>
        </div>
        <div v-if="instructions.secret">
          <p class="label">Секрет</p>
          <code>{{ instructions.secret }}</code>
        </div>
        <div v-else>
          <p class="label">Секрет</p>
          <span>Секрет не задан на сервере</span>
        </div>
      </div>
      <div class="instruction-block">
        <h3>iOS Shortcuts</h3>
        <p>{{ instructions.ios }}</p>
      </div>
      <div class="instruction-block">
        <h3>Android (Tasker / Routine)</h3>
        <p>{{ instructions.android }}</p>
      </div>
</section>

    <p v-if="profileStore.profileError" class="error-message block">
      Не удалось загрузить профиль: {{ profileStore.profileError }}
    </p>

    <footer class="profile-footer">
      <button type="button" class="primary-outline-button" @click="handleLogout" :disabled="logoutRunning">
        {{ logoutRunning ? 'Выходим…' : 'Выйти' }}
      </button>
    </footer>

  </main>
</template>

<style scoped>
.profile-page {
  padding: 24px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.current-timezone {
  text-align: right;
  min-width: 180px;
}

.current-timezone span {
  font-size: 12px;
  color: #94a3b8;
}

.current-timezone strong {
  display: block;
  font-size: 18px;
}

.panel {
  background: #0f172a;
  border-radius: 20px;
  border: 1px solid #1f2937;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel--dark {
  box-shadow: 0 16px 40px rgba(2, 6, 23, 0.9);
}

.profile-email {
  font-size: 14px;
  color: var(--text-muted);
}

.profile-footer {
  display: flex;
  justify-content: flex-start;
}

.panel-heading h2 {
  margin: 0;
  font-size: 20px;
}

.panel-heading p {
  margin: 4px 0 0;
  color: #94a3b8;
}

.timezone-select-row {
  display: flex;
  gap: 10px;
}

.timezone-select {
  flex: 1;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid #374151;
  font-size: 14px;
  background: #1f2937;
  color: #f8fafc;
  appearance: none;
  outline: none;
  background-image:
    linear-gradient(45deg, transparent 50%, #94a3b8 50%),
    linear-gradient(135deg, #94a3b8 50%, transparent 50%);
  background-position:
    calc(100% - 20px) calc(50% - 5px),
    calc(100% - 25px) calc(50% - 5px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
}

.apply-btn {
  padding: 12px 20px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(120deg, #2563eb, #6366f1);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.3);
}

.timezone-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.timezone-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  gap: 10px;
}

.timezone-list strong {
  display: block;
}

.timezone {
  font-size: 12px;
  color: #64748b;
}

.timezone-list button {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
  background: #111827;
  color: #f8fafc;
}

.timezone-list button:disabled {
  background: #94a3b8;
  cursor: default;
}

.status-message {
  margin: 0;
  font-size: 14px;
  color: #0f9d58;
}

.error-message {
  color: #dc2626;
  margin: 0;
}

.muted {
  color: #475569;
  margin: 0;
}

.debug-line {
  font-size: 12px;
  margin-top: -6px;
}

.instruction-panel {
  gap: 18px;
}

.instruction-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.instruction-grid .label {
  font-size: 12px;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 4px;
}

.instruction-grid code {
  display: block;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 14px;
}

.instruction-block {
  background: #f8fafc;
  border-radius: 14px;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
}

.instruction-block h3 {
  margin: 0;
  font-size: 16px;
}

.instruction-block p {
  margin: 6px 0 0;
  color: #0f172a;
}

.note {
  color: #475569;
  font-size: 14px;
  margin: 0;
}

.block {
  margin-top: 8px;
}

@media (max-width: 720px) {
  .timezone-select-row {
    flex-direction: column;
  }

  .apply-btn {
    width: 100%;
  }

  .timezone-list li {
    flex-direction: column;
    align-items: flex-start;
  }

  .instruction-grid {
    grid-template-columns: 1fr;
  }
}
</style>
