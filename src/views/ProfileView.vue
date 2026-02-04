<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProfile } from '../composables/useProfile'
import { useAuth } from '../composables/useAuth'
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'

const profileStore = useProfile()
const auth = useAuth()
const route = useRoute()
const router = useRouter()
setDocumentTitle('Профиль')
setDocumentDescription('Профиль ExtraHub: город, часовой пояс и ключи интеграции для управления сценариями света.')

const profileData = computed(() => profileStore.profile.value)
const instructions = computed(() => profileStore.instructions.value)
const savedCityName = computed(() => profileData.value?.city?.name || '')
const cityRequired = computed(() => route.query.cityRequired === '1' && !savedCityName.value)
const cityDetectionLoading = computed(() => !!profileStore.cityDetectionLoading.value)
const profileLoadError = computed(() => profileStore.profileError.value)
const displayName = computed(() => profileData.value?.displayName || '')
const presenceSeen = computed(() => profileData.value?.presenceSeen || { home: false, away: false })
const presenceHomeReady = computed(() => presenceSeen.value?.home === true)
const presenceAwayReady = computed(() => presenceSeen.value?.away === true)
const presenceConfigured = computed(() => presenceHomeReady.value && presenceAwayReady.value)
const presenceStatusLabel = (ready) => ready ? 'работает' : 'ожидание'
const presenceApiTokenCreatedAt = computed(() => profileData.value?.presenceApiTokenCreatedAt || null)

const cityQuery = ref('')
const selectedCity = ref(null)
const manualSuggestions = ref([])
const suggestionsLoading = ref(false)
const suggestionsError = ref('')
const detectionMessage = ref('')
const statusMessage = ref('')
const savedCityNotice = ref('')
const geoError = ref('')
const geoInFlight = ref(false)
const logoutRunning = ref(false)
const deletingProfile = ref(false)
const userTypingCity = ref(false)

const cityInputHint = 'Можно ввести вручную и нажать «Сохранить город».'
const showSuggestions = computed(() => manualSuggestions.value.length > 0 && cityQuery.value.trim().length >= 2)

let suggestionTimer = null
let suggestionRequestId = 0
let hideSuggestionsTimer = null
const autoGeoAttempted = ref(false)

function browserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null
    } catch (_) {
        return null
    }
}

function syncCityFromProfile(city) {
    if (city?.name) {
        selectedCity.value = city
        userTypingCity.value = false
        cityQuery.value = city.name
        detectionMessage.value = ''
        manualSuggestions.value = []
        suggestionsError.value = ''
    }
}

function clearCityRequiredQuery() {
    if (route.query.cityRequired === '1') {
        const nextQuery = { ...route.query }
        delete nextQuery.cityRequired
        router.replace({ query: nextQuery }).catch(() => { })
    }
}

function openPresenceSetupPage() {
    router.push({ name: 'presence-setup' })
}

async function saveCity(city) {
    if (!city) return
    statusMessage.value = `Сохраняем ${city.name || cityQuery.value}…`
    try {
        await profileStore.updateCity(city)
        statusMessage.value = `Выбран город ${city.name || cityQuery.value}`
        savedCityNotice.value = `Сохранён: ${city.name || cityQuery.value}`
        manualSuggestions.value = []
        suggestionsError.value = ''
        userTypingCity.value = false
        selectedCity.value = city
        clearCityRequiredQuery()
    } catch (err) {
        statusMessage.value = err?.message || 'Не удалось сохранить город'
        console.warn('[profile] saveCity failed', err)
    }
}

function resolveGeolocationError(err) {
    if (!err) return 'Не удалось определить геолокацию.'
    if (err.code === 1) return 'Доступ к геолокации запрещён. Разрешите доступ в настройках браузера.'
    if (err.code === 2 || String(err.message || '').includes('kCLErrorLocationUnknown')) {
        return 'Браузер не смог получить координаты. Попробуйте позже или введите город вручную.'
    }
    if (err.code === 3) return 'Время ожидания геолокации истекло. Попробуйте снова.'
    return err?.message || 'Не удалось определить геолокацию.'
}

