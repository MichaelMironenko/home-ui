import { describe, it, expect } from 'vitest'
import { reactive } from 'vue'
import { useTargetDevices } from '../src/composables/useTargetDevices'

const makeDevice = (overrides = {}) => ({
    id: 'dev-1',
    name: 'Lamp',
    room: 'room-1',
    capabilities: [
        { type: 'devices.capabilities.on_off' },
        { type: 'devices.capabilities.range', parameters: { instance: 'brightness' } },
        { type: 'devices.capabilities.color_setting', parameters: { color_model: 'rgb' } }
    ],
    ...overrides
})

describe('useTargetDevices', () => {
    it('builds group entries with mixed room detection', () => {
        const catalog = reactive({
            rooms: [{ id: 'room-1', name: 'Living' }, { id: 'room-2', name: 'Kitchen' }],
            devices: [
                makeDevice({ id: 'd1', room: 'room-1' }),
                makeDevice({ id: 'd2', room: 'room-2' })
            ],
            groups: [{ id: 'g1', name: 'Group', devices: ['d1', 'd2'] }]
        })
        const target = reactive({ devices: [], groups: [] })
        const { groupEntries } = useTargetDevices(catalog, target)
        expect(groupEntries.value).toHaveLength(1)
        expect(groupEntries.value[0].mixedRooms).toBe(true)
        expect(groupEntries.value[0].roomName).toBe('Разные комнаты')
    })

    it('filters standalone devices that are already in groups', () => {
        const catalog = reactive({
            rooms: [{ id: 'room-1', name: 'Living' }],
            devices: [makeDevice({ id: 'd1', room: 'room-1' }), makeDevice({ id: 'd2', room: 'room-1' })],
            groups: [{ id: 'g1', name: 'Group', devices: ['d1'] }]
        })
        const target = reactive({ devices: [], groups: [] })
        const { standaloneDevices } = useTargetDevices(catalog, target)
        const ids = standaloneDevices.value.map((device) => device.id)
        expect(ids).toEqual(['d2'])
    })

    it('expands selected groups into selected devices', () => {
        const catalog = reactive({
            rooms: [{ id: 'room-1', name: 'Living' }],
            devices: [makeDevice({ id: 'd1', room: 'room-1' }), makeDevice({ id: 'd2', room: 'room-1' })],
            groups: [{ id: 'g1', name: 'Group', devices: ['d1', 'd2'] }]
        })
        const target = reactive({ devices: [], groups: ['g1'] })
        const { selectedDevices } = useTargetDevices(catalog, target)
        const ids = selectedDevices.value.map((device) => device.id).sort()
        expect(ids).toEqual(['d1', 'd2'])
    })
})
