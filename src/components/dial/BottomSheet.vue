<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'

const props = defineProps({
    open: {
        type: Boolean,
        default: false
    },
    title: {
        type: String,
        default: ''
    },
    closeLabel: {
        type: String,
        default: 'Закрыть'
    },
    maxWidth: {
        type: String,
        default: '560px'
    },
    maxHeight: {
        type: String,
        default: '95vh'
    },
    zIndex: {
        type: Number,
        default: 40
    }
})

const emit = defineEmits(['close'])

const bodyOverflow = ref('')
const scrollLocked = ref(false)
const closing = ref(false)
const translate = ref(0)
const dragStartY = ref(null)
const dragActive = ref(false)
const dragElement = ref(null)
const visualInset = ref(0)
let visualViewportActive = false
let visualViewportRef = null

function updateVisualInset() {
    if (!visualViewportRef) {
        visualInset.value = 0
        return
    }
    const layoutHeight = document.documentElement?.clientHeight || window.innerHeight
    const inset = Math.max(0, layoutHeight - visualViewportRef.height - visualViewportRef.offsetTop)
    visualInset.value = inset
}

function startVisualViewportTracking() {
    if (visualViewportActive) return
    if (typeof window === 'undefined' || !window.visualViewport) {
        visualInset.value = 0
        return
    }
    visualViewportActive = true
    visualViewportRef = window.visualViewport
    updateVisualInset()
    visualViewportRef.addEventListener('resize', updateVisualInset)
    visualViewportRef.addEventListener('scroll', updateVisualInset)
    window.addEventListener('resize', updateVisualInset)
}

function stopVisualViewportTracking() {
    if (!visualViewportActive) {
        visualInset.value = 0
        return
    }
    visualViewportRef?.removeEventListener('resize', updateVisualInset)
    visualViewportRef?.removeEventListener('scroll', updateVisualInset)
    window.removeEventListener('resize', updateVisualInset)
    visualViewportRef = null
    visualViewportActive = false
    visualInset.value = 0
}

watch(
    () => props.open,
    (open, prev) => {
        if (open && !prev) {
            bodyOverflow.value = document.body.style.overflow
            document.body.style.overflow = 'hidden'
            scrollLocked.value = true
            closing.value = false
            translate.value = 0
            dragStartY.value = null
            dragActive.value = false
            dragElement.value = null
            startVisualViewportTracking()
            return
        }
        if (!open && prev) {
            if (scrollLocked.value) {
                document.body.style.overflow = bodyOverflow.value || ''
                bodyOverflow.value = ''
                scrollLocked.value = false
            }
            closing.value = false
            translate.value = 0
            dragStartY.value = null
            dragActive.value = false
            dragElement.value = null
            stopVisualViewportTracking()
        }
    }
)

onUnmounted(() => {
    if (scrollLocked.value) {
        document.body.style.overflow = bodyOverflow.value || ''
        scrollLocked.value = false
    }
    stopVisualViewportTracking()
})

function requestClose() {
    if (closing.value) return
    closing.value = true
    translate.value = Math.max(translate.value, 200)
    setTimeout(() => {
        closing.value = false
        translate.value = 0
        dragStartY.value = null
        dragActive.value = false
        dragElement.value = null
        emit('close')
    }, 250)
}

function startDrag(event) {
    if (event.pointerType === 'mouse') return
    dragStartY.value = event.clientY
    dragActive.value = true
    dragElement.value = event.currentTarget
    dragElement.value?.setPointerCapture?.(event.pointerId)
}

function handleDrag(event) {
    if (!dragActive.value || dragStartY.value == null) return
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    const delta = event.clientY - dragStartY.value
    translate.value = Math.max(0, delta)
}

function endDrag(event) {
    if (!dragActive.value) return
    dragElement.value?.releasePointerCapture?.(event.pointerId)
    if (translate.value > 120) {
        requestClose()
    } else {
        translate.value = 0
    }
    dragActive.value = false
    dragStartY.value = null
    dragElement.value = null
}