async function tryGeolocation(fromAuto = false) {
    if (!navigator.geolocation) {
        geoError.value = 'Геолокация недоступна в браузере.'
        return null
    }
    if (geoInFlight.value) return

    geoInFlight.value = true
    geoError.value = ''
    console.log('[profile] geolocation start')
    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 120000, timeout: 8000 })
        })
        const { latitude, longitude } = pos.coords || {}
        console.log('[profile] geolocation coords', { latitude, longitude })
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            geoError.value = 'Не удалось получить координаты.'
            return null
        }
        const data = await profileStore.reverseGeocode(latitude, longitude)
        if (data?.city) {
            const city = data.city
            selectedCity.value = city
            userTypingCity.value = false
            cityQuery.value = city.name || cityQuery.value
            manualSuggestions.value = []
            suggestionsError.value = ''
            await saveCity(city)
            detectionMessage.value = ''
            return city
        } else {
            geoError.value = 'Не удалось определить город по координатам.'
        }
    } catch (err) {
        geoError.value = resolveGeolocationError(err)
        console.warn('[profile] geolocation failed', err)
        if (!fromAuto) {
            statusMessage.value = statusMessage.value || 'Не удалось определить город автоматически'
        }
    } finally {
        geoInFlight.value = false
    }
    return null
}

async function triggerAutoGeolocation() {
    if (autoGeoAttempted.value) return
    autoGeoAttempted.value = true
    try {
        await tryGeolocation(true)
    } catch (err) {
        console.warn('[profile] auto geo failed', err)
    }
}

async function runDetection(autoApply = false) {
    detectionMessage.value = ''
    try {
        const detection = await profileStore.detectCity(browserTimezone())
        console.log('[profile] runDetection result', detection)
        if (!detection) return
        if (detection.status === 'confirm_ip_city' && detection.city) {
            selectedCity.value = detection.city
            userTypingCity.value = false
            cityQuery.value = detection.city.name || cityQuery.value
            manualSuggestions.value = []
            suggestionsError.value = ''
            if (autoApply) {
                await saveCity(detection.city)
            } else {
                detectionMessage.value = `Ваш город ${detection.city.name}? Нажмите «Сохранить город», если всё верно.`
            }
            return
        }
        if (detection.status === 'needs_geo') {
            const tzName = detection.timezone?.name || detection.timezone?.timezone || 'указанной таймзоны'
            if (detection.ip?.city) {
                detectionMessage.value = `IP сообщает о городе ${detection.ip.city}, но локальное время отличается. Попробуем геолокацию или введите город вручную.`
            } else {
                detectionMessage.value = `Не удалось подтвердить город по IP. Попробуем геолокацию или введите город в ${tzName}.`
            }
            await triggerAutoGeolocation()
            return
        }
        if (detection.status === 'ip_lookup_failed') {
            detectionMessage.value = detection.reason === 'private_ip'
                ? 'IP-адрес выглядит локальным. Попробуем геолокацию, иначе введите город вручную.'
                : 'Не удалось определить город по IP. Попробуем геолокацию или введите город вручную.'
            await triggerAutoGeolocation()
            return
        }
        detectionMessage.value = 'Не удалось определить город по IP. Попробуйте геолокацию или введите город вручную.'
        await triggerAutoGeolocation()
    } catch (err) {
        detectionMessage.value = 'Ошибка автоопределения города.'
        console.warn('[profile] detect city failed', err)
        await triggerAutoGeolocation()
    }
}

async function saveCityFromInput() {
    const name = cityQuery.value.trim()
    if (!name) {
        statusMessage.value = 'Введите город'
        return
    }
    let city = null
    if (selectedCity.value && selectedCity.value.name === name) {
        city = selectedCity.value
    }
    if (!city || !city.timezone || city.lat == null || city.lon == null) {
        try {
            const lookup = await profileStore.geocodeCityByName(name, { limit: 1 })
            city = lookup?.city || lookup?.suggestions?.[0] || city
        } catch (err) {
            statusMessage.value = err?.message || 'Не удалось сохранить город'
            return
        }
    }
    if (!city || !city.timezone) {
        statusMessage.value = 'Не нашли такой город'
        return
    }
    await saveCity(city)
    detectionMessage.value = ''
}

function selectSuggestion(option) {
    if (!option) return
    selectedCity.value = option
    userTypingCity.value = false
    cityQuery.value = option.name
    statusMessage.value = ''
    manualSuggestions.value = []
    savedCityNotice.value = ''
}

