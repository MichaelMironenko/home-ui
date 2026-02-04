<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'
import { useProfile } from '../composables/useProfile'
import SegmentedControl from '../components/dial/SegmentedControl.vue'
import screenshotGeolocation from '../assets/screenshots/geolocation-settings.png'
import screenshotWiFi from '../assets/screenshots/wifi-settings.png'
import screenshotActionSearch from '../assets/screenshots/action-search.png'
import screenshotHomePayload from '../assets/screenshots/home-payload.png'
import screenshotAwayPayload from '../assets/screenshots/away-payload.png'
import screenshotAutomationSummary from '../assets/screenshots/automation-summary.png'

const profileStore = useProfile()
const router = useRouter()

setDocumentTitle('Настройка присутствия')
setDocumentDescription('Подробная инструкция по выдаче токена Presence, заданию тела запроса и автоматизациям для Shortcuts и MacroDroid.')

const profileData = computed(() => profileStore.profile.value)
const instructions = computed(() => profileStore.instructions.value)
const presenceSeen = computed(() => profileData.value?.presenceSeen || { home: false, away: false })
const presenceHomeReady = computed(() => presenceSeen.value?.home === true)
const presenceAwayReady = computed(() => presenceSeen.value?.away === true)
const presenceStatusLabel = (ready) => ready ? 'работает' : 'ожидание'
const presenceEndpoint = computed(() => instructions.value?.endpoint || '/api/presence')
const presenceApiTokenCreatedAt = computed(() => profileData.value?.presenceApiTokenCreatedAt || null)
const issuedPresenceToken = ref('')
const issuingPresenceToken = ref(false)
const presenceTokenError = ref('')
const presencePlatform = ref('ios')
const presencePlatformOptions = [
    { value: 'ios', label: 'iPhone (Shortcuts)' },
    { value: 'android', label: 'Android (MacroDroid)' }
]

const presenceTokenLabel = computed(() => {
    return presenceApiTokenCreatedAt.value ? 'Получить новый токен' : 'Сгенерировать токен'
})

const presenceTokenHeader = computed(() => {
    const token = issuedPresenceToken.value?.trim()
    return token ? `Token: ${token}` : 'Token: Полученный выше токен в формате pres_...'
})

async function handleIssuePresenceToken() {
    if (issuingPresenceToken.value) return
    issuingPresenceToken.value = true
    presenceTokenError.value = ''
    issuedPresenceToken.value = ''
    try {
        const data = await profileStore.issuePresenceToken()
        issuedPresenceToken.value = data?.token || ''
        if (!issuedPresenceToken.value) {
            presenceTokenError.value = 'Не удалось получить токен.'
        }
    } catch (err) {
        presenceTokenError.value = err?.message || 'Не удалось сгенерировать токен'
    } finally {
        issuingPresenceToken.value = false
    }
}

onMounted(() => {
    profileStore.loadProfile().catch(() => { })
})

function goBack() {
    router.back()
}
</script>

