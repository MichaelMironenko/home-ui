import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const makeStorage = () => {
    let store = {}
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => {
            store[key] = String(value)
        },
        clear: () => {
            store = {}
        }
    }
}

describe('requestMetrics', () => {
    const realWindow = global.window

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2024-02-10T12:00:00.000Z'))
        global.window = { localStorage: makeStorage() }
        vi.resetModules()
    })

    afterEach(() => {
        vi.useRealTimers()
        global.window = realWindow
        vi.restoreAllMocks()
    })

    it('initializes state from storage for today', async () => {
        const storage = global.window.localStorage
        storage.setItem('request-metrics-v1', JSON.stringify({ date: '2024-02-10', yandexCalls: 2, functionCalls: 1 }))
        const metrics = await import('../src/lib/requestMetrics.js')
        const state = metrics.getRequestMetrics()
        expect(state.yandexCalls).toBe(2)
        expect(state.functionCalls).toBe(1)
    })

    it('resets state when stored date is stale', async () => {
        const storage = global.window.localStorage
        storage.setItem('request-metrics-v1', JSON.stringify({ date: '2024-02-09', yandexCalls: 10 }))
        const metrics = await import('../src/lib/requestMetrics.js')
        const state = metrics.getRequestMetrics()
        expect(state.date).toBe('2024-02-10')
        expect(state.yandexCalls).toBe(0)
    })

    it('increments counters and persists', async () => {
        const metrics = await import('../src/lib/requestMetrics.js')
        metrics.trackYandexCall()
        metrics.trackFunctionCall()
        const state = metrics.getRequestMetrics()
        expect(state.yandexCalls).toBe(1)
        expect(state.functionCalls).toBe(1)
        const stored = JSON.parse(global.window.localStorage.getItem('request-metrics-v1'))
        expect(stored.yandexCalls).toBe(1)
        expect(stored.functionCalls).toBe(1)
    })
})
