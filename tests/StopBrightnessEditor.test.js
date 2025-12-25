// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('../src/composables/useAutoBrightnessEditor', () => ({
    useAutoBrightnessEditor: () => ({
        autoRangeBoardRef: ref(null),
        luxTrackRef: ref(null),
        brightnessTrackRef: ref(null),
        luxMinPercent: ref(20),
        luxMaxPercent: ref(80),
        brightnessMinPercent: ref(10),
        brightnessMaxPercent: ref(90),
        luxMinSlider: ref(20),
        luxMaxSlider: ref(80),
        brightnessMinSlider: ref(10),
        brightnessMaxSlider: ref(90),
        luxTicks: ref([1, 10, 100]),
        capabilityBounds: ref({ min: 1, max: 100 }),
        rangeDrag: ref({}),
        startRangeDrag: vi.fn()
    })
}))

vi.mock('../src/composables/useRangeLinkMetrics', () => ({
    useRangeLinkMetrics: () => ({
        linkMetrics: {
            width: 0,
            height: 0,
            leftX: 0,
            rightX: 0,
            trackTop: 0,
            trackHeight: 100
        }
    })
}))

import StopBrightnessEditor from '../src/components/dial/StopBrightnessEditor.vue'

describe('StopBrightnessEditor', () => {
    const makeProps = (overrides = {}) => ({
        stop: { useBrightness: true, brightness: 50 },
        autoBrightness: { enabled: false, sensorId: '' },
        sensorOptions: [{ id: 's1', name: 'Sensor 1' }],
        isStartContext: true,
        open: true,
        ...overrides
    })

    it('emits updates when selecting auto mode', async () => {
        const wrapper = mount(StopBrightnessEditor, {
            props: makeProps(),
            global: {
                stubs: {
                    SegmentedControl: {
                        template: '<button class="segmented" @click="$emit(\'update:modelValue\', \'auto\')">Auto</button>'
                    }
                }
            }
        })
        await wrapper.get('button.segmented').trigger('click')
        const stopEmits = wrapper.emitted('update:stop') || []
        const autoEmits = wrapper.emitted('update:autoBrightness') || []
        expect(stopEmits.some(([payload]) => payload.useBrightness === true)).toBe(true)
        expect(autoEmits.some(([payload]) => payload.enabled === true)).toBe(true)
    })

    it('emits sensor change', async () => {
        const wrapper = mount(StopBrightnessEditor, {
            props: makeProps({
                autoBrightness: { enabled: true, sensorId: 's1' }
            }),
            global: {
                stubs: { SegmentedControl: true }
            }
        })
        await wrapper.get('select').setValue('s1')
        const emits = wrapper.emitted('update:autoBrightness') || []
        expect(emits.some(([payload]) => payload.sensorId === 's1')).toBe(true)
    })

    it('clamps brightness on slider input', async () => {
        const wrapper = mount(StopBrightnessEditor, {
            props: makeProps({ stop: { useBrightness: true, brightness: 50 } }),
            global: {
                stubs: { SegmentedControl: true }
            }
        })
        await wrapper.get('input.gradient-range').setValue('150')
        const emits = wrapper.emitted('update:stop') || []
        expect(emits.some(([payload]) => payload.brightness === 100)).toBe(true)
    })
})