const panelStyle = computed(() => {
    const rawMaxHeight = String(props.maxHeight || '').trim()
    const dynamicMaxHeight = rawMaxHeight.endsWith('vh')
        ? `${rawMaxHeight.slice(0, -2)}dvh`
        : rawMaxHeight
    return {
        zIndex: props.zIndex,
        '--bottom-sheet-max-width': props.maxWidth,
        '--bottom-sheet-max-height': rawMaxHeight,
        '--bottom-sheet-max-height-dynamic': dynamicMaxHeight,
        '--bottom-sheet-current-translate': `${Math.max(0, translate.value)}px`,
        transform: `translateY(${Math.max(0, translate.value)}px)`
    }
})

const overlayStyle = computed(() => ({
    zIndex: props.zIndex,
    '--bottom-sheet-visual-inset': `${visualInset.value}px`
}))
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="bottom-sheet-overlay" :style="overlayStyle" @touchmove.passive>
            <div class="bottom-sheet-backdrop" @click="requestClose" />
            <div class="bottom-sheet-panel" :class="{ closing }" :style="panelStyle">
                <header class="bottom-sheet-header" @pointerdown="startDrag" @pointermove="handleDrag"
                    @pointerup="endDrag" @pointercancel="endDrag">
                    <button type="button" class="bottom-sheet-close" :aria-label="closeLabel" @pointerdown.stop
                        @click="requestClose">
                        <svg viewBox="0 0 24 24" aria-hidden="true" class="bottom-sheet-close-icon">
                            <path
                                d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12l-4.9 4.89a1 1 0 1 0 1.42 1.42L12 13.41l4.89 4.9a1 1 0 0 0 1.42-1.42L13.41 12l4.9-4.89a1 1 0 0 0 0-1.4Z" />
                        </svg>
                    </button>
                    <h3>
                        <slot name="title">{{ title }}</slot>
                    </h3>
                    <div class="bottom-sheet-header-actions">
                        <slot name="actions">
                            <div class="bottom-sheet-header-spacer" aria-hidden="true" />
                        </slot>
                    </div>
                </header>
                <div class="bottom-sheet-content">
                    <slot />
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.bottom-sheet-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: calc(-1 * var(--bottom-sheet-visual-inset, 0px));
    display: flex;
    align-items: flex-end;
    justify-content: center;
    pointer-events: auto;
}

.bottom-sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
}

.bottom-sheet-panel {
    position: relative;
    width: min(var(--bottom-sheet-max-width), 100%);
    max-height: var(--bottom-sheet-max-height);
    background: #0d1322;
    border-radius: 28px 28px 0 0;
    animation: bottom-sheet-slide-in 0.3s ease-out forwards;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
}

@supports (height: 100dvh) {
    .bottom-sheet-panel {
        max-height: var(--bottom-sheet-max-height-dynamic, var(--bottom-sheet-max-height));
    }
}

.bottom-sheet-panel.closing {
    animation: bottom-sheet-slide-out 0.25s ease-in forwards;
}

@keyframes bottom-sheet-slide-in {
    from {
        transform: translateY(100%);
    }

    to {
        transform: translateY(0);
    }
}

@keyframes bottom-sheet-slide-out {
    from {
        transform: translateY(var(--bottom-sheet-current-translate, 0px));
    }

    to {
        transform: translateY(100%);
    }
}

.bottom-sheet-header {
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
    padding: 12px 24px 16px 12px;
    cursor: grab;
    touch-action: none;
}

.bottom-sheet-header h3 {
    margin: 0;
    font-size: 1rem;
    justify-self: center;
    text-align: center;
}

.bottom-sheet-close {
    width: 44px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #f8fafc;
    font-size: 16px;
    cursor: pointer;
    border-radius: 12px;
    -webkit-tap-highlight-color: transparent;
}

.bottom-sheet-close:active {
    background: rgba(148, 163, 184, 0.12);
}

.bottom-sheet-close-icon {
    width: 22px;
    height: 22px;
    fill: currentColor;
}

.bottom-sheet-header-spacer {
    width: 44px;
    height: 32px;
}

.bottom-sheet-header-actions {
    display: inline-flex;
    justify-content: flex-end;
    align-items: center;
    width: 100%;
}

.bottom-sheet-content {
    padding: 0 24px calc(32px + env(safe-area-inset-bottom, 0px));
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
    flex: 1;
    min-height: 0;
}
</style>
