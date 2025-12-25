import { describe, it, expect } from 'vitest'
import {
    hsvToHex,
    rgbIntToRgb,
    rgbToHex,
    interpolateHue,
    interpolateValue,
    interpolateHsv,
    clampColorValue
} from '../src/utils/color'

describe('color utils', () => {
    it('converts hsv to hex', () => {
        expect(hsvToHex({ h: 0, s: 100, v: 100 })).toBe('#FF0000')
    })

    it('converts rgb int to rgb object', () => {
        expect(rgbIntToRgb(0xff00ff)).toEqual({ r: 255, g: 0, b: 255 })
    })

    it('converts rgb to hex', () => {
        expect(rgbToHex({ r: 0, g: 128, b: 255 })).toBe('#0080FF')
    })

    it('interpolates hue/value and clamps hsv', () => {
        expect(interpolateHue(350, 10, 0.5)).toBeCloseTo(360)
        expect(interpolateValue(0, 10, 0.3)).toBeCloseTo(3)
        const hsv = interpolateHsv({ h: 0, s: 0, v: 0 }, { h: 360, s: 100, v: 100 }, 0.5)
        expect(hsv.s).toBe(50)
        expect(hsv.v).toBe(50)
        expect(clampColorValue(200, 0, 100)).toBe(100)
    })
})
