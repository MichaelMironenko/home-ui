<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'
import heroPreview from '../assets/hero-preview.svg'
import colorGradient from '../assets/color-gradient.svg'
const auth = useAuth()
const router = useRouter()
const isAuthenticated = computed(() => !!auth.user.value)
const showConsentModal = ref(false)

setDocumentTitle('Что умеет Extrahub?')
setDocumentDescription(
    'Интеллектуальные сценарии освещения для Яндекс Дома: плавные переходы, адаптивный свет, учёт вашего присутствия и автоматизация.'
)

const features = [
    {
        title: 'Плавное изменение цветовой температуры',
        description: 'Поддержка естественных циркадных ритмов человека. Днём - белый свет для концентрации, вечером - тёплый для расслабления и здорового сна. Расширенный диапазон температуры - до 1700К, что соответствует уютному свечению пламени огня.',
        type: 'temperature',
    },
    {
        title: 'Изменение цвета под настроение',
        description: 'Хотите плавный переход от синего к красному? Или назначить каждой лампе отдельный цветовой градиент, чтобы комната медленно переливалась разными цветами? Без проблем! Выбирайте любые цвета и создавайте уникальную живую атмосферу.',
        type: 'mood',
    },
    {
        title: 'Адаптивный свет по датчику',
        descriptionBefore: 'Extrahub автоматически устанавливает оптимальный уровень яркости ламп, в зависимости от освещенности за ',
        descriptionAnchor: 'окном',
        descriptionAfter: '. Один сценарий перекрывает десятки ручных правил.',
        footnote: 'Для сценария нужен датчик освещения',
        footnoteNumber: 1,
    },
    {
        title: 'Алгоритмы, уважающие ваши желания',
        description: 'По сценарию свет должен быть включён, но вы решили посмотреть фильм в темноте? Просто выключите свет как обычно — сценарий приостановится и возобновится, когда вы снова включите его. У вас свидание и вы выбрали романтический розовый свет? Алгоритмы Extrahub поймут, что сегодня особенный день, и не будут мешать.',
    },
    {
        title: 'Отслеживание присутствия без датчиков',
        description: 'Быстрые команды iPhone и Android плюс Extrahub знают, когда вы подключились к Wi‑Fi дома. Свет встречает вас автоматически и гаснет, когда вы уходите.',
    },
    {
        title: 'Управление с компьютера',
        description: 'Настраивайте и отключайте устройства с ноутбука или настольного ПК — полноценный интерфейс доступен на большом экране.',
    },
]

const heroImage = heroPreview
const moodImage = colorGradient

const steps = [
    {
        label: '1',
        title: 'Выберите устройства',
        description: 'Поддерживаются отдельные лампы и группы. Extrahub понимает комнату, цветовую температуру и совместимость устройств.',
    },
    {
        label: '2',
        title: 'Настройте временную шкалу',
        description: 'Сценарный циферблат показывает рассвет, закат и текущий статус. Просто потяните маркеры или задайте точные значения.',
    },
    {
        label: '3',
        title: 'Сохраните и отслеживайте',
        description: 'Сценарии запускаются автоматически, а журнал событий моментально показывает последние изменения.',
    },
]

function startLogin() {
    showConsentModal.value = true
}

function cancelLogin() {
    showConsentModal.value = false
}

function confirmLogin() {
    showConsentModal.value = false
    auth.login('/scenarios')
}

function openScenarios() {
    router.push({ name: 'scenarios-list' })
}

function openDevices() {
    router.push({ name: 'devices' })
}
</script>