<template>
    <main class="presence-page">
        <header class="presence-page-header">
            <button type="button" class="back-button" @click="goBack">← Назад</button>
            <div>
                <h1>Настройка присутствия</h1>
                <p class="modal-subtitle">Позволяет запускать сценарии только когда кто-то дома и выключать свет, когда ушли все.</p>
            </div>
        </header>

        <section class="instruction-block">
            <div class="presence-platform">
                <SegmentedControl aria-label="Платформа" :model-value="presencePlatform"
                    :options="presencePlatformOptions" @update:model-value="presencePlatform = $event" />
            </div>

            <ol class="presence-steps">
                <li>
                    <div class="presence-step-title">Шаг 1. Сгенерируйте персональный токен</div>
                    <div class="presence-step-body">
                        <button type="button" class="apply-btn small" @click="handleIssuePresenceToken"
                            :disabled="issuingPresenceToken">
                            {{ presenceTokenLabel }}
                        </button>
                        <p v-if="presenceApiTokenCreatedAt" class="muted small">
                            Токен уже сгенерирован. Чтобы увидеть новый токен, нажмите «Получить новый токен».
                        </p>
                        <p v-if="issuedPresenceToken" class="muted small">
                            Новый токен (покажем один раз): <code class="token">{{ issuedPresenceToken }}</code>
                        </p>
                        <p v-if="presenceTokenError" class="error-message">{{ presenceTokenError }}</p>
                    </div>
                </li>
                <li>
                    <div class="presence-step-title">Шаг 2. Настройте автоматизации</div>
                    <div class="presence-step-body" v-if="presencePlatform === 'ios'">
                        <ol class="presence-substeps">
                            <li>Откройте приложение <b>Команды</b> (Shortcuts).</li>
                            <li>Перейдите на вкладку <b>Автоматизация</b>.</li>
                            <li>Нажмите <b>+</b> → <b>Создать автоматизацию</b>.</li>
                            <li>
                                <div>Выберите, как определять факт вашего присутствия дома: по геолокации или подключению к домашнему Wi-Fi.</div>
                                <p class="muted small">Геолокация точнее, но если она некорректно срабатывает, включите Wi-Fi.</p>
                                <div class="presence-split-grid">
                                    <article class="presence-branch-card">
                                        <div class="presence-branch-title">Прибытие (геолокация)</div>
                                        <ul>
                            <li><span class="presence-branch-index">4.1</span>В разделе <b>Геопозиции</b> выберите расположение дома.</li>
                                            <li><span class="presence-branch-index">4.2</span>Установите <b>Любое время</b>.</li>
                            <li><span class="presence-branch-index">4.3</span>Включите <b>Немедленный запуск</b>.</li>
                                        </ul>
                                        <div class="presence-screenshot-block">
                                            <img :src="screenshotGeolocation" alt="Настройки геопозиции и времени в Shortcuts"
                                                class="presence-screenshot" />
                                            <p class="presence-screenshot-caption">Пример настроек автоматизации по геопозиции</p>
                                        </div>
                                    </article>
                                    <article class="presence-branch-card">
                                        <div class="presence-branch-title">Wi-Fi (подключение к домашней сети)</div>
                                        <ul>
                            <li><span class="presence-branch-index">4.1</span>Выберите вашу домашнюю сеть Wi-Fi.</li>
                                            <li><span class="presence-branch-index">4.2</span>Триггер — событие <b>Подключение</b>.</li>
                            <li><span class="presence-branch-index">4.3</span>Включите <b>Немедленный запуск</b>.</li>
                                        </ul>
                                        <div class="presence-screenshot-block">
                                            <img :src="screenshotWiFi" alt="Настройки Wi-Fi события и времени" class="presence-screenshot" />
                                            <p class="presence-screenshot-caption">Пример настроек по Wi-Fi</p>
                                        </div>
                                    </article>
                                </div>
                            </li>
                            <li>Создайте новую быструю команду, а в «Поиск действий» введите <b>Получить содержимое URL</b>.</li>
                            <li>
                                <div class="presence-screenshot-block">
                                    <img :src="screenshotActionSearch" alt="Поиск действия Получить содержимое URL"
                                        class="presence-screenshot" />
                                    <p class="presence-screenshot-caption">Поиск действия «Получить содержимое URL»</p>
                                </div>
                            </li>
                            <li>
                                В действии выставьте:
                                <div class="presence-subkv"><span>Метод:</span> <code>POST</code></div>
                                <div class="presence-subkv"><span>URL:</span> <code>{{ presenceEndpoint }}</code></div>
                            </li>
                            <li>
                                <div class="presence-subkv"><span>Заголовок:</span>
                                    <code>{{ presenceTokenHeader }}</code>
                                </div>
                                <div class="presence-subkv">
                                    <span>Тело запроса:</span>
                                    <div>Нажмите "Добавить новое поле"/"Текст". В поле <b>Ключ</b> введите <code>device</code>, в поле
                                        <b>Текст</b> — ваше имя на английском, например <code>Katya</code>. Добавьте ещё одно поле/текст: <b>Ключ</b> —
                                        <code>status</code>, <b>Текст</b> — <code>home</code>.</div>
                                </div>
                                <div class="presence-screenshot-block">
                                    <img :src="screenshotHomePayload" alt="Пример запроса POST в Shortcuts" class="presence-screenshot" />
                                    <p class="presence-screenshot-caption">Пример наполнения запроса для Home</p>
                                </div>
                            </li>
                            <li>Сохраните автоматизацию, нажав на галочку и включив <b>Выполнять немедленно</b>, если такая опция доступна.</li>
                            <li>Повторите шаги 2–6 для автоматизации ухода (выход из геозоны или отключение от Wi-Fi) и укажите <code>status</code> — <code>away</code>.</li>
                            <li>
                                <div class="presence-screenshot-block">
                                    <img :src="screenshotAwayPayload" alt="Запрос POST для статуса away" class="presence-screenshot" />
                                    <p class="presence-screenshot-caption">Пример запроса Away</p>
                                </div>
                            </li>
                        </ol>
                    </div>
                    <div class="presence-step-body" v-else>
                        <ol class="presence-substeps">
                            <li>Откройте <b>MacroDroid</b> → нажмите <b>+ Макрос</b> → <b>Создать новый макрос</b>.</li>
                            <li>Выберите триггер: <b>Location</b> → <b>Geofence</b> → укажите дом/адрес.</li>
                            <li>Выберите действие: <b>Enter geofence</b> (вход в геозону).</li>
                            <li>Добавьте действие: <b>HTTP Request</b> → режим <b>POST</b>.</li>
                            <li>
                                Заполните:
                                <div class="presence-subkv"><span>URL:</span> <code>{{ presenceEndpoint }}</code></div>
                                <div class="presence-subkv"><span>Header:</span>
                                    <code>{{ presenceTokenHeader }}</code>
                                </div>
                                <div class="presence-subkv">
                                    <span>Тело запроса:</span>
                                    <div>Добавьте поле: в <b>Ключ</b> — <code>device</code>, в <b>Текст</b> — ваше имя на английском. Добавьте ещё одно поле: <b>Ключ</b> — <code>status</code>, <b>Текст</b> — <code>home</code>.</div>
                                </div>
                            </li>
                            <li>Сохраните макрос.</li>
                            <li>Повторите шаги 3–6 для <b>Exit geofence</b> или отключения от домашней сети Wi-Fi, используя <code>status</code> — <code>away</code>.</li>
                        </ol>
                    </div>
                </li>
                <li>
                    <div class="presence-step-title">Шаг 3. Проверьте работу</div>
                    <div class="presence-step-body">
                        Запустите один раз Home и Away (вручную или через тестовую автоматизацию) и убедитесь, что ниже оба статуса стали «работает».
                    </div>
                </li>
            </ol>
        </section>

        <section class="presence-status">
            <div class="presence-status-row">
                <span class="label">Home</span>
                <span class="presence-pill" :class="{ ok: presenceHomeReady }">{{ presenceStatusLabel(presenceHomeReady) }}</span>
            </div>
            <div class="presence-status-row">
                <span class="label">Away</span>
                <span class="presence-pill" :class="{ ok: presenceAwayReady }">{{ presenceStatusLabel(presenceAwayReady) }}</span>
            </div>
            <p v-if="!presenceHomeReady || !presenceAwayReady" class="muted small">
                Для включения сценариев по присутствию нужно, чтобы сервер получил хотя бы один раз обе команды: <code>home</code> и <code>away</code>.
            </p>
        </section>
    </main>
