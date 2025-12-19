<script setup>
import DialCardButton from './DialCardButton.vue'

const props = defineProps({
    startSummary: {
        type: Object,
        required: true
    },
    endSummary: {
        type: Object,
        required: true
    },
    autoBrightnessActive: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['open-start', 'open-end'])
</script>

<template>
    <ul class="stop-preview">
        <li>
            <DialCardButton @click="emit('open-start')">
                <p class="state-label">Старт</p>
                <template #right>
                    <div v-if="props.startSummary.hasColor || props.startSummary.hasBrightness" class="state-meta">
                        <span v-if="props.startSummary.hasColor || (props.autoBrightnessActive && props.startSummary.hasBrightness)"
                            class="color-swatch" :class="{ pulse: props.autoBrightnessActive && props.startSummary.hasBrightness }"
                            :style="{
                                background: props.startSummary.hasColor ? props.startSummary.colorHex : '#fff4dd',
                                boxShadow: `0 0 0 2px rgba(0,0,0,0.25), 0 0 0 1px ${props.startSummary.hasColor ? props.startSummary.colorHex : '#fff4dd'}`
                            }" aria-hidden="true" />
                        <span v-if="props.startSummary.hasColor && props.startSummary.colorMode === 'temperature'"
                            class="meta-value">
                            {{ props.startSummary.temperature }}K
                        </span>
                        <span v-if="props.startSummary.hasBrightness" class="meta-value">
                            {{ props.autoBrightnessActive ? 'Авто' : `${Math.round(props.startSummary.brightness)}%` }}
                        </span>
                    </div>
                    <span v-else class="state-placeholder">{{ props.startSummary.placeholder }}</span>
                </template>
            </DialCardButton>
        </li>
        <li>
            <DialCardButton @click="emit('open-end')">
                <p class="state-label">Финиш</p>
                <template #right>
                    <div v-if="props.endSummary.hasColor || props.endSummary.hasBrightness" class="state-meta">
                        <span v-if="props.endSummary.hasColor || (props.autoBrightnessActive && props.endSummary.hasBrightness)"
                            class="color-swatch" :class="{ pulse: props.autoBrightnessActive && props.endSummary.hasBrightness }"
                            :style="{
                                background: props.endSummary.hasColor ? props.endSummary.colorHex : '#fff4dd',
                                boxShadow: `0 0 0 2px rgba(0,0,0,0.25), 0 0 0 1px ${props.endSummary.hasColor ? props.endSummary.colorHex : '#fff4dd'}`
                            }" aria-hidden="true" />
                        <span v-if="props.endSummary.hasColor && props.endSummary.colorMode === 'temperature'"
                            class="meta-value">
                            {{ props.endSummary.temperature }}K
                        </span>
                        <span v-if="props.endSummary.hasBrightness" class="meta-value">
                            {{ props.autoBrightnessActive ? 'Авто' : `${Math.round(props.endSummary.brightness)}%` }}
                        </span>
                    </div>
                    <span v-else class="state-placeholder">{{ props.endSummary.placeholder }}</span>
                </template>
            </DialCardButton>
        </li>
    </ul>
</template>

<style scoped>
.stop-preview {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.state-label {
    margin: 0;
    font-weight: 600;
    color: var(--text-primary);
    text-align: left;
    font-size: 15px;
}

.state-meta {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
}

.color-swatch {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    flex: 0 0 auto;
}

.color-swatch.hidden {
    visibility: hidden;
}

.color-swatch.pulse {
    animation: swatch-pulse 4.5s ease-in-out infinite;
}

@keyframes swatch-pulse {
    0% {
        opacity: 0.6;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0.6;
    }
}

.meta-value {
    color: var(--text-subtle);
    font-size: 14px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

.state-value {
    color: var(--text-subtle);
    font-size: 14px;
    white-space: nowrap;
}

.state-placeholder {
    color: var(--text-muted);
    font-size: 14px;
    white-space: nowrap;
}

</style>
