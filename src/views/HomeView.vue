<script setup>
import { ref, onMounted } from 'vue'
import { getConfig, callPresence, runAutoLight } from '../lib/api'
import DeviceGrid from '../components/DeviceGrid.vue'

const cfg = ref(null)
const log = ref('—')

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

pre {
  margin: 0;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 10px;
  padding: 12px;
  white-space: pre-wrap;
}
</style>
