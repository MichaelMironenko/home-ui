<script setup>
const props = defineProps({
    title: { type: String, required: true },
    hint: { type: String, default: '' },
    resetLabel: { type: String, default: 'Сбросить' },
    showReset: { type: Boolean, default: true },
    resetDisabled: { type: Boolean, default: false }
})

const emit = defineEmits(['reset'])
</script>

<template>
    <div class="chart-block">
        <header class="section-head">
            <div>
                <h2>{{ title }}</h2>
                <p v-if="hint" class="hint">{{ hint }}</p>
            </div>
            <button
                v-if="showReset"
                type="button"
                class="chart-reset"
                :disabled="resetDisabled"
                @click="emit('reset')"
            >
                {{ props.resetLabel }}
            </button>
        </header>
        <slot />
    </div>
</template>
