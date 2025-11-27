import { describe, it, expect } from 'vitest'
import {
    brightnessOpacity,
    computePreviewIconStyle,
    AUTO_BRIGHTNESS_COLOR
} from '../src/utils/previewIcon'

describe('brightnessOpacity', () => {
    it('maps brightness 1 to 0.6 opacity', () => {
        expect(brightnessOpacity(1)).toBeCloseTo(0.6)
    })

    it('maps brightness 100 to 1 opacity', () => {
        expect(brightnessOpacity(100)).toBeCloseTo(1)
    })
})

describe('computePreviewIconStyle', () => {
    it('returns gray pulsing style for auto brightness', () => {
        const summary = { hasBrightness: true }
        expect(computePreviewIconStyle(summary, true)).toEqual({
            '--state-icon-bg': 'rgba(248, 250, 252, 0.9)',
            '--state-icon-color': AUTO_BRIGHTNESS_COLOR
        })
    })

    it('returns solid color when auto brightness and color selected', () => {
        const summary = { hasColor: true, colorHex: '#3366ff', hasBrightness: true }
        expect(computePreviewIconStyle(summary, true)).toEqual({
            '--state-icon-bg': 'rgba(51, 102, 255, 1)',
            '--state-icon-color': '#3366ff'
        })
    })

    it('returns pure color when only color is selected', () => {
        const summary = { hasColor: true, colorHex: '#ff0000', hasBrightness: false }
        expect(computePreviewIconStyle(summary, false)).toEqual({
            '--state-icon-bg': '#ff0000',
            '--state-icon-color': '#ff0000'
        })
    })

    it('applies brightness overlay when both color and brightness are selected', () => {
        const summary = { hasColor: true, colorHex: '#00ff00', hasBrightness: true, brightness: 50 }
        const style = computePreviewIconStyle(summary, false)
        expect(style['--state-icon-bg']).toMatch(/rgba\(0, 255, 0/)
        expect(style['--state-icon-color']).toBe('#00ff00')
    })

    it('uses white with opacity when only brightness is present', () => {
        const summary = { hasColor: false, hasBrightness: true, brightness: 75 }
        const style = computePreviewIconStyle(summary, false)
        expect(style['--state-icon-bg']).toMatch(/rgba\(255, 255, 255/)
        expect(style['--state-icon-color']).toBe('#ffffff')
    })
})
