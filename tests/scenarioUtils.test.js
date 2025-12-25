import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/utils/sunCalc', () => ({
    sunriseUTC: () => new Date('2024-01-01T06:00:00.000Z'),
    sunsetUTC: () => new Date('2024-01-01T18:00:00.000Z')
}))

import { computeEnvironment, createDefaultScenario, normalizeScenarioStruct } from '../src/utils/scenarioUtils'

describe('scenarioUtils', () => {
    it('computes environment with sunrise/sunset minutes', () => {
        const env = computeEnvironment({ time: { tz: 'UTC', lat: 0, lon: 0 } })
        expect(env.sunriseMin).toBe(360)
        expect(env.sunsetMin).toBe(1080)
    })

    it('creates default scenario', () => {
        const scenario = createDefaultScenario()
        expect(scenario.type).toBe('scenario-v1')
        expect(scenario.time.days).toHaveLength(7)
    })

    it('normalizes scenario struct', () => {
        const scenario = {
            id: 1,
            name: '  ',
            time: { days: [7, 0, 2], start: { type: 'sunrise', offset: 5 } },
            runtime: { presence: 'invalid' },
            actions: null
        }
        normalizeScenarioStruct(scenario)
        expect(scenario.id).toBe('1')
        expect(scenario.name).toBe('Новый сценарий')
        expect(scenario.time.days).toEqual([2, 7])
        expect(scenario.time.start.type).toBe('sun')
        expect(scenario.runtime.presence).toBe('always')
        expect(Array.isArray(scenario.actions)).toBe(true)
    })
})
