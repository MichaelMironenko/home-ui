<script setup>
import { computed } from 'vue'

const props = defineProps({
    createMode: {
        type: Boolean,
        default: false
    },
    saving: {
        type: Boolean,
        default: false
    },
    dirty: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['save', 'cancel'])

const primaryLabel = computed(() => (props.createMode ? 'Создать' : 'Сохранить'))
</script>

<template>
    <section class="actions-footer">
        <div class="action-row" role="group" aria-label="Действия сценария">
            <button type="button" class="ghost" :disabled="saving" @click="emit('cancel')">
                Отмена
            </button>
            <button type="button" class="primary" :class="{ 'is-saving': saving }" :disabled="saving"
                @click="emit('save')">
                <span v-if="saving">Сохранение…</span>
                <span v-else>{{ primaryLabel }}</span>
            </button>
        </div>
    </section>
</template>

<style scoped>
.actions-footer {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.action-row {
    display: flex;
    gap: 12px;
}

.primary,
.ghost {
    flex: 1;
    border: none;
    border-radius: 16px;
    padding: 14px;
    font-size: 16px;
    font-weight: 600;
}

.primary {
    background: #7c3aed;
    color: white;
    position: relative;
    overflow: hidden;
}

.primary.is-saving::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(120deg, rgba(255, 255, 255, 0) 20%, rgba(255, 255, 255, 0.35) 50%, rgba(255, 255, 255, 0) 80%);
    z-index: 0;
    pointer-events: none;
    transform: translateX(-100%);
    animation: shimmer 1.3s ease-in-out infinite;
}

.primary > span {
    position: relative;
    z-index: 1;
}

.ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #f87171;
}

@keyframes shimmer {
    0% {
        transform: translateX(-100%);
    }

    100% {
        transform: translateX(100%);
    }
}

@media (max-width: 499px) {

    .action-row {
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        width: min(520px, calc(100% - 24px));
        padding: 12px;
        border-radius: 18px;
        background: rgba(12, 19, 36, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.06);
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(18px) saturate(180%);
        z-index: 12;
    }
}
</style>
