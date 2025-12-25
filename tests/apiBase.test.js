import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('apiBase', () => {
    beforeEach(() => {
        vi.resetModules()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns trimmed api base and caches', async () => {
        vi.doMock('../src/lib/api', () => ({
            getConfig: vi.fn(async () => ({ api: 'https://example.com/api/' }))
        }))
        const { ensureApiBase } = await import('../src/utils/apiBase')
        const first = await ensureApiBase()
        const second = await ensureApiBase()
        expect(first).toBe('https://example.com/api')
        expect(second).toBe('https://example.com/api')
    })

    it('throws when config lacks api base', async () => {
        vi.doMock('../src/lib/api', () => ({
            getConfig: vi.fn(async () => ({}))
        }))
        const { ensureApiBase } = await import('../src/utils/apiBase')
        await expect(ensureApiBase()).rejects.toThrow('scenariosURL')
    })
})
