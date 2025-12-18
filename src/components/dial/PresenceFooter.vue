<script setup>
import { computed } from 'vue'

import SegmentedControl from './SegmentedControl.vue'

const props = defineProps({
    options: {
        type: Array,
        required: true
    },
    value: {
        type: String,
        required: true
    },
    showToggle: {
        type: Boolean,
        default: true
    }
})

const emit = defineEmits(['update:value', 'save', 'delete'])

const segmentedOptions = computed(() =>
    (props.options || []).map((option) => ({
        value: option.id,
        label: option.label
    }))
)

function select(value) {
    if (props.value === value) return
    emit('update:value', value)
}
</script>

<template>
    <section class="presence-section">
        <SegmentedControl v-if="showToggle" aria-label="Режим запуска" :model-value="value"
            @update:model-value="select" :options="segmentedOptions" />
        <div class="action-row" role="group" aria-label="Действия сценария">
            <button type="button" class="ghost" @click="emit('delete')">Удалить</button>
            <button type="button" class="primary" @click="emit('save')">Сохранить</button>
        </div>
    </section>
</template>

<style scoped>
.presence-section {
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
}

.ghost {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #f87171;
}

@media (max-width: 900px) {

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
