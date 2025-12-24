<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
    values: {
        type: Array,
        default: () => []
    },
    modelValue: {
        type: Number,
        default: 0
    },
    itemHeight: {
        type: Number,
        default: 34
    },
    active: {
        type: Boolean,
        default: true
    },
    formatValue: {
        type: Function,
        default: (value) => String(value)
    }
})

const emit = defineEmits(['update:modelValue'])

const scrollerRef = ref(null)
const pointerDown = ref(false)
const lastScrollAt = ref(0)
const syncLock = ref(false)
const programmaticUntil = ref(0)
const scrollTimer = ref(null)

const WHEEL_SCROLL_IDLE_MS = 180
const WHEEL_SCROLL_CHECK_MS = 80

function indexFromValue(value) {
    const index = props.values.indexOf(value)
    return index >= 0 ? index : 0
}

function scrollToValue(value, behavior = 'smooth') {
    if (!props.active) return
    const element = scrollerRef.value
    if (!element) return
    const index = indexFromValue(value)
    const top = index * props.itemHeight
    const durationMs = behavior === 'smooth' ? 320 : 80
    syncLock.value = true
    programmaticUntil.value = Date.now() + durationMs
    element.scrollTo({ top, behavior })
    window.setTimeout(() => {
        syncLock.value = false
    }, durationMs)
}

function finalizeScroll() {
    const element = scrollerRef.value
    if (!element) return
    const maxIndex = Math.max(0, props.values.length - 1)
    const rawIndex = Math.round((element.scrollTop || 0) / props.itemHeight)
    const index = Math.max(0, Math.min(maxIndex, rawIndex))
    const value = props.values[index]
    if (value == null) return
    emit('update:modelValue', value)
    scrollToValue(value, 'smooth')
}

function scheduleFinalize() {
    if (scrollTimer.value) clearTimeout(scrollTimer.value)
    scrollTimer.value = window.setTimeout(() => {
        if (!props.active) return
        if (syncLock.value) return
        if (pointerDown.value) {
            scheduleFinalize()
            return
        }
        if ((programmaticUntil.value || 0) > Date.now()) {
            scheduleFinalize()
            return
        }
        const idleFor = Date.now() - (lastScrollAt.value || 0)
        if (idleFor < WHEEL_SCROLL_IDLE_MS) {
            scheduleFinalize()
            return
        }
        finalizeScroll()
    }, WHEEL_SCROLL_CHECK_MS)
}

function handleScroll() {
    if (!props.active) return
    if (syncLock.value) return
    if (pointerDown.value) return
    if ((programmaticUntil.value || 0) > Date.now()) return
    lastScrollAt.value = Date.now()
    scheduleFinalize()
}

function beginPointer(event) {
    pointerDown.value = true
    event.currentTarget?.setPointerCapture?.(event.pointerId)
}

function endPointer(event) {
    pointerDown.value = false
    event?.currentTarget?.releasePointerCapture?.(event.pointerId)
    handleScroll()
}

function selectValue(value) {
    emit('update:modelValue', value)
    scrollToValue(value, 'smooth')
}

async function syncToValue(behavior = 'auto') {
    if (!props.active) return
    await nextTick()
    scrollToValue(props.modelValue, behavior)
}

watch(
    () => props.modelValue,
    (value) => {
        if (!props.active || syncLock.value) return
        scrollToValue(value, 'smooth')
    }
)

watch(
    () => props.values,
    () => {
        if (!props.active) return
        syncToValue('auto')
    },
    { deep: true }
)

watch(
    () => props.active,
    (value) => {
        if (value) syncToValue('auto')
    },
    { immediate: true }
)

onMounted(() => {
    syncToValue('auto')
})

onUnmounted(() => {
    if (scrollTimer.value) clearTimeout(scrollTimer.value)
})
</script>

<template>
    <div
        ref="scrollerRef"
        class="scroller"
        @scroll="handleScroll"
        @pointerdown="beginPointer"
        @pointerup="endPointer"
        @pointercancel="endPointer"
        @pointerleave="endPointer"
    >
        <button
            v-for="(value, index) in values"
            :key="`wheel-${index}-${value}`"
            type="button"
            :class="['item', { active: value === modelValue }]"
            @click="selectValue(value)"
        >
            {{ formatValue(value) }}
        </button>
    </div>
</template>

<style scoped>
.scroller {
    height: 100%;
    overflow-y: auto;
    padding: calc((var(--picker-height) - var(--item-height)) / 2) 0;
    scrollbar-width: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.scroller::-webkit-scrollbar {
    display: none;
}

.item {
    height: var(--item-height);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--item-font-size);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    border: none;
    background: transparent;
    width: 100%;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
}

.item:focus,
.item:focus-visible {
    outline: none;
}
</style>
