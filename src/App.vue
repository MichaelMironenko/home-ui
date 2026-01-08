<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from './composables/useAuth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const isLoginRoute = computed(() => route.name === 'login')
const currentUser = computed(() => auth.user.value)
const profileInitial = computed(() => {
    const value = currentUser.value?.email || currentUser.value?.login || ''
    const clean = String(value || '').trim()
    return clean ? clean.charAt(0).toUpperCase() : ''
})

const isScenariosRoute = computed(() => {
    const path = route.path || ''
    return (
        path.startsWith('/scenarios') ||
        path.startsWith('/auto-light')
    )
})

async function logout() {
    await auth.logout()
    router.push({ name: 'login', query: { redirect: route.fullPath || '/' } })
}
</script>

<template>
    <div class="app-shell">
        <header v-if="!isLoginRoute" class="app-header">
            <h1>Smart Home</h1>
            <nav>
                <RouterLink to="/scenarios" class="nav-link" active-class="active">Сценарии</RouterLink>
                <RouterLink to="/devices" class="nav-link" exact-active-class="active">Устройства</RouterLink>
                <RouterLink to="/events" class="nav-link" active-class="active">История</RouterLink>
            </nav>
            <RouterLink v-if="currentUser" :to="{ name: 'profile' }" class="profile-badge"
                :title="currentUser.email || 'Профиль'">
                {{ profileInitial }}
            </RouterLink>
        </header>

        <router-view />

        <footer v-if="!isLoginRoute" class="mobile-tabbar" role="navigation" aria-label="Главные разделы">
            <RouterLink :to="{ name: 'scenarios-list' }" class="tab-link" :class="{ active: isScenariosRoute }">
                <span class="icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                            d="M6.5 5.25h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1 0-1.5Zm0 6h11a.75.75 0 0 1 0 1.5h-11a.75.75 0 0 1 0-1.5Zm0 6h6.5a.75.75 0 0 1 0 1.5H6.5a.75.75 0 0 1 0-1.5Z"
                            fill="currentColor" />
                        <circle cx="4.25" cy="6" r="1" fill="currentColor" />
                        <circle cx="4.25" cy="12" r="1" fill="currentColor" />
                        <circle cx="4.25" cy="18" r="1" fill="currentColor" />
                    </svg>
                </span>
                <span class="label">Сценарии</span>
            </RouterLink>

            <RouterLink :to="{ name: 'devices' }" class="tab-link" :class="{ active: route.name === 'devices' }">
                <span class="icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                            d="M4.75 10.75 12 4l7.25 6.75V20a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.25h-2.5V20a.75.75 0 0 1-.75.75H5.5a.75.75 0 0 1-.75-.75z"
                            fill="currentColor" />
                    </svg>
                </span>
                <span class="label">Устройства</span>
            </RouterLink>

            <RouterLink :to="{ name: 'events' }" class="tab-link" :class="{ active: route.name === 'events' }">
                <span class="icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                            d="M6.75 4a.75.75 0 0 1 .75.75V6h9V4.75a.75.75 0 0 1 1.5 0V6H19a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 19 20H5a1.75 1.75 0 0 1-1.75-1.75V7.75A1.75 1.75 0 0 1 5 6h.5V4.75A.75.75 0 0 1 6.25 4h.5Zm11.5 7.5h-13v6a.25.25 0 0 0 .25.25h12.5a.25.25 0 0 0 .25-.25zm0-1.5V8.25A.25.25 0 0 0 18.25 8H5.75a.25.25 0 0 0-.25.25V10z"
                            fill="currentColor" />
                        <rect x="7" y="11.5" width="2.25" height="2.25" rx=".5" fill="currentColor" />
                        <rect x="7" y="15" width="2.25" height="2.25" rx=".5" fill="currentColor" />
                        <rect x="10.875" y="11.5" width="2.25" height="2.25" rx=".5" fill="currentColor" />
                        <rect x="10.875" y="15" width="2.25" height="2.25" rx=".5" fill="currentColor" />
                        <rect x="14.75" y="11.5" width="2.25" height="2.25" rx=".5" fill="currentColor" />
                        <rect x="14.75" y="15" width="2.25" height="2.25" rx=".5" fill="currentColor" />
                    </svg>
                </span>
                <span class="label">История</span>
            </RouterLink>
        </footer>
    </div>
</template>

<style scoped>
.app-shell {
    min-height: 100vh;
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
    background: var(--bg-primary);
    color: var(--text-primary);
    position: relative;
}

.app-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 24px;
    background: var(--surface-muted);
    color: var(--text-primary);
    border-bottom: 1px solid var(--surface-border);
    position: sticky;
    top: 0;
    z-index: 6;
    backdrop-filter: blur(18px) saturate(160%);
    background: rgba(17, 24, 39, 0.85);
}

.app-header h1 {
    margin: 0;
    font-size: 22px;
}

nav {
    display: flex;
    gap: 14px;
}

.nav-link {
    color: var(--text-muted);
    text-decoration: none;
    font-weight: 500;
    transition: color var(--transition-base);
}

.nav-link:hover {
    color: var(--text-primary);
}

.nav-link.active {
    color: var(--primary);
}

.user-section {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(30, 41, 59, 0.5);
    padding: 10px 16px;
    border-radius: 12px;
}

.user-info {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}

.user-name {
    font-weight: 600;
    color: var(--text-primary);
}

.user-email {
    font-size: 12px;
    color: var(--text-muted);
}

.logout-btn {
    border: none;
    border-radius: 8px;
    padding: 6px 12px;
    font-weight: 600;
    background: var(--danger);
    color: var(--bg-primary);
    cursor: pointer;
}

.logout-btn:hover {
    background: #f87171;
}

.profile-badge {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: rgba(168, 85, 247, 0.15);
    color: var(--primary);
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    border: 1px solid transparent;
}

.profile-badge:hover {
    border-color: rgba(168, 85, 247, 0.5);
}

.mobile-tabbar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    width: min(520px, calc(100% - 24px));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px;
    background: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.06), transparent 35%),
        radial-gradient(circle at 80% 0%, rgba(168, 85, 247, 0.1), transparent 38%),
        rgba(15, 23, 42, 0.82);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 32px;
    backdrop-filter: blur(18px) saturate(180%);
    z-index: 10;
}

.tab-link {
    flex: 1;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 7px 8px;
    color: var(--text-muted);
    text-decoration: none;
    font-size: 10px;
    font-weight: 600;
    border-radius: 14px;
    transition: color var(--transition-base), background var(--transition-base), transform var(--transition-base);
}

.tab-link .icon {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
}

.tab-link .icon svg {
    width: 22px;
    height: 22px;
}

.tab-link.active {
    color: var(--text-primary);
    background: linear-gradient(145deg, rgba(168, 85, 247, 0.16), rgba(126, 34, 206, 0.1));
    box-shadow: 0 10px 30px rgba(168, 85, 247, 0.25);
}

.tab-link:hover {
    color: var(--text-primary);
    background: rgba(148, 163, 184, 0.12);
}

.tab-link:active {
    transform: scale(0.95);
}

@media (max-width: 900px) {
    .app-shell {
        padding-bottom: 110px;
    }

    .app-header {
        padding: 8px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .app-header h1 {
        font-size: 18px;
    }

    .app-header nav {
        display: none;
    }

    .profile-badge {
        margin-left: auto;
    }

    .mobile-tabbar {
        display: flex;
    }

    :global(.page-shell) {
        padding-bottom: 120px;
    }
}

@media (min-width: 901px) {
    .mobile-tabbar {
        display: none;
    }
}
</style>
