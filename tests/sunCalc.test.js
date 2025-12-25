import { describe, it, expect } from 'vitest'
import { sunriseUTC, sunsetUTC } from '../src/utils/sunCalc'

describe('sunCalc', () => {
    it('returns sunrise and sunset dates', () => {
        const date = new Date('2024-06-01T00:00:00.000Z')
        const sunrise = sunriseUTC(date, 55.751, 37.617, 'UTC')
        const sunset = sunsetUTC(date, 55.751, 37.617, 'UTC')
        expect(sunrise instanceof Date).toBe(true)
        expect(sunset instanceof Date).toBe(true)
        expect(sunrise.getTime()).toBeLessThan(sunset.getTime())
    })
})