<template>
    <main class="extrahub-landing">
        <section class="hero">
            <div class="hero-text">
                <h1>Интеллектуальные сценарии освещения для Умного дома Яндекс</h1>

                <div class="hero-actions">
                    <button v-if="!isAuthenticated" type="button" class="cta" @click="startLogin">
                        Войти через Яндекс ID
                    </button>
                </div>
            </div>
            <div class="hero-visual" role="presentation" aria-hidden="true">
                <img :src="heroImage" alt="Иллюстрация сценариев освещения" loading="lazy" />
            </div>
        </section>

        <section class="features">
            <h2>Возможности Extrahub</h2>

            <div class="feature-grid">
                <article v-for="feature in features" :key="feature.title" class="feature-card">
                    <div class="feature-card-content">
                        <h3>{{ feature.title }}</h3>
                        <p v-if="feature.footnote && feature.descriptionAnchor" class="feature-description">
                            {{ feature.descriptionBefore }}{{ feature.descriptionAnchor }}<sup
                                class="feature-footnote-ref">{{ feature.footnoteNumber ?? 1 }}</sup>{{
                                    feature.descriptionAfter }}
                        </p>
                        <p v-else class="feature-description">{{ feature.description }}</p>
                        <div v-if="feature.type === 'temperature'" class="temperature-visual" aria-hidden="true">
                            <div class="temperature-scale">
                                <div class="temperature-top">
                                    <div class="temperature-top-label temperature-top-label--cool">6500К</div>
                                    <div class="temperature-top-label temperature-top-label--warm">1700К</div>
                                </div>
                                <div class="temperature-gradient"></div>
                                <div class="temperature-bottom">
                                    <div class="temperature-bottom-label temperature-bottom-label--day">ДЕНЬ</div>
                                    <div class="temperature-bottom-label temperature-bottom-label--evening">ВЕЧЕР</div>
                                </div>
                            </div>
                        </div>
                        <div v-else-if="feature.type === 'mood'" class="mood-visual" aria-hidden="true">
                            <img :src="moodImage" alt="" loading="lazy" />
                        </div>
                    </div>
                    <p v-if="feature.footnote" class="feature-footnote">
                        <span class="feature-footnote-number">{{ feature.footnoteNumber ?? 1 }} - </span>
                        {{ feature.footnote }}
                    </p>
                </article>
            </div>
        </section>

        <section class="steps">
            <div class="steps-header">
                <h2>Как всё работает</h2>
                <p>Всего три шага, чтобы собрать сценарий и следить за его статусом.</p>
            </div>
            <ol>
                <li v-for="step in steps" :key="step.title">
                    <span class="step-label">{{ step.label }}</span>
                    <div>
                        <h3>{{ step.title }}</h3>
                        <p>{{ step.description }}</p>
                    </div>
                </li>
            </ol>
        </section>

        <section class="cta-panel">
            <div>
                <h2>Готовы попробовать Extrahub?</h2>
                <p v-if="!isAuthenticated">
                    Авторизуйтесь через Яндекс ID, чтобы создать первый сценарий, подобрать устройства и включить
                    автоматизацию.
                </p>
                <p v-else>
                    Вы уже в системе — продолжайте с панелью сценариев или проверьте состояние устройств.
                </p>
            </div>
            <div class="cta-panel-actions">
                <button v-if="!isAuthenticated" type="button" class="cta" @click="startLogin">
                    Войти и запустить сценарий
                </button>
                <button v-else type="button" class="cta" @click="openScenarios">
                    Открыть сценарии
                </button>
                <button type="button" class="ghost" @click="openDevices">
                    Каталог устройств
                </button>
            </div>
        </section>
        <transition name="fade">
            <div v-if="showConsentModal" class="landing-consent-overlay" role="dialog" aria-modal="true">
                <div class="landing-consent-backdrop" @click="cancelLogin"></div>
                <section class="landing-consent-panel">
                    <button class="landing-close-btn" type="button" @click="cancelLogin" aria-label="Закрыть">×</button>
                    <h2>Вход</h2>
                    <p class="consent-text">
                        Нажимая кнопку, вы соглашаетесь с
                        <RouterLink class="consent-link" :to="{ name: 'consent' }" target="_blank"
                            rel="noopener noreferrer" @click="cancelLogin">
                            Пользовательским соглашением
                        </RouterLink>
                        и
                        <RouterLink class="consent-link" :to="{ name: 'consent' }" target="_blank"
                            rel="noopener noreferrer" @click="cancelLogin">
                            Политикой обработки персональных данных
                        </RouterLink>
                    </p>
                    <button class="landing-login-btn" type="button" @click="confirmLogin">
                        Войти через Яндекс ID
                    </button>
                </section>
            </div>
        </transition>
    </main>
</template>

<style scoped>
.extrahub-landing {
    padding: 32px 16px 64px;
    display: flex;
    flex-direction: column;
    gap: 48px;
    color: #f8fafc;
}

.hero {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 32px;
    align-items: center;
}

.eyebrow {
    margin: 0 0 8px;
    text-transform: uppercase;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: #93c5fd;
}

.hero-text h1 {
    margin: 0 0 12px;
    font-size: clamp(28px, 5vw, 40px);
    line-height: 1.2;
}

.lead {
    margin: 0 0 20px;
    color: #cbd5f5;
    line-height: 1.5;
}

.hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.cta,
.ghost {
    border: none;
    border-radius: 14px;
    padding: 12px 20px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
}

.cta {
    background: linear-gradient(120deg, #7c3aed, #a855f7);
    color: white;
    box-shadow: 0 12px 35px rgba(124, 58, 237, 0.35);
}

.ghost {
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.4);
    color: #e0f2fe;
}

.hero-visual {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.hero-visual::before {
    content: '';
    position: absolute;
    inset: 12% 4% 8%;
    filter: blur(60px);
    background: radial-gradient(circle at 50% 30%, rgba(147, 197, 253, 0.35), transparent 60%);
    z-index: 0;
}

.hero-visual img {
    width: min(480px, 100%);
    border-radius: 32px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    box-shadow: 0 30px 80px rgba(15, 23, 42, 0.65);
    position: relative;
    z-index: 1;
}

.features h2,
.steps h2 {
    margin: 0 0 12px;
    font-size: 28px;
}

.features-lead {
    margin: 0 0 18px;
    color: #cbd5f5;
    max-width: 560px;
}

.feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 18px;
}

