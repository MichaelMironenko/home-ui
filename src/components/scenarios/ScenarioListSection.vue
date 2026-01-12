<script setup>
import { useRouter } from 'vue-router'

const props = defineProps({
    scenarios: {
        type: Array,
        default: () => []
    },
    hasScenarios: {
        type: Boolean,
        default: false
    },
    activeScenarioId: {
        type: [String, Number],
        default: null
    },
    toggling: {
        type: Object,
        default: () => ({})
    },
    scenarioStatusDisplay: {
        type: Function,
        required: true
    },
    scenarioKey: {
        type: Function,
        required: true
    },
    scenarioCardId: {
        type: Function,
        required: true
    }
})

const emit = defineEmits(['toggle-pause', 'hover', 'hover-clear'])
const router = useRouter()

function scenarioLinkLocation(item) {
    if (!item || !item.id) return null
    if (item.type === 'auto-light-v1') {
        return { name: 'auto-light-edit', params: { id: item.id } }
    }
    return { name: 'scenario-edit', params: { id: item.id } }
}

function scenarioLinkHref(item) {
    const location = scenarioLinkLocation(item)
    if (!location) return '#'
    const resolved = router.resolve(location)
    if (resolved?.href) return resolved.href
    return resolved?.fullPath || '#'
}

function openScenario(item) {
    const location = scenarioLinkLocation(item)
    if (!location) return
    router.push(location)
}

function openScenarioInNewTab(item) {
    const href = scenarioLinkHref(item)
    if (!href || href === '#') return
    window.open(href, '_blank', 'noopener')
}

function handleCardClick(item, event) {
    if (!event || event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    openScenario(item)
}

function handleCardAuxClick(item, event) {
    if (event?.button === 1) {
        event.preventDefault()
        openScenarioInNewTab(item)
    }
}

function handleCardEnter(item) {
    openScenario(item)
}

function createScenario() {
    router.push({ name: 'scenario-create' })
}

function isPaused(item) {
    return !!item?.pause
}

function canTogglePause(item) {
    const kind = props.scenarioStatusDisplay(item).kind
    return kind === 'running' || kind === 'paused'
}
</script>

<template>
    <div class="scenario-list">
        <article v-if="!hasScenarios" class="empty onboarding">
            <h2>У вас пока нет сценариев</h2>
            <p>Создайте первый сценарий, чтобы автоматизировать свет или настроить собственные правила.</p>
            <ul>
                <li>Выберите устройства и группы, которые нужно контролировать.</li>
                <li>Задайте временное окно и условия запуска.</li>
                <li>Сохраните и протестируйте сценарий прямо из редактора.</li>
            </ul>
            <article class="scenario-card create-card">
                <button class="create-card-button" type="button" @click="createScenario">
                    + Создать сценарий
                </button>
            </article>
        </article>

        <template v-else>
            <article class="scenario-card create-card">
                <button class="create-card-button" type="button" @click="createScenario">
                    + Создать сценарий
                </button>
            </article>
            <article v-for="item in scenarios" :key="item.id || item.key || item.name" class="scenario-card" :class="{
                paused: isPaused(item),
                disabled: item.disabled,
                active: scenarioKey(item) === activeScenarioId
            }" :id="scenarioCardId(item)" role="link" tabindex="0" @keyup.enter="handleCardEnter(item)"
                @mouseenter="emit('hover', scenarioKey(item))" @mouseleave="emit('hover-clear', scenarioKey(item))">
                <a class="card-link-overlay" :href="scenarioLinkHref(item)"
                    :aria-label="'Открыть сценарий «' + (item.name || 'Без имени') + '»'"
                    @click="handleCardClick(item, $event)" @auxclick="handleCardAuxClick(item, $event)" />
                <header class="card__header">
                    <div class="card__title">
                        <h2>{{ item.name }}</h2>
                        <p class="status" :class="`status--${scenarioStatusDisplay(item).kind}`">
                            <span>{{ scenarioStatusDisplay(item).label }}</span>
                        </p>
                    </div>
                    <button v-if="canTogglePause(item)" type="button" class="card-pause"
                        :disabled="toggling[item.id] || item.disabled"
                        :aria-label="isPaused(item) ? 'Возобновить' : 'Пауза'"
                        @click.stop="emit('toggle-pause', item)">
                        <span v-if="isPaused(item)">▶</span>
                        <span v-else>⏸</span>
                    </button>
                </header>
            </article>
        </template>
    </div>
</template>

<style scoped>
.scenario-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    z-index: 1;
}

.scenario-card {
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: none;
    position: relative;
    transition: transform var(--transition-base), border-color var(--transition-base),
        background var(--transition-base), box-shadow var(--transition-base);
}

.scenario-card:hover {
    border-color: var(--surface-border-strong);
    background: var(--surface-hover);
}

.scenario-card.active {
    border-color: rgba(56, 189, 248, 0.8);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.45), 0 0 18px rgba(56, 189, 248, 0.2);
}

.scenario-card:active,
.scenario-card:has(.card-link-overlay:active) {
    transform: scale(0.95);
}

.scenario-card.paused {
    border-color: rgba(249, 115, 22, 0.55);
    box-shadow: none;
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
    position: relative;
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.status span {
    position: relative;
}

.status--running {
    color: #34d399;
    animation: status-shimmer 2.5s ease-in-out infinite;
}

.status--running::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.7);
}

.status--paused {
    color: #facc15;
}

.status--off {
    color: var(--text-muted);
}

.status--waiting {
    color: #93c5fd;
}

.card-pause {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.65);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    position: relative;
    z-index: 3;
    cursor: pointer;
}

.create-card {
    border-style: dashed;
    background: rgba(15, 23, 42, 0.45);
}

.create-card-button {
    width: 100%;
    padding: 0;
    border-radius: 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
}

.card-pause:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.card-link-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    z-index: 2;
    display: block;
    cursor: pointer;
}

.card-link-overlay:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.4);
    outline-offset: -6px;
}

.card__header,
.card__title,
.status {
    position: relative;
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

.onboarding {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
}

.onboarding h2 {
    margin: 0;
    color: var(--text-primary);
}

.onboarding ul {
    list-style: disc;
    padding-left: 20px;
    text-align: left;
    margin: 0;
    color: var(--text-muted);
}

@keyframes status-shimmer {
    0% {
        filter: none;
    }

    50% {
        filter: drop-shadow(0 0 6px rgba(52, 211, 153, 0.8));
    }

    100% {
        filter: none;
    }
}
</style>
