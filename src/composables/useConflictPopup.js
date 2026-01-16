import { nextTick, onMounted, onUnmounted, ref } from 'vue'

export function useConflictPopup({
    orbitDialEl,
    conflictPopupEl,
    formatOverlapWindow,
    formatConflictLabel,
    margin = 8,
    offset = 12
}) {
    const conflictPopup = ref(null)
    const conflictPopupStyle = ref({})

    function positionConflictPopup(anchor) {
        if (!anchor || !orbitDialEl.value || !conflictPopupEl.value) return
        const dialRect = orbitDialEl.value.getBoundingClientRect()
        const popupRect = conflictPopupEl.value.getBoundingClientRect()
        const viewportWidth = window.innerWidth || dialRect.width
        const viewportHeight = window.innerHeight || dialRect.height
        let left = anchor.x - popupRect.width / 2
        let top = anchor.y - offset - popupRect.height
        left = Math.min(Math.max(left, margin), viewportWidth - margin - popupRect.width)
        top = Math.min(Math.max(top, margin), viewportHeight - margin - popupRect.height)
        conflictPopupStyle.value = {
            left: `${left - dialRect.left}px`,
            top: `${top - dialRect.top}px`
        }
    }

    function openConflictPopup(conflict, event) {
        if (!conflict?.window) return
        if (!event || event.clientX == null || event.clientY == null) return
        const next = {
            time: formatOverlapWindow(conflict.window, conflict.tz),
            label: formatConflictLabel(conflict.overlap),
            x: event.clientX,
            y: event.clientY
        }
        conflictPopup.value = next
        nextTick(() => {
            positionConflictPopup(next)
        })
    }

    function toggleConflictPopup(conflict, event) {
        if (
            conflictPopup.value?.time === formatOverlapWindow(conflict.window, conflict.tz) &&
            conflictPopup.value?.label === formatConflictLabel(conflict.overlap)
        ) {
            conflictPopup.value = null
            conflictPopupStyle.value = {}
            return
        }
        openConflictPopup(conflict, event)
    }

    function handleConflictHover(conflict, event) {
        if (event?.pointerType && event.pointerType !== 'mouse') return
        openConflictPopup(conflict, event)
    }

    function handleConflictClick(conflict, event) {
        if (event?.pointerType === 'mouse') return
        toggleConflictPopup(conflict, event)
    }

    function clearConflictPopup(event) {
        if (event?.pointerType && event.pointerType !== 'mouse') {
            return
        }
        if (!conflictPopup.value) return
        conflictPopup.value = null
        conflictPopupStyle.value = {}
    }

    function handleGlobalPointerDown(event) {
        if (!conflictPopup.value || !event?.target) return
        const target = event.target
        if (conflictPopupEl.value?.contains(target)) return
        conflictPopup.value = null
        conflictPopupStyle.value = {}
    }

    onMounted(() => {
        if (typeof document !== 'undefined') {
            document.addEventListener('pointerdown', handleGlobalPointerDown)
        }
    })

    onUnmounted(() => {
        if (typeof document !== 'undefined') {
            document.removeEventListener('pointerdown', handleGlobalPointerDown)
        }
    })

    return {
        conflictPopup,
        conflictPopupStyle,
        handleConflictHover,
        handleConflictClick,
        clearConflictPopup
    }
}
