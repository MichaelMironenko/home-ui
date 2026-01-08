import { describe, it, expect } from 'vitest'
import { summarizeStatusRecord, deriveScenarioListStatus } from '../src/utils/scenarioStatusDisplay'

const baseItem = (overrides = {}) => ({
    id: 'scenario',
    name: 'Test',
    pause: null,
    disabled: false,
    status: null,
    ...overrides
})

describe('deriveScenarioListStatus', () => {
    it('returns running state when active within current window', () => {
        const status = summarizeStatusRecord({
            result: {
                active: true,
                currentWindow: {
                    start: '2024-01-01T10:00:00.000Z',
                    end: '2024-01-01T14:00:00.000Z'
                }
            }
        })
        const result = deriveScenarioListStatus(baseItem({ status }), Date.UTC(2024, 0, 1, 12, 0))
        expect(result).toEqual({ kind: 'running', label: 'Работает' })
    })

    it('returns paused with manual reason when pause is manual', () => {
        const item = baseItem({ pause: { reason: { source: 'manual' } } })
        const result = deriveScenarioListStatus(item, Date.now())
        expect(result.kind).toBe('paused')
        expect(result.label).toBe('Пауза · Ручная коррекция')
    })

    it('returns paused without manual reason when status reason is app_button_pause', () => {
        const item = baseItem({
            status: summarizeStatusRecord({ result: { active: false, reason: 'app_button_pause' } })
        })
        const result = deriveScenarioListStatus(item, Date.now())
        expect(result.kind).toBe('paused')
        expect(result.label).toBe('Пауза')
    })

    it('returns paused with presence reason when guard triggers', () => {
        const item = baseItem({
            pause: { reason: { source: 'presence_guard' } }
        })
        const result = deriveScenarioListStatus(item, Date.now())
        expect(result.kind).toBe('paused')
        expect(result.label).toBe('Пауза · Никого нет дома')
    })

    it('returns off state when disabled', () => {
        const status = summarizeStatusRecord({ result: { active: false } })
        const result = deriveScenarioListStatus(
            baseItem({ disabled: true, status }),
            Date.UTC(2024, 0, 1, 12, 0)
        )
        expect(result).toEqual({ kind: 'off', label: 'Выключен' })
    })

    it('shows relative completion time during first quarter of waiting interval', () => {
        const lastEnd = Date.UTC(2024, 0, 1, 9, 0)
        const nextStart = Date.UTC(2024, 0, 1, 13, 0)
        const status = summarizeStatusRecord({
            result: {
                active: false,
                tz: 'UTC',
                lastWindow: { end: new Date(lastEnd).toISOString() },
                nextWindow: { start: new Date(nextStart).toISOString() }
            }
        })
        const now = lastEnd + (nextStart - lastEnd) / 4
        const result = deriveScenarioListStatus(baseItem({ status }), now)
        expect(result.kind).toBe('waiting')
        expect(result.label).toBe('Завершен 1 ч назад')
    })

    it('shows countdown when closer to next window', () => {
        const lastEnd = Date.UTC(2024, 0, 1, 9, 0)
        const nextStart = Date.UTC(2024, 0, 1, 13, 0)
        const status = summarizeStatusRecord({
            result: {
                active: false,
                tz: 'UTC',
                lastWindow: { end: new Date(lastEnd).toISOString() },
                nextWindow: { start: new Date(nextStart).toISOString() }
            }
        })
        const now = nextStart - 70 * 60 * 1000
        const result = deriveScenarioListStatus(baseItem({ status }), now)
        expect(result.kind).toBe('waiting')
        expect(result.label).toBe('Запуск через 1 ч 10 мин')
    })

    it('drops minutes when more than two hours remain', () => {
        const lastEnd = Date.UTC(2024, 0, 1, 9, 0)
        const nextStart = Date.UTC(2024, 0, 2, 9, 15)
        const status = summarizeStatusRecord({
            result: {
                active: false,
                tz: 'UTC',
                lastWindow: { end: new Date(lastEnd).toISOString() },
                nextWindow: { start: new Date(nextStart).toISOString() }
            }
        })
        const now = nextStart - 3 * 60 * 60 * 1000 - 10 * 60 * 1000
        const result = deriveScenarioListStatus(baseItem({ status }), now)
        expect(result.kind).toBe('waiting')
        expect(result.label).toBe('Запуск через 3 ч')
    })

    it('switches to running when next window starts', () => {
        const start = Date.UTC(2024, 0, 1, 13, 0)
        const end = Date.UTC(2024, 0, 1, 15, 0)
        const status = summarizeStatusRecord({
            result: {
                active: false,
                nextWindow: { start, end }
            }
        })
        const now = start + 5 * 60 * 1000
        const result = deriveScenarioListStatus(baseItem({ status }), now)
        expect(result.kind).toBe('running')
    })

    it('treats active scenario outside window as waiting', () => {
        const start = Date.UTC(2024, 0, 1, 13, 0)
        const end = Date.UTC(2024, 0, 1, 15, 0)
        const status = summarizeStatusRecord({
            result: {
                active: true,
                tz: 'UTC',
                currentWindow: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
                nextWindow: { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
            }
        })
        const now = start - 30 * 60 * 1000
        const result = deriveScenarioListStatus(baseItem({ status }), now)
        expect(result.kind).toBe('waiting')
        expect(result.label).toBe('Запуск через 30 мин')
    })

    it('falls back to actions counter when no window data is present', () => {
        const status = summarizeStatusRecord({
            result: {
                active: true,
                actionsSent: 2
            }
        })
        const result = deriveScenarioListStatus(baseItem({ status }), Date.UTC(2024, 0, 1, 12, 0))
        expect(result.kind).toBe('running')
    })

    it('treats zero actions as waiting when no window data exists', () => {
        const status = summarizeStatusRecord({
            result: {
                active: true,
                actionsSent: 0
            }
        })
        const result = deriveScenarioListStatus(baseItem({ status }), Date.UTC(2024, 0, 1, 12, 0))
        expect(result.kind).toBe('waiting')
        expect(result.label).toBe('Завершен')
    })

    it('uses nextRunUtc and completedAt fields from backend summary', () => {
        const status = summarizeStatusRecord({
            result: {
                active: false,
                completedAt: '2024-01-01T09:00:00.000Z',
                nextRunUtc: '2024-01-01T13:00:00.000Z'
            }
        })
        const now = Date.UTC(2024, 0, 1, 12, 0)
        const result = deriveScenarioListStatus(baseItem({ status }), now)
        expect(result.kind).toBe('waiting')
        expect(result.label).toBe('Запуск через 1 ч')
    })

    it('prefers schedule windows over lastEndedAt timestamps', () => {
        const status = summarizeStatusRecord({
            result: {
                active: false,
                lastEndedAt: '2024-01-02T00:00:00.000Z',
                lastWindow: { end: '2024-01-01T09:00:00.000Z' },
                nextWindow: { start: '2024-01-01T13:00:00.000Z' }
            }
        })
        const now = Date.UTC(2024, 0, 1, 10, 0)
        const result = deriveScenarioListStatus(baseItem({ status }), now)
        expect(result.label).toBe('Завершен 1 ч назад')
    })
})