function handleCityInput() {
    userTypingCity.value = true
    savedCityNotice.value = ''
    if (hideSuggestionsTimer) {
        clearTimeout(hideSuggestionsTimer)
        hideSuggestionsTimer = null
    }
}

function handleCityInputFocus() {
    if (hideSuggestionsTimer) {
        clearTimeout(hideSuggestionsTimer)
        hideSuggestionsTimer = null
    }
}

function handleCityInputBlur() {
    if (hideSuggestionsTimer) {
        clearTimeout(hideSuggestionsTimer)
    }
    hideSuggestionsTimer = setTimeout(() => {
        userTypingCity.value = false
        manualSuggestions.value = []
        hideSuggestionsTimer = null
    }, 120)
}

watch(() => profileData.value?.city, (city) => {
    if (city?.name) {
        syncCityFromProfile(city)
    }
})

watch(cityQuery, (value, _old, onCleanup) => {
    const trimmed = value.trim()
    if (!trimmed) {
        manualSuggestions.value = []
        suggestionsError.value = ''
        if (!profileData.value?.city) {
            selectedCity.value = null
        }
        return
    }
    if (selectedCity.value && selectedCity.value.name !== trimmed) {
        selectedCity.value = null
    }
    if (!userTypingCity.value) {
        manualSuggestions.value = []
        suggestionsError.value = ''
        return
    }
    if (trimmed.length < 2) {
        manualSuggestions.value = []
        suggestionsError.value = ''
        return
    }
    const currentRequest = ++suggestionRequestId
    const timer = setTimeout(async () => {
        suggestionsLoading.value = true
        suggestionsError.value = ''
        try {
            const data = await profileStore.geocodeCityByName(trimmed, { limit: 5 })
            if (currentRequest !== suggestionRequestId) return
            const backendSuggestions = Array.isArray(data?.suggestions) ? data.suggestions : []
            if (backendSuggestions.length) {
                manualSuggestions.value = backendSuggestions
            } else if (data?.city) {
                manualSuggestions.value = [data.city]
            } else {
                manualSuggestions.value = []
            }
        } catch (err) {
            if (currentRequest !== suggestionRequestId) return
            suggestionsError.value = err?.message || 'Не удалось загрузить подсказки.'
            manualSuggestions.value = []
        } finally {
            if (currentRequest === suggestionRequestId) {
                suggestionsLoading.value = false
            }
        }
    }, 350)
    suggestionTimer = timer
    onCleanup(() => clearTimeout(timer))
})

onMounted(async () => {
    try {
        await profileStore.loadProfile()
        if (profileData.value?.city) {
            syncCityFromProfile(profileData.value.city)
        } else {
            await runDetection()
        }
    } catch (err) {
        console.warn('[profile] initialization failed', err)
    }
})

onUnmounted(() => {
    if (suggestionTimer) {
        clearTimeout(suggestionTimer)
        suggestionTimer = null
    }
    if (hideSuggestionsTimer) {
        clearTimeout(hideSuggestionsTimer)
        hideSuggestionsTimer = null
    }
})

async function handleLogout() {
    logoutRunning.value = true
    try {
        await auth.logout()
        router.replace({ name: 'landing' })
    } finally {
        logoutRunning.value = false
    }
}

async function handleDeleteProfile() {
    if (!window.confirm('Вы уверены, что хотите удалить профиль? Это действие необратимо.')) {
        return
    }
    deletingProfile.value = true
    try {
        await profileStore.deleteProfile()
        await auth.logout()
        router.replace({ name: 'landing' })
    } catch (err) {
        statusMessage.value = err?.message || 'Не удалось удалить профиль'
        console.warn('[profile] deleteProfile failed', err)
    } finally {
        deletingProfile.value = false
    }
}
</script>

