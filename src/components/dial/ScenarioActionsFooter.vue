<script setup>
import { computed } from 'vue'

const props = defineProps({
    createMode: {
        type: Boolean,
        default: false
    },
    canDelete: {
        type: Boolean,
        default: true
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

const emit = defineEmits(['save', 'delete'])

const primaryLabel = computed(() => (props.createMode ? 'Создать' : 'Сохранить'))
</script>

<template>
    <section class="actions-footer">
        <p v-if="dirty" class="dirty-hint">Есть несохраненные изменения</p>
        <div class="action-row" role="group" aria-label="Действия сценария">
            <button v-if="canDelete" type="button" class="ghost" :disabled="saving" @click="emit('delete')">
                Удалить
            </button>
            <button type="button" class="primary" :disabled="saving" @click="emit('save')">
                {{ primaryLabel }}
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

.dirty-hint {
    margin: 0;
    font-size: 13px;
    color: rgba(248, 250, 252, 0.7);
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
}

.ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #f87171;
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
