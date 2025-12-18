<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const props = defineProps({
    modelValue: {
        type: [String, Number, Boolean],
        default: null
    },
    options: {
        type: Array,
        default: () => []
    },
    disabled: {
        type: Boolean,
        default: false
    },
    ariaLabel: {
        type: String,
        default: null
    },
    dense: {
        type: Boolean,
        default: false
    },
    fit: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits(['update:modelValue'])

const optionCount = computed(() => (Array.isArray(props.options) ? props.options.length : 0))
const activeIndex = computed(() => {
    const options = Array.isArray(props.options) ? props.options : []
    const index = options.findIndex((option) => option?.value === props.modelValue)
    return index >= 0 ? index : 0
})

const segmentedRef = ref(null)
const optionElementMap = new Map()
const indicatorMetrics = reactive({
    left: 0,
    width: 0,
    ready: false
})
let resizeObserver = null

function setOptionRef(el, value) {
    if (!value) return
    if (el) optionElementMap.set(value, el)
    else optionElementMap.delete(value)
}

async function updateIndicatorMetrics() {
    if (!props.fit) {
        indicatorMetrics.ready = false
        return
    }
    await nextTick()
    const container = segmentedRef.value
    if (!container) return
    const options = Array.isArray(props.options) ? props.options : []
    const fallbackValue = options[0]?.value
    const activeValue = props.modelValue ?? fallbackValue
    const activeEl = optionElementMap.get(activeValue) || optionElementMap.get(fallbackValue)
    if (!activeEl) return
    indicatorMetrics.left = activeEl.offsetLeft || 0
    indicatorMetrics.width = activeEl.offsetWidth || 0
    indicatorMetrics.ready = indicatorMetrics.width > 0
}

function selectOption(value) {
    emit('update:modelValue', value)
}

onMounted(() => {
    updateIndicatorMetrics()
    if (window.ResizeObserver) {
        resizeObserver = new ResizeObserver(() => {
            updateIndicatorMetrics()
        })
        if (segmentedRef.value) resizeObserver.observe(segmentedRef.value)
    } else {
        window.addEventListener('resize', updateIndicatorMetrics, { passive: true })
    }
})

onBeforeUnmount(() => {
    if (resizeObserver) resizeObserver.disconnect()
    else window.removeEventListener('resize', updateIndicatorMetrics)
})

watch(
    () => [props.modelValue, props.options, props.dense, props.fit],
    () => {
        updateIndicatorMetrics()
    },
    { deep: true }
)
</script>

<template>
    <div class="segmented" :class="{ dense, fit }" ref="segmentedRef" role="group" :aria-label="ariaLabel || undefined"
        :style="{ '--count': optionCount, '--index': activeIndex }">
        <div v-if="optionCount > 0" class="segmented-indicator" aria-hidden="true" :style="fit && indicatorMetrics.ready
            ? { left: '0px', width: `${indicatorMetrics.width}px`, transform: `translateX(${indicatorMetrics.left}px)` }
            : undefined" />
        <button v-for="option in options" :key="String(option?.value)" type="button"
            :disabled="disabled || Boolean(option?.disabled)" :class="{ active: option?.value === modelValue }"
            :ref="(el) => setOptionRef(el, option?.value)" @click="selectOption(option?.value)">
            {{ option?.label }}
        </button>
    </div>
</template>

<style scoped>
.segmented {
    display: flex;
    width: 100%;
    background: var(--segmented-bg, rgba(3, 7, 18, 0.9));
    border-radius: 12px;
    padding: 4px;
    gap: var(--segmented-gap, 4px);
    position: relative;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
}

.segmented.dense {
    margin: 0;
    padding: 4px;
    border-radius: 12px;
}

.segmented.fit {
    width: fit-content;
    max-width: 100%;
}

.segmented-indicator {
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: calc((100% - 8px - (max(var(--count), 1) - 1) * var(--segmented-gap, 4px)) / max(var(--count), 1));
    transform: translateX(calc(var(--index) * (100% + var(--segmented-gap, 4px))));
    border-radius: 10px;
    background: var(--segmented-active-bg, var(--surface-card, rgba(11, 18, 35, 1)));
    transition: transform 140ms ease-out;
    will-change: transform;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 10px 24px rgba(0, 0, 0, 0.25);
    z-index: 0;
}

.segmented button {
    flex: 1;
    border: none;
    background: transparent;
    color: #94a3b8;
    border-radius: 10px;
    padding: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    position: relative;
    z-index: 1;
}

.segmented.dense button {
    border-radius: 8px;
}

.segmented.fit button {
    flex: 0 0 auto;
}

.segmented button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.segmented button.active {
    color: var(--text-primary, rgba(226, 232, 240, 1));
}

@media (prefers-reduced-motion: reduce) {
    .segmented-indicator {
        transition: none;
    }
}
</style>