<template>
    <main class="profile-page">
        <header class="profile-header">
            <div>
                <h1>Профиль</h1>
                <p class="profile-name" v-if="displayName">{{ displayName }}</p>
                <p class="profile-email">{{ profileData?.email || auth.user.value?.email || '—' }}</p>
            </div>
        </header>

        <section class="panel panel--dark city-panel">
            <div class="panel-heading">
                <h2>Город</h2>
                <p class="hint">Нужен для корректной работы сценариев</p>
            </div>
            <p v-if="cityRequired" class="error-message">Укажите город, чтобы продолжить пользоваться сервисом.</p>

            <div class="city-search-block">
                <div class="city-input-row">
                    <div class="city-input-wrapper">
                        <input id="city-search" type="text" v-model="cityQuery" placeholder="Введите название города"
                            autocomplete="off" @input="handleCityInput" @focus="handleCityInputFocus"
                            @blur="handleCityInputBlur">
                        <div v-if="showSuggestions" class="city-suggestions">
                            <button v-for="option in manualSuggestions"
                                :key="`${option.name}-${option.lat}-${option.lon}`" type="button"
                                class="suggestion-item" @click="selectSuggestion(option)">
                                <span class="suggestion-line">
                                    {{ option.name }}
                                    <span v-if="option.region || option.country || option.countryCode"
                                        class="suggestion-region">
                                        — {{ option.region || option.country || option.countryCode }}
                                    </span>
                                </span>
                            </button>
                        </div>
                    </div>
                    <div class="city-actions">
                        <button type="button" class="apply-btn" @click="saveCityFromInput">Сохранить</button>
                    </div>
                </div>
                <p class="muted small">{{ savedCityNotice || cityInputHint }}</p>
            </div>

            <p v-if="cityDetectionLoading" class="muted small">Определяем город автоматически…</p>
            <p v-if="geoInFlight && !profileData?.city" class="muted small">Получаем координаты устройства…</p>
            <p v-if="suggestionsLoading" class="muted small">Ищем подсказки…</p>
            <p v-if="suggestionsError" class="error-message">{{ suggestionsError }}</p>
            <p v-if="statusMessage" class="status-message">{{ statusMessage }}</p>
            <p v-if="detectionMessage" class="muted">{{ detectionMessage }}</p>
            <p v-if="geoError" class="error-message">{{ geoError }}</p>
        </section>

        <section v-if="instructions" class="panel presence-panel">
            <div class="presence-header" @click="openPresenceSetupPage" :style="{ cursor: 'pointer' }">
                <div class="presence-title-col">
                    <h2>Присутствие</h2>
                </div>
                <div class="presence-status-col">
                    <button v-if="!presenceConfigured" type="button" class="presence-status-badge"
                        :class="{ configured: presenceConfigured }"
                        @click.stop="openPresenceSetupPage">
                        Настроить
                    </button>
                    <span v-else class="presence-status-badge" :class="{ configured: presenceConfigured }">
                        настроено
                    </span>
                </div>
            </div>

            <div v-if="presenceHomeReady || presenceAwayReady" class="presence-status-details">
                <div v-if="presenceHomeReady" class="status-row">
                    <span class="status-label">Home</span>
                    <span class="presence-pill ok">{{ presenceStatusLabel(presenceHomeReady) }}</span>
                </div>
                <div v-if="presenceAwayReady" class="status-row">
                    <span class="status-label">Away</span>
                    <span class="presence-pill ok">{{ presenceStatusLabel(presenceAwayReady) }}</span>
                </div>
            </div>
        </section>

        <p v-if="profileLoadError" class="error-message block">Не удалось загрузить профиль: {{ profileLoadError }}</p>

        <footer class="profile-footer">
            <button type="button" class="primary-outline-button" @click="handleLogout" :disabled="logoutRunning">
                {{ logoutRunning ? 'Выходим…' : 'Выйти' }}
            </button>
            <button type="button" class="danger-outline-button" @click="handleDeleteProfile"
                :disabled="deletingProfile || logoutRunning">
                {{ deletingProfile ? 'Удаляем…' : 'Удалить профиль' }}
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
    margin: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.profile-header h1 {
    margin: 0;
}

.profile-name {
    margin: 4px 0 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-subtle);
}

.presence-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.presence-title-col h2 {
    margin: 0;
}

.presence-status-col {
    display: flex;
    align-items: center;
}

.presence-status-badge {
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.92);
    background: rgba(148, 163, 184, 0.14);
    border: 1px solid rgba(148, 163, 184, 0.2);
}

.presence-status-badge[type="button"] {
    cursor: pointer;
    transition: all 0.2s ease;
}

