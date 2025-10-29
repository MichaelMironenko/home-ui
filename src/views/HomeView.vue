<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getConfig, callPresence, runAutoLight } from '../lib/api'
import DeviceGrid from '../components/DeviceGrid.vue'
import { useRequestMetrics } from '../lib/requestMetrics'

const cfg = ref(null)
const log = ref('—')
const metrics = useRequestMetrics()
const tempTester = reactive({
  groupId: '',
  value: 3000,
  sending: false,
  error: '',
  rgbValue: '#ffaa44',
  hsvValue: { h: 30, s: 60, v: 80 }
})

const write = (value) => {
  log.value = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

onMounted(async () => {
  cfg.value = await getConfig()
})

async function sendPresence(status) {
  write(await callPresence(status, 'WebUI'))
}

async function auto(query) {
  write(await runAutoLight(query))
}

async function sendGroupTemperature(value) {
  tempTester.value = value
  if (!cfg.value?.api || !tempTester.groupId.trim()) {
    return
  }
  tempTester.sending = true
  tempTester.error = ''
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (cfg.value.apiKey) headers['x-api-key'] = cfg.value.apiKey
    const payload = {
      op: 'group_actions',
      groupId: tempTester.groupId.trim(),
      actions: [
        {
          type: 'devices.capabilities.color_setting',
          state: { instance: 'temperature_k', value }
        }
      ]
    }
    const res = await fetch(cfg.value.api, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `HTTP ${res.status}`)
    }
  } catch (err) {
    tempTester.error = err instanceof Error ? err.message : String(err)
  } finally {
    tempTester.sending = false
  }
}

async function sendGroupColorRGB(hex) {
  if (!cfg.value?.api || !tempTester.groupId.trim()) return
  tempTester.sending = true
  tempTester.error = ''
  try {
    const clean = hex.replace(/^#/, '')
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error('Некорректный HEX')
    const value = parseInt(clean, 16)
    const payload = {
      op: 'group_actions',
      groupId: tempTester.groupId.trim(),
      actions: [
        {
          type: 'devices.capabilities.color_setting',
          state: { instance: 'rgb', value }
        }
      ]
    }
    const headers = { 'Content-Type': 'application/json' }
    if (cfg.value.apiKey) headers['x-api-key'] = cfg.value.apiKey
    const res = await fetch(cfg.value.api, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `HTTP ${res.status}`)
    }
  } catch (err) {
    tempTester.error = err instanceof Error ? err.message : String(err)
  } finally {
    tempTester.sending = false
  }
}

async function sendGroupColorHSV(h, s, v) {
  if (!cfg.value?.api || !tempTester.groupId.trim()) return
  tempTester.sending = true
  tempTester.error = ''
  try {
    const payload = {
      op: 'group_actions',
      groupId: tempTester.groupId.trim(),
      actions: [
        {
          type: 'devices.capabilities.color_setting',
          state: { instance: 'hsv', value: { h, s, v } }
        }
      ]
    }
    const headers = { 'Content-Type': 'application/json' }
    if (cfg.value.apiKey) headers['x-api-key'] = cfg.value.apiKey
    const res = await fetch(cfg.value.api, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `HTTP ${res.status}`)
    }
  } catch (err) {
    tempTester.error = err instanceof Error ? err.message : String(err)
  } finally {
    tempTester.sending = false
  }
}
</script>

