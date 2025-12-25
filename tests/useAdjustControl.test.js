import { describe, it, expect, vi, afterEach } from 'vitest'
import { useAdjustControl } from '../src/composables/useAdjustControl'

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

function createControl(options = {}) {
    return useAdjustControl({
        label: 'Brightness',
        min: () => 0,
        max: () => 100,
        snapshot: () => 20,
        minDelta: 1,
        idleDelayMs: 200,
        throttleMs: 200,
        commitDelayMs: 300,
        ...options
    })
}

describe('useAdjustControl', () => {
    it('sends immediately when not adjusting', async () => {
        const onSend = vi.fn()
        const control = createControl({ onSend })
        control.onInput(42, 'Manual')
        await Promise.resolve()
        expect(onSend).toHaveBeenCalledWith(42, 'Manual', false, 'Brightness')
    })

    it('delays send while adjusting until idle timer fires', async () => {
        vi.useFakeTimers()
        const onSend = vi.fn()
        const control = createControl({ onSend })
        control.onPointerDown()
        control.onInput(30, 'Drag')
        await Promise.resolve()
        expect(onSend).not.toHaveBeenCalled()
        vi.advanceTimersByTime(199)
        await Promise.resolve()
        expect(onSend).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        await Promise.resolve()
        expect(onSend).toHaveBeenCalledWith(30, 'Drag', false, 'Brightness')
    })

    it('throttles rapid sends', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
        const onSend = vi.fn()
        const control = createControl({ onSend })
        control.onInput(10, 'Step')
        await Promise.resolve()
        expect(onSend).toHaveBeenCalledTimes(1)

        vi.setSystemTime(new Date('2024-01-01T00:00:00.100Z'))
        control.onInput(12, 'Step')
        await Promise.resolve()
        expect(onSend).toHaveBeenCalledTimes(1)

        vi.setSystemTime(new Date('2024-01-01T00:00:00.250Z'))
        control.onInput(14, 'Step')
        await Promise.resolve()
        expect(onSend).toHaveBeenCalledTimes(2)
    })

    it('commits after delay via onCommit', async () => {
        vi.useFakeTimers()
        const onCommit = vi.fn()
        const control = createControl({ onCommit, idleDelayMs: 1000 })
        control.onPointerDown()
        control.onInput(55, 'Commit')
        await Promise.resolve()
        expect(onCommit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(300)
        expect(onCommit).toHaveBeenCalledWith(55, 'Commit', 'Brightness')
    })

    it('snaps to auto target within minDelta', async () => {
        const onSend = vi.fn()
        const control = createControl({
            onSend,
            minDelta: 2,
            currentAutoTarget: () => 50
        })
        control.onInput(51, 'Auto')
        await Promise.resolve()
        expect(onSend).toHaveBeenCalledWith(50, 'Auto', false, 'Brightness')
    })

    it('setFromOutside updates control when not adjusting', () => {
        const control = createControl()
        control.setFromOutside(70)
        expect(control.control.value).toBe(70)
        expect(control.display.value).toBe(70)
    })
})