.presence-status-badge[type="button"]:hover {
    background: rgba(148, 163, 184, 0.25);
    border-color: rgba(148, 163, 184, 0.4);
}

.presence-status-badge.configured {
    background: rgba(34, 197, 94, 0.16);
    border-color: rgba(34, 197, 94, 0.35);
}

.setup-link-button {
    background: none;
    border: none;
    color: var(--primary);
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    text-decoration: underline;
}

.setup-link-button:hover {
    text-decoration-color: transparent;
}

.presence-status-details {
    display: flex;
    gap: 16px;
    margin-top: 8px;
}

.status-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.status-label {
    font-size: 13px;
    color: var(--text-muted);
}

.presence-pill {
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.92);
    background: rgba(148, 163, 184, 0.14);
    border: 1px solid rgba(148, 163, 184, 0.2);
}

.presence-pill.ok {
    background: rgba(34, 197, 94, 0.16);
    border-color: rgba(34, 197, 94, 0.35);
}

.panel {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--surface-border);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.panel--dark {
    box-shadow: 0 16px 40px rgba(2, 6, 23, 0.9);
}

.profile-email {
    font-size: 16px;
    color: var(--text-muted);
}

.primary-outline-button {
    background: transparent;
    border: 1px solid var(--primary);
    color: var(--primary);
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
    transition: background var(--transition-base);
}

.primary-outline-button:hover:not(:disabled) {
    background: rgba(168, 85, 247, 0.12);
}

.primary-outline-button:disabled {
    opacity: 0.5;
    cursor: default;
}

.profile-footer {
    display: flex;
    justify-content: flex-start;
    gap: 12px;
    flex-wrap: wrap;
}

.danger-outline-button {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger);
    border-radius: 999px;
    padding: 6px 14px;
    cursor: pointer;
    transition: background var(--transition-base);
}

.danger-outline-button:hover:not(:disabled) {
    background: var(--danger-soft);
}

.danger-outline-button:disabled {
    opacity: 0.5;
    cursor: default;
}

.panel-heading h2 {
    margin: 0;
    font-size: 20px;
}

.panel-heading p {
    margin: 4px 0 0;
    color: var(--text-muted);
}

.panel-heading .hint {
    font-size: 13px;
    margin: 4px 0 0;
    color: var(--text-muted);
}

.city-input-row {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.city-search-block label {
    display: block;
    font-weight: 600;
    margin-bottom: 6px;
}

.city-input-wrapper {
    position: relative;
}

.city-search-block input {
    width: 100%;
    padding: 12px 16px;
    border-radius: 14px;
    border: 1px solid var(--surface-border);
    background: var(--surface-muted);
    color: var(--text-primary);
    font-size: 14px;
}

.city-actions {
    display: flex;
    justify-content: flex-end;
}

.city-suggestions {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    border: 1px solid var(--surface-border-strong);
    border-radius: 12px;
    background: var(--surface-card);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(2, 6, 23, 0.8);
    max-height: 220px;
    overflow-y: auto;
    z-index: 10;
}

.suggestion-item {
    padding: 10px 14px;
    border: none;
    background: transparent;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--text-primary);
    cursor: pointer;
}

.suggestion-item+.suggestion-item {
    border-top: 1px solid #1f2937;
}

.suggestion-item:hover {
    background: rgba(59, 130, 246, 0.12);
}

.suggestion-line {
    font-weight: 600;
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
}

.suggestion-region {
    font-weight: 400;
    color: #94a3b8;
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

.apply-btn:disabled {
    opacity: 0.6;
    cursor: default;
}

.city-actions .apply-btn {
    width: 100%;
}

.city-panel .label {
    margin: 0;
    font-size: 13px;
    color: var(--text-muted);
}

@media (max-width: 640px) {
    .city-input-wrapper {
        position: relative;
    }

    .city-suggestions {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        bottom: auto;
        max-height: 50vh;
    }
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
    color: var(--text-muted);
    margin: 0;
}

.small {
    font-size: 12px;
}

.block {
    margin-top: 8px;
}

@media (min-width: 431px) {
    .city-input-row {
        flex-direction: row;
        align-items: flex-end;
    }

    .city-input-wrapper {
        flex: 1;
    }

    .city-actions .apply-btn {
        width: auto;
    }
}
</style>