.feature-card {
    background: rgba(15, 23, 42, 0.82);
    border-radius: 18px;
    padding: 20px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    box-shadow: 0 18px 40px rgba(2, 6, 23, 0.45);
    display: flex;
    flex-direction: column;
    height: 100%;
}

.feature-card-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.feature-card h3 {
    margin: 0 0 8px;
}

.feature-card p {
    margin: 0;
    color: #cbd5f5;
}

.feature-footnote-ref {
    font-size: 0.75em;
    line-height: 0;
    vertical-align: super;
    color: rgba(203, 213, 245, 0.85);
}

.feature-footnote-number {
    color: rgba(203, 213, 245, 0.85);
}

.feature-footnote {
    margin-top: 12px;
    padding-top: 12px;
    font-size: 12px;
    color: rgba(203, 213, 245, 0.75);
}

.temperature-visual {
    margin-top: 16px;
}

.temperature-scale {
    position: relative;
    padding: 0;
    display: grid;
    grid-template-rows: auto auto auto;
    gap: 10px;
}

.temperature-top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    font-size: 12px;
    color: #cbd5f5;
}

.temperature-top-label--cool {
    color: #bfdbfe;
}

.temperature-top-label--warm {
    color: #fed7aa;
    text-align: right;
}

.temperature-gradient {
    height: 16px;
    border-radius: 999px;
    background: linear-gradient(90deg,
            #cfe8ff 0%,
            #ffffff 15%,
            #fff7d1 50%,
            #ffd39a 78%,
            #ff8a3d 100%);
    box-shadow: inset 0 0 8px rgba(15, 23, 42, 0.45);
}

.temperature-bottom {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    min-height: 16px;
}

.temperature-bottom-label {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #e0f2fe;
}

.temperature-bottom-label--day {
    color: #bfdbfe;
}

.temperature-bottom-label--evening {
    color: #fed7aa;
}

.mood-visual {
    margin-top: 16px;
}

.mood-visual img {
    width: min(260px, 100%);
    display: block;
    margin: 0 auto;
    border-radius: 18px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    box-shadow: 0 18px 40px rgba(2, 6, 23, 0.45);
}

.steps {
    background: rgba(15, 23, 42, 0.7);
    border-radius: 20px;
    padding: 24px;
    border: 1px solid rgba(148, 163, 184, 0.12);
}

.steps-header p {
    margin: 0 0 16px;
    color: #cbd5f5;
}

.steps ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.steps li {
    display: flex;
    gap: 16px;
    align-items: flex-start;
}

.step-label {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.4);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
}

.steps h3 {
    margin: 0 0 4px;
}

.steps p {
    margin: 0;
    color: #cbd5f5;
}

.cta-panel {
    background: linear-gradient(120deg, rgba(15, 118, 110, 0.9), rgba(6, 78, 59, 0.9));
    border-radius: 24px;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.cta-panel-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

@media (min-width: 720px) {
    .cta-panel {
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
    }

    .cta-panel-actions {
        justify-content: flex-end;
    }
}

.landing-consent-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
}

.landing-consent-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.75);
}

.landing-consent-panel {
    position: relative;
    background: var(--surface-card);
    border-radius: 18px;
    padding: 32px;
    width: min(420px, calc(100% - 48px));
    box-shadow: 0 25px 60px rgba(2, 6, 23, 0.4);
    border: 1px solid var(--surface-border);
    color: var(--text-primary);
    z-index: 1;
    text-align: center;
}

.landing-consent-panel h2 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 22px;
    color: #fafafa;
}

.landing-consent-panel .consent-text {
    margin: 0 0 16px;
    font-size: 13px;
    color: #cbd5f5;
    line-height: 1.6;
}

.landing-consent-panel .consent-link {
    font-size: 13px;
    color: #fbbf24;
    margin: 0 2px;
    text-decoration: none;
}

.landing-consent-panel .consent-link:hover {
    text-decoration: underline;
}

.landing-login-btn {
    width: 100%;
    border: none;
    border-radius: 12px;
    padding: 14px 18px;
    font-size: 16px;
    font-weight: 600;
    color: #0f172a;
    background: linear-gradient(120deg, #ffd54f, #ffb347);
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    margin-bottom: 8px;
}

.landing-login-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 30px rgba(251, 191, 36, 0.35);
}

.landing-close-btn {
    position: absolute;
    top: 10px;
    right: 14px;
    background: transparent;
    border: none;
    font-size: 20px;
    color: #94a3b8;
    cursor: pointer;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
