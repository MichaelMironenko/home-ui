import { describe, it, expect } from 'vitest'
import {
    buildLuxTicks,
    luxToPercent,
    normalizeAutoBrightness,
    percentToLux,
    resolveLuxBounds,
    snapLuxValue
} from '../src/utils/autoBrightnessMapping'

describe('resolveLuxBounds', () => {
    it('enforces minimum floor and max >= min + 1', () => {
        const bounds = resolveLuxBounds(0, 0)
        expect(bounds.min).toBe(1)
        expect(bounds.max).toBe(2)
    })
})

describe('normalizeAutoBrightness', () => {
    it('clamps lux and brightness ranges', () => {
        const normalized = normalizeAutoBrightness(
            { luxMin: 0, luxMax: 1, brightnessMin: 100, brightnessMax: 0 },
            { min: 5, max: 20 }
        )
        expect(normalized.luxMin).toBe(5)
        expect(normalized.luxMax).toBe(6)
        expect(normalized.brightnessMin).toBe(0)
        expect(normalized.brightnessMax).toBe(1)
    })
})

describe('luxToPercent/percentToLux', () => {
    it('maps min lux to 100% and max lux to 0%', () => {
        const bounds = { min: 10, max: 1000 }
        expect(luxToPercent(10, bounds)).toBeCloseTo(100)
        expect(luxToPercent(1000, bounds)).toBeCloseTo(0)
    })

    it('round-trips percent to lux within bounds', () => {
        const bounds = { min: 5, max: 5000 }
        const lux = percentToLux(30, bounds)
        expect(lux).toBeGreaterThanOrEqual(5)
        expect(lux).toBeLessThanOrEqual(5000)
        expect(luxToPercent(lux, bounds)).toBeCloseTo(30, 0)
    })
})

describe('snapLuxValue', () => {
    it('rounds by magnitude', () => {
        expect(snapLuxValue(42)).toBe(42)
        expect(snapLuxValue(145)).toBe(150)
        expect(snapLuxValue(1450)).toBe(1500)
        expect(snapLuxValue(14500)).toBe(15000)
    })
})

describe('buildLuxTicks', () => {
    it('builds power-of-ten ticks between bounds', () => {
        const ticks = buildLuxTicks({ min: 5, max: 1500 })
        expect(ticks).toEqual([5, 10, 100, 1000, 1500])
    })
})
