<script setup>
const props = defineProps({
    modelValue: { type: String, default: 'always' },
    choices: {
        type: Array,
        default: () => ([
            { value: 'always', label: 'Всегда' },
            { value: 'onlyWhenHome', label: 'Когда кто-то дома' },
            { value: 'onlyWhenAway', label: 'Когда никого нет дома' }
        ])
    },
    name: { type: String, default: 'presence-mode' },
    disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

function handleChange(event) {
    emit('update:modelValue', event.target.value)
}
</script>

<template>
    <div class="presence-options">
        <label
            v-for="choice in choices"
            :key="choice.value"
            :class="['presence-option', { active: modelValue === choice.value, disabled }]"
        >
            <input
                type="radio"
                :name="name"
                :value="choice.value"
                :checked="modelValue === choice.value"
                :disabled="disabled"
                @change="handleChange"
            />
            <span>{{ choice.label }}</span>
        </label>
    </div>
</template>
