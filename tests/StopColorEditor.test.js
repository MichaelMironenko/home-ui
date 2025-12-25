// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StopColorEditor from '../src/components/dial/StopColorEditor.vue'

describe('StopColorEditor', () => {
    const palette = ['#ff0000', '#00ff00']
    const makeProps = (overrides = {}) => ({
        stop: { useColor: true, colorMode: 'rgb', colorHex: '#ff0000', temperature: 2700 },
        palette,
        isStartContext: true,
        ...overrides
    })

    it('emits color change when selecting swatch', async () => {
        const wrapper = mount(StopColorEditor, {
            props: makeProps()
        })
        const swatches = wrapper.findAll('button.swatch')
        await swatches[1].trigger('click')
        const emits = wrapper.emitted('update:stop') || []
        expect(emits.some(([payload]) => payload.colorHex === '#00ff00')).toBe(true)
    })

    it('emits useColor false when selecting off', async () => {
        const wrapper = mount(StopColorEditor, {
            props: makeProps(),
            global: {
                stubs: {
                    SegmentedControl: {
                        template: '<button class="segmented" @click="$emit(\'update:modelValue\', \'off\')">Off</button>'
                    }
                }
            }
        })
        await wrapper.get('button.segmented').trigger('click')
        const emits = wrapper.emitted('update:stop') || []
        expect(emits.some(([payload]) => payload.useColor === false)).toBe(true)
    })

    it('clamps temperature on range input', async () => {
        const wrapper = mount(StopColorEditor, {
            props: makeProps({ stop: { useColor: true, colorMode: 'temperature', temperature: 2700 } }),
            global: { stubs: { SegmentedControl: true } }
        })
        await wrapper.get('input.gradient-range').setValue('9000')
        const emits = wrapper.emitted('update:stop') || []
        expect(emits.some(([payload]) => payload.temperature === 6500)).toBe(true)
    })
})
