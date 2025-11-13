import { ref } from 'vue'
import { clampNumber } from '../utils/num'

export function useAdjustControl(options) {
    const {
        label,
        kind,
        min,
        max,
        snapshot,
        currentAutoTarget,
        onSend,
        onCommit,
        minDelta,
        idleDelayMs,
        throttleMs,
        commitDelayMs,
        snapToAuto = true
    } = options

    const controlKind = kind || label

    const control = ref(snapshot())
    const display = ref(control.value)
    const adjusting = ref(false)
    const pending = ref(null)
    const pendingNote = ref(label)
    const lastSent = ref(null)
    let lastSendAt = 0

    let idleTimeoutId = null
    let commitTimeoutId = null

    const clamp = (value) => clampNumber(value, min(), max())

    const clearIdleTimer = () => {
        if (idleTimeoutId) {
            clearTimeout(idleTimeoutId)
            idleTimeoutId = null
        }
    }

    const clearCommitTimer = () => {
        if (commitTimeoutId) {
            clearTimeout(commitTimeoutId)
            commitTimeoutId = null
        }
    }

    const setFromOutside = (value) => {
        const resolved = value == null ? snapshot() : clamp(Number(value))
        lastSent.value = resolved
        if (!adjusting.value) {
            control.value = resolved
            display.value = resolved
        }
    }

    const shouldSend = (value, force) => {
        if (!Number.isFinite(value)) return false
        if (force) return true
        if (lastSent.value == null) return true
        return Math.abs(value - lastSent.value) >= minDelta
    }

    const dispatchSend = async (note, force = false) => {
        const value = clamp(pending.value ?? control.value)
        if (!shouldSend(value, force)) return
        const now = Date.now()
        if (!force && now - lastSendAt < throttleMs) return
        lastSendAt = now
        if (typeof onSend === 'function') {
            await onSend(value, note, force, controlKind)
        }
        lastSent.value = value
        if (!adjusting.value) pending.value = null
    }

    const scheduleSend = (force = false) => {
        if (pending.value == null) return
        if (force || !adjusting.value) {
            clearIdleTimer()
            dispatchSend(pendingNote.value, force)
            return
        }
        clearIdleTimer()
        idleTimeoutId = setTimeout(() => {
            idleTimeoutId = null
            dispatchSend(pendingNote.value, false)
        }, idleDelayMs)
    }

    const applyAutoSnap = (value) => {
        if (!snapToAuto || typeof currentAutoTarget !== 'function') return value
        const auto = currentAutoTarget()
        if (!Number.isFinite(auto)) return value
        if (Math.abs(value - auto) <= minDelta) {
            return clamp(auto)
        }
        return value
    }

    const queueValue = (value, note) => {
        const safe = clamp(applyAutoSnap(value))
        control.value = safe
        display.value = safe
        pending.value = safe
        pendingNote.value = note || label
        scheduleSend(false)
        scheduleCommit(note)
    }

    const flushCommit = async () => {
        if (pending.value == null) return
        const value = clamp(pending.value)
        if (typeof onCommit === 'function') {
            await onCommit(value, pendingNote.value, controlKind)
        } else if (typeof onSend === 'function') {
            await onSend(value, pendingNote.value, true, controlKind)
        }
        pending.value = null
        pendingNote.value = label
    }

    const scheduleCommit = (note) => {
        pendingNote.value = note || label
        clearCommitTimer()
        commitTimeoutId = setTimeout(() => {
            commitTimeoutId = null
            flushCommit()
        }, commitDelayMs)
    }

    const onPointerDown = () => {
        adjusting.value = true
        clearIdleTimer()
    }

    const onPointerUp = () => {
        adjusting.value = false
        scheduleSend(true)
    }

    const onInput = (value, note) => {
        queueValue(value, note)
    }

    const quickAdjust = (delta, note) => {
        const next = clamp(control.value + delta)
        if (next === control.value) return
        adjusting.value = false
        queueValue(next, note)
    }

    const reset = () => {
        const baseline = snapshot()
        control.value = baseline
        display.value = baseline
        pending.value = null
        clearIdleTimer()
        clearCommitTimer()
        pendingNote.value = label
    }

    const teardown = () => {
        clearIdleTimer()
        clearCommitTimer()
    }

    return {
        control,
        display,
        pending,
        pendingNote,
        lastSent,
        adjusting,
        setFromOutside,
        onPointerDown,
        onPointerUp,
        onInput,
        scheduleSend,
        quickAdjust,
        reset,
        teardown
    }
}
