import { describe, it, expect } from 'vitest'
import {
    applyBrightnessHex,
    blendHex,
    hexToHsv,
    hexToRgb,
    hsvToHex,
    rgbToHex,
    stopColorHex,
    temperatureToHex
} from '../src/utils/colorUtils'

describe('colorUtils', () => {
    it('round-trips rgb/hex', () => {
        const hex = rgbToHex(255, 128, 0)
        expect(hex).toBe('#ff8000')
        expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 })
    })

    it('round-trips hsv/hex', () => {
        const hex = hsvToHex({ h: 120, s: 100, v: 100 })
        const hsv = hexToHsv(hex)
        expect(hsv.h).toBe(120)
        expect(hsv.s).toBe(100)
        expect(hsv.v).toBe(100)
    })

    it('blends and applies brightness', () => {
        expect(blendHex('#000000', '#ffffff', 0.5)).toBe('#808080')
        expect(applyBrightnessHex('#ffffff', 50, true)).toBe('#bfbfbf')
    })

    it('builds stop colors for temperature and brightness', () => {
        const tempHex = temperatureToHex(3000)
        expect(tempHex).toMatch(/^#/)
        const stopHex = stopColorHex({
            useColor: true,
            colorMode: 'temperature',
            temperature: 3000,
            brightness: 80,
            useBrightness: true
        })
        expect(stopHex).toMatch(/^#/)
    })
})
