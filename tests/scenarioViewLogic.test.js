import { describe, it, expect } from 'vitest'
import {
    applyStop,
    buildScenarioActions,
    buildScenarioPayload,
    buildBrightnessAction,
    buildColorAction,
    hydrateStopsFromActions,
    minutesToTimeString,
    normalizeScenarioName,
    serializeStop,
    summarizeStopState,
    timeFromStop,
    updateStopFromTime
} from '../src/utils/scenarioViewLogic'

function createStop(overrides = {}) {
    return {
        mode: 'clock',
        clockMinutes: 8 * 60,
        offset: 0,
        colorMode: 'temperature',
        temperature: 3200,
        colorHex: '#ffaa00',
        brightness: 50,
        useColor: true,
        useBrightness: true,
        ...overrides
    }
}

describe('normalizeScenarioName', () => {
    it('trims and limits to 30 chars', () => {
        const value = '   ' + 'a'.repeat(40) + '   '
        expect(normalizeScenarioName(value)).toBe('a'.repeat(30))
    })

    it('returns empty string for blank input', () => {
        expect(normalizeScenarioName('   ')).toBe('')
    })
})

describe('minutesToTimeString/timeFromStop', () => {
    it('formats minutes into hh:mm', () => {
        expect(minutesToTimeString(7 * 60 + 5)).toBe('07:05')
    })

    it('wraps negative minutes', () => {
        expect(minutesToTimeString(-5)).toBe('23:55')
    })

    it('serializes clock stop', () => {
        const stop = createStop({ clockMinutes: 6 * 60 + 30 })
        expect(timeFromStop(stop)).toEqual({ type: 'clock', time: '06:30' })
    })

    it('serializes sun stop', () => {
        const stop = createStop({ mode: 'sunset', offset: 15 })
        expect(timeFromStop(stop)).toEqual({ type: 'sun', anchor: 'sunset', offsetMin: 15 })
    })
})

describe('serializeStop/applyStop', () => {
    it('round-trips stop state', () => {
        const start = createStop({ mode: 'sunrise', offset: -10, useBrightness: false })
        const snapshot = serializeStop(start)
        const target = createStop({ clockMinutes: 0, brightness: 10 })
        applyStop(target, snapshot)
        expect(target).toMatchObject(snapshot)
    })
})

describe('updateStopFromTime', () => {
    it('updates to clock mode from time string', () => {
        const stop = createStop({ mode: 'sunrise', offset: 5 })
        updateStopFromTime(stop, { type: 'clock', time: '09:45' })
        expect(stop.mode).toBe('clock')
        expect(stop.clockMinutes).toBe(9 * 60 + 45)
        expect(stop.offset).toBe(0)
    })

    it('updates to sunrise/sunset mode', () => {
        const stop = createStop({ mode: 'clock', clockMinutes: 0 })
        updateStopFromTime(stop, { type: 'sun', anchor: 'sunrise', offsetMin: 12 })
        expect(stop.mode).toBe('sunrise')
        expect(stop.offset).toBe(12)
    })
})

describe('summarizeStopState', () => {
    it('returns placeholder when no color/brightness', () => {
        const stop = createStop({ useColor: false, useBrightness: false })
        const summary = summarizeStopState(stop, false)
        expect(summary.placeholder).toBe('Не меняем')
        expect(summary.values).toEqual([])
    })

    it('uses auto brightness label when enabled', () => {
        const stop = createStop({ useBrightness: true, brightness: 42 })
        const summary = summarizeStopState(stop, true)
        expect(summary.values).toContain('Автояркость')
    })
})

describe('buildBrightnessAction', () => {
    it('builds manual ramp for manual brightness', () => {
        const start = createStop({ brightness: 10 })
        const end = createStop({ brightness: 80 })
        const action = buildBrightnessAction({
            startStop: start,
            endStop: end,
            autoBrightness: { enabled: false }
        })
        expect(action).toMatchObject({
            type: 'light.brightness',
            source: { type: 'manualRamp', from: 10, to: 80 }
        })
    })

    it('builds sensor map for auto brightness', () => {
        const action = buildBrightnessAction({
            startStop: createStop(),
            endStop: createStop(),
            autoBrightness: {
                enabled: true,
                sensorId: 'sensor-1',
                luxMin: 5,
                luxMax: 200,
                brightnessMin: 10,
                brightnessMax: 90
            }
        })
        expect(action.source.type).toBe('sensorMap')
        expect(action.source.sensorId).toBe('sensor-1')
        expect(action.source.sensorMin).toBe(5)
        expect(action.source.sensorMax).toBe(200)
        expect(action.source.outputMin).toBe(10)
        expect(action.source.outputMax).toBe(90)
    })
})

describe('buildColorAction', () => {
    it('builds cct ramp for temperature mode', () => {
        const action = buildColorAction({
            startStop: createStop({ colorMode: 'temperature', temperature: 2000 }),
            endStop: createStop({ colorMode: 'temperature', temperature: 5000 })
        })
        expect(action).toMatchObject({
            type: 'light.color.cct',
            source: { type: 'manualRamp', fromK: 2000, toK: 5000 }
        })
    })

    it('builds hsv ramp for rgb mode', () => {
        const action = buildColorAction({
            startStop: createStop({ colorMode: 'rgb', colorHex: '#ff0000' }),
            endStop: createStop({ colorMode: 'rgb', colorHex: '#00ff00' })
        })
        expect(action.type).toBe('light.color.hsv')
        expect(action.source.type).toBe('manualRamp')
    })

    it('returns null when color is disabled', () => {
        const action = buildColorAction({
            startStop: createStop({ useColor: false }),
            endStop: createStop({ useColor: true })
        })
        expect(action).toBeNull()
    })
})

