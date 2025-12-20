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

const openTooltipFor = ref(null)
let tooltipCloseHandler = null

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

function isOptionDisabled(option) {
    return Boolean(option?.disabled)
}

function handleOptionClick(option) {
    if (!option) return
    if (props.disabled) return
    if (isOptionDisabled(option)) return
    selectOption(option?.value)
}

function closeTooltip() {
    openTooltipFor.value = null
}

function toggleTooltip(value) {
    openTooltipFor.value = openTooltipFor.value === value ? null : value
}

function handleTooltipKeydown(event, value) {
    if (!event) return
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggleTooltip(value)
    } else if (event.key === 'Escape') {
        event.preventDefault()
        closeTooltip()
    }
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
    if (tooltipCloseHandler) {
        document.removeEventListener('pointerdown', tooltipCloseHandler, true)
        document.removeEventListener('keydown', tooltipCloseHandler, true)
        tooltipCloseHandler = null
    }
})

watch(
    () => [props.modelValue, props.options, props.dense, props.fit],
    () => {
        updateIndicatorMetrics()
    },
    { deep: true }
)

watch(
    () => openTooltipFor.value,
    (value) => {
        if (!value) {
            if (tooltipCloseHandler) {
                document.removeEventListener('pointerdown', tooltipCloseHandler, true)
                document.removeEventListener('keydown', tooltipCloseHandler, true)
                tooltipCloseHandler = null
            }
            return
        }
        if (tooltipCloseHandler) return
        tooltipCloseHandler = (event) => {
            if (event?.type === 'keydown') {
                if (event.key === 'Escape') closeTooltip()
                return
            }
            const root = segmentedRef.value
            const target = event?.target
            if (root && target && root.contains(target)) return
            closeTooltip()
        }
        document.addEventListener('pointerdown', tooltipCloseHandler, true)
        document.addEventListener('keydown', tooltipCloseHandler, true)
    }
)
</script>

<template>
    <div class="segmented" :class="{ dense, fit }" ref="segmentedRef" role="group" :aria-label="ariaLabel || undefined"
        :style="{ '--count': optionCount, '--index': activeIndex }">
        <div v-if="optionCount > 0" class="segmented-indicator" aria-hidden="true" :style="fit && indicatorMetrics.ready
            ? { left: '0px', width: `${indicatorMetrics.width}px`, transform: `translateX(${indicatorMetrics.left}px)` }
            : undefined" />
        <button v-for="option in options" :key="String(option?.value)" type="button" :disabled="disabled"
            :aria-disabled="(!disabled && isOptionDisabled(option)) || undefined"
            :class="{ active: option?.value === modelValue, disabled: !disabled && isOptionDisabled(option) }"
            :ref="(el) => setOptionRef(el, option?.value)" @click="handleOptionClick(option)">
            <span class="segmented-label">{{ option?.label }}</span>
            <span v-if="option?.warning || option?.tooltip" class="segmented-help" role="button" tabindex="0"
                :class="{ warning: option?.warning }" :title="option?.tooltip || ''"
                @click.stop="toggleTooltip(option?.value)" @keydown="handleTooltipKeydown($event, option?.value)">
                i
            </span>
            <div v-if="openTooltipFor === option?.value && option?.tooltip" class="segmented-tooltip" role="tooltip">
                {{ option?.tooltip }}
            </div>
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
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

.segmented button.disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.segmented button.active {
    color: var(--text-primary, rgba(226, 232, 240, 1));
}

.segmented-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.segmented-help {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.55);
    color: rgba(148, 163, 184, 0.95);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    line-height: 1;
    font-weight: 700;
    cursor: help;
    user-select: none;
    flex: 0 0 auto;
}

.segmented-help.warning {
    border-color: rgba(251, 191, 36, 0.75);
    color: rgba(251, 191, 36, 0.95);
}

.segmented-tooltip {
    position: absolute;
    z-index: 10;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(100% + 8px);
    width: min(260px, calc(100vw - 48px));
    padding: 10px 12px;
    border-radius: 12px;
    background: rgba(11, 18, 35, 0.98);
    color: rgba(226, 232, 240, 1);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.25;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
    pointer-events: none;
}

.segmented-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 12px;
    height: 12px;
    background: rgba(11, 18, 35, 0.98);
    clip-path: polygon(0 0, 100% 0, 50% 100%);
}

@media (prefers-reduced-motion: reduce) {
    .segmented-indicator {
        transition: none;
    }
}
</style>
