import { describe, it, expect } from 'vitest'
import {
    hasBrightnessCapability,
    supportsColorCapability,
    hasPowerCapability,
    isTargetDevice
} from '../src/utils/deviceCapabilities'

describe('deviceCapabilities', () => {
    it('detects brightness/color/power capabilities', () => {
        const device = {
            capabilities: [
                { type: 'devices.capabilities.on_off' },
                { type: 'devices.capabilities.range', parameters: { instance: 'brightness' } },
                { type: 'devices.capabilities.color_setting', parameters: { color_model: 'rgb' } }
            ]
        }
        expect(hasPowerCapability(device)).toBe(true)
        expect(hasBrightnessCapability(device)).toBe(true)
        expect(supportsColorCapability(device)).toBe(true)
    })

    it('rejects sensors and non-target devices', () => {
        const sensor = {
            name: 'Motion sensor',
            type: 'sensor',
            capabilities: [{ type: 'devices.capabilities.on_off' }]
        }
        expect(isTargetDevice(sensor)).toBe(false)
    })

    it('accepts lights with brightness/color', () => {
        const lamp = {
            name: 'Living lamp',
            type: 'light',
            capabilities: [
                { type: 'devices.capabilities.on_off' },
                { type: 'devices.capabilities.range', parameters: { instance: 'brightness' } }
            ]
        }
        expect(isTargetDevice(lamp)).toBe(true)
    })
})