<template>
  <main class="home">
    <header class="hero">
      <h1>Home UI</h1>
      <router-link class="link" to="/scenarios">Перейти к сценариям</router-link>
    </header>

    <section class="card">
      <h2>Presence</h2>
      <div class="actions">
        <button @click="sendPresence('home')">Send: home</button>
        <button @click="sendPresence('away')">Send: away</button>
      </div>
    </section>

    <section class="card">
      <h2>Auto light test</h2>
      <div class="actions">
        <button @click="auto('?mode=on')">Auto ON</button>
        <button @click="auto('?mode=off')">Auto OFF</button>
      </div>
    </section>

    <section class="card">
      <h2>Тест температуры</h2>
      <div class="temp-form">
        <label>
          <span>ID группы</span>
          <input type="text" v-model="tempTester.groupId" placeholder="292dfd3e-df2a-498b-..." />
        </label>
        <label class="slider">
          <span>Температура: {{ tempTester.value }}K</span>
          <input type="range" min="1500" max="6500" step="50"
                 :value="tempTester.value"
                 @input="sendGroupTemperature(Number($event.target.value))" />
        </label>
        <p class="hint">Шаг 50K. Значение применяется сразу при движении слайдера.</p>
        <p v-if="tempTester.error" class="error">{{ tempTester.error }}</p>
        <p v-else-if="tempTester.sending" class="status">Отправка…</p>
      </div>
    </section>

    <section class="card">
      <h2>Тест RGB / HSV</h2>
      <div class="temp-form">
        <div class="color-row">
          <label>
            <span>HEX цвет (RGB)</span>
            <input type="text" v-model="tempTester.rgbValue" placeholder="#ffaa44" />
          </label>
          <button type="button" class="secondary" @click="sendGroupColorRGB(tempTester.rgbValue)" :disabled="tempTester.sending">
            Отправить RGB
          </button>
        </div>
        <div class="color-row hsv">
          <label>
            <span>HSV H</span>
            <input type="number" min="0" max="360" v-model.number="tempTester.hsvValue.h" />
          </label>
          <label>
            <span>S</span>
            <input type="number" min="0" max="100" v-model.number="tempTester.hsvValue.s" />
          </label>
          <label>
            <span>V</span>
            <input type="number" min="0" max="100" v-model.number="tempTester.hsvValue.v" />
          </label>
          <button type="button" class="secondary" @click="sendGroupColorHSV(tempTester.hsvValue.h, tempTester.hsvValue.s, tempTester.hsvValue.v)" :disabled="tempTester.sending">
            Отправить HSV
          </button>
        </div>
      </div>
    </section>

    <section class="card stats-card">
      <h2>Статистика за {{ metrics.date }}</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat__value">{{ metrics.yandexCalls }}</div>
          <div class="stat__label">Запросов к API Яндекса</div>
        </div>
        <div class="stat">
          <div class="stat__value">{{ metrics.functionCalls }}</div>
          <div class="stat__label">Вызовов наших функций</div>
        </div>
      </div>
    </section>

    <section class="card" v-if="cfg">
      <h2>Устройства</h2>
      <DeviceGrid :api-base="cfg.api" path="?op=userinfo" />
    </section>

    <section class="card">
      <h2>Log</h2>
      <pre>{{ log }}</pre>
    </section>
  </main>
</template>

<style scoped>
.home {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 40px;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 18px;
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

.link {
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;
}

.link:hover {
  text-decoration: underline;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.temp-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.color-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

.color-row label {
  flex: 1 1 140px;
}

.color-row.hsv label {
  max-width: 120px;
}

.temp-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}

.temp-form input[type="text"] {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}

.slider span {
  font-weight: 600;
}

.slider input[type="range"] {
  width: 100%;
  margin-top: 6px;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

.status {
  margin: 0;
  font-size: 12px;
  color: #2563eb;
}

.error {
  margin: 0;
  font-size: 12px;
  color: #b91c1c;
}

.card h2 {
  margin: 0 0 12px;
  font-size: 20px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

button {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid #1d4ed8;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  transition: background .15s, box-shadow .15s;
}

button:hover {
  background: #1d4ed8;
  box-shadow: 0 10px 20px rgba(37, 99, 235, 0.25);
}

.stats-card .stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.stats-card .stat {
  flex: 1 1 200px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}

.stat__value {
  font-size: 32px;
  font-weight: 600;
  color: #1e293b;
}

.stat__label {
  margin-top: 6px;
  font-size: 14px;
  color: #475569;
}

pre {
  margin: 0;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 10px;
  padding: 12px;
  white-space: pre-wrap;
}
</style>