describe('buildScenarioActions', () => {
    it('preserves non-light actions and appends light actions', () => {
        const preserved = [{ type: 'device.power', source: { state: 'on' } }]
        const actions = buildScenarioActions({
            scenarioActions: preserved,
            startStop: createStop({ brightness: 10 }),
            endStop: createStop({ brightness: 90 }),
            autoBrightness: { enabled: false }
        })
        expect(actions[0]).toMatchObject(preserved[0])
        expect(actions.some((action) => action.type === 'light.brightness')).toBe(true)
    })
})

describe('buildScenarioPayload', () => {
    it('builds payload with targets, time, actions, and presence', () => {
        const payload = buildScenarioPayload({
            scenario: {
                id: 'sc-1',
                name: '  Test  ',
                type: 'scenario-v1',
                actions: [{ type: 'device.power', source: { state: 'on' } }]
            },
            selectedGroupIds: new Set(['g2', 'g1']),
            selectedDeviceIds: ['d2', 'd1'],
            selectedDays: [2, 1],
            startStop: createStop({ clockMinutes: 6 * 60 }),
            endStop: createStop({ clockMinutes: 20 * 60 }),
            autoBrightness: { enabled: false },
            presenceMode: 'home'
        })
        expect(payload.name).toBe('Test')
        expect(payload.target.groups).toEqual(['g1', 'g2'])
        expect(payload.target.devices).toEqual(['d1', 'd2'])
        expect(payload.time.start.type).toBe('clock')
        expect(payload.time.end.type).toBe('clock')
        expect(payload.time.days).toEqual([1, 2])
        expect(payload.runtime.presence).toBe('onlyWhenHome')
        expect(payload.actions.some((action) => action.type === 'light.brightness')).toBe(true)
    })

    it('captures auto-light state when scenario type matches', () => {
        const payload = buildScenarioPayload({
            scenario: {
                id: 'auto',
                name: 'Auto',
                type: 'auto-light-v1'
            },
            selectedGroupIds: [],
            selectedDeviceIds: ['d1'],
            selectedDays: [1, 2, 3],
            startStop: createStop({ clockMinutes: 7 * 60 }),
            endStop: createStop({ clockMinutes: 22 * 60 }),
            autoBrightness: {
                enabled: true,
                sensorId: 'lux-1',
                luxMin: 5,
                luxMax: 200,
                brightnessMin: 10,
                brightnessMax: 80
            },
            presenceMode: 'any'
        })
        expect(payload.autoLight.state.selectedDevices).toEqual(['d1'])
        expect(payload.autoLight.state.autoBrightness.enabled).toBe(true)
        expect(payload.autoLight.sensorId).toBe('lux-1')
    })
})

describe('hydrateStopsFromActions', () => {
    it('disables color and brightness when actions are invalid', () => {
        const start = createStop({ useColor: true, useBrightness: true })
        const end = createStop({ useColor: true, useBrightness: true })
        const autoBrightness = { enabled: true }
        hydrateStopsFromActions(null, { startStop: start, endStop: end, autoBrightness })
        expect(start.useColor).toBe(false)
        expect(end.useBrightness).toBe(false)
        expect(autoBrightness.enabled).toBe(true)
    })

    it('hydrates manual brightness ramp', () => {
        const start = createStop({ brightness: 10 })
        const end = createStop({ brightness: 20 })
        const autoBrightness = { enabled: true, luxMin: 1, luxMax: 100, brightnessMin: 0, brightnessMax: 100 }
        hydrateStopsFromActions(
            [{ type: 'light.brightness', source: { type: 'manualRamp', from: 15, to: 85 } }],
            { startStop: start, endStop: end, autoBrightness }
        )
        expect(start.useBrightness).toBe(true)
        expect(end.useBrightness).toBe(true)
        expect(autoBrightness.enabled).toBe(false)
        expect(start.brightness).toBe(15)
        expect(end.brightness).toBe(85)
    })

    it('hydrates sensor map auto brightness', () => {
        const start = createStop()
        const end = createStop()
        const autoBrightness = { enabled: false, luxMin: 1, luxMax: 100, brightnessMin: 0, brightnessMax: 100 }
        hydrateStopsFromActions(
            [{
                type: 'light.brightness',
                source: {
                    type: 'sensorMap',
                    sensorId: 'lux-1',
                    sensorMin: 3,
                    sensorMax: 300,
                    outputMin: 5,
                    outputMax: 95
                }
            }],
            { startStop: start, endStop: end, autoBrightness }
        )
        expect(autoBrightness.enabled).toBe(true)
        expect(autoBrightness.sensorId).toBe('lux-1')
        expect(autoBrightness.luxMin).toBe(3)
        expect(autoBrightness.luxMax).toBe(300)
        expect(autoBrightness.brightnessMin).toBe(5)
        expect(autoBrightness.brightnessMax).toBe(95)
    })

    it('hydrates cct color action', () => {
        const start = createStop({ colorMode: 'rgb', colorHex: '#000000' })
        const end = createStop({ colorMode: 'rgb', colorHex: '#ffffff' })
        const autoBrightness = { enabled: false }
        hydrateStopsFromActions(
            [{ type: 'light.color.cct', source: { fromK: 2000, toK: 5000 } }],
            { startStop: start, endStop: end, autoBrightness }
        )
        expect(start.colorMode).toBe('temperature')
        expect(end.colorMode).toBe('temperature')
        expect(start.temperature).toBe(2000)
        expect(end.temperature).toBe(5000)
    })
})