</template>

<style scoped>
.presence-page {
    padding: 24px 16px 40px;
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.presence-page-header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.back-button {
    background: none;
    border: none;
    color: var(--primary);
    font-weight: 600;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-base);
}

.back-button:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.08);
}

.presence-platform {
    margin: 16px 0 12px;
    display: flex;
    justify-content: flex-start;
}

.presence-step-title {
    font-weight: 700;
}

.presence-step-body {
    margin-top: 6px;
    display: grid;
    gap: 8px;
}

.presence-split-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.presence-branch-card {
    background: var(--surface-muted);
    border: 1px solid var(--surface-border);
    border-radius: 12px;
    padding: 10px 12px;
}

.presence-branch-card ul {
    margin: 0;
    padding-left: 16px;
    display: grid;
    gap: 4px;
}

.presence-branch-card li {
    font-size: 0.92em;
    line-height: 1.4;
}

.presence-branch-title {
    font-weight: 600;
    margin-bottom: 6px;
}

.presence-branch-index {
    font-weight: 600;
    margin-right: 4px;
    color: var(--text-muted);
}

.presence-screenshot-block {
    display: grid;
    gap: 6px;
    background: var(--surface-muted);
    border: 1px solid var(--surface-border);
    border-radius: 12px;
    padding: 10px;
    margin-top: 6px;
    width: 100%;
    max-width: 360px;
    justify-self: center;
}

.presence-screenshot {
    width: 100%;
    max-width: 320px;
    border-radius: 12px;
    object-fit: contain;
    justify-self: center;
}

.presence-screenshot-caption {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
}

.apply-btn.small {
    padding: 8px 12px;
    font-size: 13px;
    color: rgba(226, 232, 240, 0.92);
    background: linear-gradient(135deg, var(--primary), var(--primary-alt));
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
}

.apply-btn.small:hover:not(:disabled) {
    opacity: 0.9;
}

.apply-btn.small:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.presence-steps {
    margin: 10px 0 16px;
    padding-left: 18px;
    display: grid;
    gap: 10px;
}

.presence-kv {
    display: grid;
    gap: 6px;
}

.presence-snippet {
    margin: 8px 0 0;
    padding: 10px 12px;
    background: rgba(2, 6, 23, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 12px;
    overflow: auto;
    font-size: 12px;
}

.presence-substeps {
    margin: 6px 0 0;
    padding-left: 18px;
    display: grid;
    gap: 8px;
}

.presence-subkv {
    display: grid;
    gap: 4px;
    margin-top: 6px;
}

.muted {
    color: var(--text-muted);
    margin: 0;
}

.small {
    font-size: 12px;
}

.error-message {
    color: #dc2626;
    margin: 0;
}

.presence-platform,
.presence-status {
    background: var(--surface-muted);
    border-radius: var(--radius-lg);
    padding: 12px 14px;
    border: 1px solid var(--surface-border);
}

.presence-status {
    display: grid;
    gap: 8px;
}

.presence-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.label {
    font-size: 13px;
    color: var(--text-muted);
}
</style>
