import { describe, it, expect, vi } from 'vitest'
import { nextTick, ref } from 'vue'

vi.mock('../src/utils/scenarioUtils', () => ({
    computeEnvironment: () => ({
        sunriseMin: 360,
        sunsetMin: 1080
    })
}))

import { useStopTimeEditor } from '../src/composables/useStopTimeEditor'

describe('useStopTimeEditor', () => {
    it('hydrates clock mode and snaps minutes to step', async () => {
        const stopDraft = ref({ mode: 'clock', clockMinutes: 7 * 60 + 3, offset: 0 })
        const time = ref({ tz: 'UTC', lat: 0, lon: 0 })
        const open = ref(false)
        const commitStop = vi.fn()
        const editor = useStopTimeEditor(stopDraft, time, open, commitStop)
        await nextTick()
        expect(editor.clockMinute.value).toBe(5)
    })

    it('switches to sunrise and commits snapped offset', async () => {
        const stopDraft = ref({ mode: 'clock', clockMinutes: 8 * 60, offset: 0 })
        const time = ref({ tz: 'UTC', lat: 0, lon: 0 })
        const open = ref(false)
        const commitStop = vi.fn()
        const editor = useStopTimeEditor(stopDraft, time, open, commitStop)
        editor.selectTimeMode('sunrise')
        await nextTick()
        expect(commitStop).toHaveBeenCalledWith({ mode: 'sunrise', offset: 0 })
        expect(editor.clockHour.value).toBe(6)
    })

    it('commits sun offset changes for active anchor', async () => {
        const stopDraft = ref({ mode: 'sunrise', offset: 0 })
        const time = ref({ tz: 'UTC', lat: 0, lon: 0 })
        const open = ref(false)
        const commitStop = vi.fn()
        const editor = useStopTimeEditor(stopDraft, time, open, commitStop)
        editor.selectTimeMode('sunrise')
        editor.setSunOffset('sunrise', 12)
        await nextTick()
        expect(commitStop).toHaveBeenLastCalledWith({ mode: 'sunrise', offset: 10 })
    })

    it('commits clock updates when setting hour and minute', async () => {
        const stopDraft = ref({ mode: 'clock', clockMinutes: 9 * 60, offset: 0 })
        const time = ref({ tz: 'UTC', lat: 0, lon: 0 })
        const open = ref(false)
        const commitStop = vi.fn()
        const editor = useStopTimeEditor(stopDraft, time, open, commitStop)
        editor.setClockHour(10)
        editor.setClockMinute(23)
        await nextTick()
        const calls = commitStop.mock.calls.map((call) => call[0])
        expect(calls.some((payload) => payload.mode === 'clock')).toBe(true)
        expect(editor.clockHour.value).toBe(10)
        expect(editor.clockMinute.value).toBe(25)
    })
})
