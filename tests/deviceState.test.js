import { describe, it, expect } from 'vitest'
import { extractBrightnessValue, extractColorTemperature, extractColorHsv } from '../src/utils/deviceState'

describe('deviceState extractors', () => {
    it('extracts brightness from nested payload', () => {
        const payload = {
            state: {
                brightness: 42
            }
        }
        expect(extractBrightnessValue(payload)).toBe(42)
    })

    it('extracts color temperature from multiple shapes', () => {
        const payload = {
            properties: [
                { instance: 'temperature', value: 2700 }
            ]
        }
        expect(extractColorTemperature(payload)).toBe(2700)
    })

    it('extracts hsv from nested state', () => {
        const payload = {
            data: {
                state: { h: 120, s: 50, v: 80 }
            }
        }
        expect(extractColorHsv(payload)).toEqual({ h: 120, s: 50, v: 80 })
    })
})
