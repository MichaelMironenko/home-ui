<script setup>
defineProps({
    disabled: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['click'])
</script>

<template>
    <button type="button" class="dial-card-button" :disabled="disabled" @click="emit('click')">
        <div class="dial-card-left">
            <slot />
        </div>
        <div class="dial-card-right">
            <slot name="right" />
            <span class="dial-card-chevron" aria-hidden="true">›</span>
        </div>
    </button>
</template>

<style scoped>
.dial-card-button {
    width: 100%;
    border: 1px solid var(--surface-border);
    background: var(--surface-card);
    border-radius: 16px;
    padding: 16px;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
    transition: border-color var(--transition-base), background var(--transition-base), transform var(--transition-base);
}

.dial-card-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.dial-card-button:not(:disabled) {
    cursor: pointer;
}

.dial-card-button:not(:disabled):active {
    transform: translateY(1px);
}

.dial-card-left {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.dial-card-right {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  flex: 0 0 auto;
  min-width: 0;
}

.dial-card-chevron {
    color: var(--text-muted);
    font-weight: 400;
    font-size: 30px;
    line-height: 1;
    flex: 0 0 auto;
}
</style>
