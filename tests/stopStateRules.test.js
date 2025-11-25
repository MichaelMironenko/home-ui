import { describe, it, expect } from 'vitest'
import {
    lockColorUsage,
    lockColorMode,
    lockBrightnessUsage,
    applyBrightnessMode
} from '../src/utils/stopStateRules'

function createStop(overrides = {}) {
    return {
        useColor: true,
        colorMode: 'temperature',
        useBrightness: true,
        colorHex: '#ffffff',
        ...overrides
    }
}

describe('lockColorUsage', () => {
    it('disables color on end stop when start stop disables it', () => {
        const start = createStop({ useColor: false })
        const end = createStop({ useColor: true, colorMode: 'rgb' })
        lockColorUsage(start, end)
        expect(end.useColor).toBe(false)
    })

    it('forces end stop to use the same color mode as the start stop', () => {
        const start = createStop({ colorMode: 'rgb' })
        const end = createStop({ colorMode: 'temperature' })
        lockColorUsage(start, end)
        expect(end.useColor).toBe(true)
        expect(end.colorMode).toBe('rgb')
    })
})

describe('lockColorMode', () => {
    it('keeps the end stop color mode in sync without overriding its color value', () => {
        const start = createStop({ colorMode: 'rgb', colorHex: '#0000ff' })
        const end = createStop({ colorMode: 'temperature', colorHex: '#a0522d' })
        lockColorMode(start, end)
        expect(end.colorMode).toBe('rgb')
        expect(end.colorHex).toBe('#a0522d')
    })
})

describe('lockBrightnessUsage', () => {
    it('mirrors manual brightness usage from start to end', () => {
        const start = createStop({ useBrightness: false })
        const end = createStop({ useBrightness: true })
        lockBrightnessUsage(start, end)
        expect(end.useBrightness).toBe(false)
    })
})

describe('applyBrightnessMode', () => {
    it('enables auto brightness for both stops when selecting auto', () => {
        const start = createStop({ useBrightness: false })
        const end = createStop({ useBrightness: false })
        const auto = { enabled: false }
        applyBrightnessMode('auto', auto, start, end)
        expect(auto.enabled).toBe(true)
        expect(start.useBrightness).toBe(true)
        expect(end.useBrightness).toBe(true)
    })

    it('disables auto brightness without altering manual usage', () => {
        const start = createStop({ useBrightness: true })
        const end = createStop({ useBrightness: true })
        const auto = { enabled: true }
        applyBrightnessMode('manual', auto, start, end)
        expect(auto.enabled).toBe(false)
        expect(start.useBrightness).toBe(true)
        expect(end.useBrightness).toBe(true)
    })
})
