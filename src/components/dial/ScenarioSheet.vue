<script setup>
import BottomSheet from './BottomSheet.vue'

const props = defineProps({
    open: {
        type: Boolean,
        default: false
    },
    title: {
        type: String,
        default: ''
    },
    maxHeight: {
        type: String,
        default: '95vh'
    },
    maxWidth: {
        type: String,
        default: '600px'
    },
    applyLabel: {
        type: String,
        default: 'ок'
    },
    closeLabel: {
        type: String,
        default: 'Закрыть'
    },
    zIndex: {
        type: Number,
        default: 40
    }
})

const emit = defineEmits(['close', 'apply'])
</script>

<template>
    <BottomSheet :open="open" :title="title" :max-height="maxHeight" :max-width="maxWidth" :z-index="zIndex"
        :close-label="closeLabel" @close="emit('close')">
        <template #actions>
            <button type="button" class="stop-state-apply" @click="emit('apply')">
                {{ applyLabel }}
            </button>
        </template>
        <slot />
    </BottomSheet>
</template>

<style scoped>
.stop-state-apply {
    border: none;
    background: transparent;
    color: var(--primary);
    font-size: 1.5rem;
    font-weight: 600;
    border-radius: 10px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}

.stop-state-apply:active {
    background: rgba(168, 85, 247, 0.16);
}
</style>
