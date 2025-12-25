import { describe, it, expect } from 'vitest'
import { clampNumber } from '../src/utils/num'
import { piecewiseLinear } from '../src/utils/piecewise'
import { formatLuxTick, formatLuxLabel, formatPercentValue } from '../src/utils/formatters'

describe('num', () => {
    it('clamps values to min/max', () => {
        expect(clampNumber(5, 0, 10)).toBe(5)
        expect(clampNumber(-1, 0, 10)).toBe(0)
        expect(clampNumber(20, 0, 10)).toBe(10)
    })
})

describe('piecewiseLinear', () => {
    it('interpolates between points', () => {
        const points = [
            { x: 0, y: 0 },
            { x: 1, y: 1 }
        ]
        const value = piecewiseLinear(points, 0.5, (p) => p.x, (p) => p.y, 0, 1)
        expect(value).toBeCloseTo(0.5)
    })
})

describe('formatters', () => {
    it('formats lux ticks and values', () => {
        expect(formatLuxTick(5)).toBe('5')
        expect(formatLuxLabel(1500)).toBe('1500 лк')
        expect(formatPercentValue(42)).toBe('42%')
    })
})
