<script setup>
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { setDocumentDescription, setDocumentTitle } from '../utils/pageTitle'

const route = useRoute()
const auth = useAuth()

watchEffect(() => {
    setDocumentTitle('Вход')
    setDocumentDescription('Авторизуйтесь через Яндекс ID, чтобы управлять сценариями света и устройствами в ExtraHub.')
})

const redirectUrl = computed(() => {
    const raw = route.query.redirect
    if (typeof raw === 'string' && raw.length) {
        try {
            const url = new URL(raw, window.location.origin)
            return url.toString()
        } catch (_) {
            return window.location.origin + raw
        }
    }
    return window.location.href
})

const errorMessage = computed(() => {
    const err = route.query.loginError
    if (typeof err !== 'string' || !err.length) return ''
    if (err === 'access_denied') return 'Доступ не предоставлен. Попробуйте ещё раз.'
    if (err === 'no_code') return 'Авторизация не завершена. Попробуйте снова.'
    return 'Не удалось выполнить вход. Попробуйте снова.'
})

const showConsentOverlay = ref(false)

function startLogin() {
    showConsentOverlay.value = true
}

function cancelConsent() {
    showConsentOverlay.value = false
}

function confirmConsent() {
    showConsentOverlay.value = false
    auth.login(redirectUrl.value)
}
</script>

<template>
    <main class="login-view">
        <section class="login-card">
            <h1>Вход</h1>
            <p class="lead">
                Чтобы обеспечить управление домом, требуется авторизация через Яндекс ID.
            </p>
            <p class="hint">
                После входа вы вернётесь на страницу <strong>{{ route.query.redirect || '/' }}</strong>.
            </p>
            <p v-if="errorMessage" class="error">
                {{ errorMessage }}
            </p>
            <button type="button" class="login-btn" @click="startLogin">
                Вход
            </button>
            <p class="policy-link">
                Продолжая, вы подтверждаете, что ознакомились с
                <RouterLink :to="{ name: 'consent' }" target="_blank" rel="noopener noreferrer">
                    Согласием на обработку персональных данных
                </RouterLink>.
            </p>
        </section>

        <transition name="fade">
            <div v-if="showConsentOverlay" class="consent-overlay" role="dialog" aria-modal="true">
                <div class="consent-backdrop" @click="cancelConsent"></div>
                <section class="consent-panel">
                    <button class="close-btn" type="button" @click="cancelConsent" aria-label="Закрыть">×</button>
                    <h2>Вход</h2>
                    <p class="consent-text">
                        Нажимая кнопку, вы соглашаетесь с:
                    </p>
                    <ul>
                        <li>☑ Пользовательским соглашением</li>
                        <li>
                            ☑
                            <RouterLink :to="{ name: 'consent' }" @click="cancelConsent">
                                Политикой обработки персональных данных
                            </RouterLink>
                        </li>
                    </ul>
                    <button class="login-btn filled" type="button" @click="confirmConsent">
                        Войти через Яндекс ID
                    </button>
                </section>
            </div>
        </transition>
    </main>
</template>

<style scoped>
.login-view {
    min-height: calc(100vh - 80px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 16px;
}

.login-card {
    width: min(420px, 100%);
    background: #111827;
    border-radius: 16px;
    padding: 32px;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.4);
    text-align: center;
}

h1 {
    margin: 0 0 12px;
    font-size: 28px;
    color: #f8fafc;
}

.lead {
    margin: 0 0 8px;
    color: #cbd5f5;
}

.hint {
    margin: 0 0 24px;
    color: #94a3b8;
}

.error {
    color: #fecaca;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.4);
    padding: 8px 12px;
    border-radius: 8px;
    margin-bottom: 16px;
}

.login-btn {
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
}

.login-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 30px rgba(251, 191, 36, 0.35);
}

.policy-link {
    margin-top: 16px;
    font-size: 14px;
    color: #cbd5f5;
}

.policy-link a {
    color: #facc15;
    text-decoration: none;
}

.consent-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
}

.consent-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.85);
}

.consent-panel {
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

.consent-panel h2 {
    margin-top: 0;
    margin-bottom: 12px;
    font-size: 22px;
    color: #fafafa;
}

.consent-text {
    margin: 0 0 12px;
    font-size: 14px;
    color: var(--text-muted);
}

.consent-panel ul {
    list-style: none;
    padding: 0;
    margin: 0 0 20px;
    text-align: left;
    color: #f8fafc;
    line-height: 1.7;
}

.consent-panel li {
    margin-bottom: 6px;
}

.consent-panel li a {
    color: #fbbf24;
}

.consent-panel .login-btn {
    margin-bottom: 8px;
}

.consent-panel .login-btn.filled {
    background: linear-gradient(120deg, #facc15, #f97316);
    color: #0f172a;
}

.cancel-btn {
    width: 100%;
    border: 1px solid rgba(148, 163, 184, 0.5);
    border-radius: 12px;
    padding: 12px 18px;
    font-size: 14px;
    font-weight: 600;
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
}

.cancel-btn:hover {
    border-color: rgba(248, 113, 113, 0.6);
    color: #fecaca;
}

.close-btn {
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
