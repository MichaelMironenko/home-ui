import { describe, it, expect } from 'vitest'

import { normalizeScenarioEvents } from '../src/domain/scenarioHistory/normalizeEvents'

describe('normalizeScenarioEvents', () => {
    it('describes sensor-off events by lux and reason while hiding brightness', () => {
        const events = [
            { id: 'alpha', timestamp: 1000, brightness: 40 },
            {
                id: 'sensor-off',
                timestamp: 2000,
                brightness: 1,
                sensorLux: 5206,
                sensorOff: true,
                sensorOffReason: 'above'
            },
            { id: 'beta', timestamp: 3000, brightness: 70 }
        ]

        const normalized = normalizeScenarioEvents(events)
        const sensorEntry = normalized.find((entry) => entry.id === 'sensor-off')
        const betaEntry = normalized.find((entry) => entry.id === 'beta')

        expect(sensorEntry).toBeDefined()
        expect(sensorEntry.sensorOff).toBe(true)
        expect(sensorEntry.sensorLux).toBe(5206)
        expect(sensorEntry.sensorOffReason).toBe('above')
        expect(sensorEntry.brightness).toBeNull()
        expect(sensorEntry.hasBrightness).toBe(false)
        expect(sensorEntry.statusLabel).toBe('5206 lx выкл')

        expect(betaEntry).toBeDefined()
        expect(betaEntry.brightness).toBe(70)
    })
})
