import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useAutoBrightnessEditor } from '../src/composables/useAutoBrightnessEditor'

function makeTrack(height = 200) {
    return {
        getBoundingClientRect: () => ({ top: 0, height }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
    }
}

describe('useAutoBrightnessEditor', () => {
    beforeEach(() => {
        vi.stubGlobal('window', {
            addEventListener: vi.fn(),
            removeEventListener: vi.fn()
        })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('normalizes draft on bounds changes', async () => {
        const autoDraft = ref({
            enabled: true,
            sensorId: 'sensor-1',
            luxMin: 1,
            luxMax: 2,
            brightnessMin: 0,
            brightnessMax: 100
        })
        const sensorOptions = ref([
            { id: 'sensor-1', minValue: 10, maxValue: 20 }
        ])
        const open = ref(false)
        const isStartContext = ref(true)
        const commitAutoBrightness = vi.fn()

        useAutoBrightnessEditor(autoDraft, sensorOptions, open, isStartContext, commitAutoBrightness)
        await nextTick()
        sensorOptions.value = [{ id: 'sensor-1', minValue: 5, maxValue: 6 }]
        await nextTick()
        expect(commitAutoBrightness).toHaveBeenCalled()
        const payload = commitAutoBrightness.mock.calls.at(-1)[0]
        expect(payload.luxMin).toBe(5)
        expect(payload.luxMax).toBe(6)
    })

    it('updates lux min slider and clamps to lux max - 1', async () => {
        const autoDraft = ref({ sensorId: 'sensor-1', luxMin: 10, luxMax: 30, brightnessMin: 0, brightnessMax: 100 })
        const sensorOptions = ref([{ id: 'sensor-1', minValue: 5, maxValue: 50 }])
        const open = ref(true)
        const isStartContext = ref(true)
        const commitAutoBrightness = vi.fn()

        const editor = useAutoBrightnessEditor(autoDraft, sensorOptions, open, isStartContext, commitAutoBrightness)
        editor.luxMinSlider.value = 0
        await nextTick()
        const payload = commitAutoBrightness.mock.calls.at(-1)[0]
        expect(payload.luxMin).toBeGreaterThanOrEqual(5)
        expect(payload.luxMin).toBeLessThan(payload.luxMax)
    })

    it('does not start range drag when not in start context', () => {
        const autoDraft = ref({ sensorId: 'sensor-1', luxMin: 10, luxMax: 30, brightnessMin: 0, brightnessMax: 100 })
        const sensorOptions = ref([{ id: 'sensor-1', minValue: 5, maxValue: 50 }])
        const open = ref(true)
        const isStartContext = ref(false)
        const commitAutoBrightness = vi.fn()
        const editor = useAutoBrightnessEditor(autoDraft, sensorOptions, open, isStartContext, commitAutoBrightness)
        editor.luxTrackRef.value = makeTrack()
        editor.startRangeDrag('lux', { preventDefault: vi.fn(), pointerId: 1, currentTarget: { setPointerCapture: vi.fn() } })
        expect(editor.rangeDrag.active).toBe(false)
    })
})
