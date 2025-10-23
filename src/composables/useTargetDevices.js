import { computed } from 'vue'
import {
  hasBrightnessCapability,
  supportsColorCapability,
  hasPowerCapability,
  isTargetDevice
} from '../utils/deviceCapabilities'

const summarizeDevice = (device, roomsById) => {
  const roomId = device?.room || ''
  const roomName = roomId ? roomsById.value.get(roomId)?.name : ''
  return {
    id: device.id,
    name: device.name || 'Без имени',
    detail: roomName || device.roomName || '',
    roomId,
    supports: {
      brightness: hasBrightnessCapability(device),
      color: supportsColorCapability(device),
      power: hasPowerCapability(device)
    }
  }
}

export function useTargetDevices(catalog, target) {
  const roomsById = computed(() => {
    const map = new Map()
    ;(catalog.rooms || []).forEach((room) => {
      if (room?.id) map.set(room.id, room)
    })
    return map
  })

  const devicesById = computed(() => {
    const map = new Map()
    ;(catalog.devices || []).forEach((device) => {
      if (device?.id) map.set(device.id, device)
    })
    return map
  })

  const groupEntries = computed(() => {
    return (catalog.groups || [])
      .map((group) => {
        const memberIds = Array.isArray(group.devices) ? group.devices : []
        const members = memberIds
          .map((id) => devicesById.value.get(id))
          .filter(isTargetDevice)
          .map((device) => summarizeDevice(device, roomsById))
        if (!members.length) return null
        const supports = members.reduce(
          (acc, item) => ({
            brightness: acc.brightness || item.supports.brightness,
            color: acc.color || item.supports.color,
            power: acc.power || item.supports.power
          }),
          { brightness: false, color: false, power: false }
        )
        const memberRoomIds = Array.from(
          new Set(
            members
              .map((item) => item.roomId)
              .filter((value) => typeof value === 'string' && value.length)
          )
        )
        let roomId = ''
        let roomName = ''
        let mixedRooms = false
        if (!memberRoomIds.length) {
          roomId = ''
          roomName = ''
        } else if (memberRoomIds.length === 1) {
          roomId = memberRoomIds[0]
          roomName = roomsById.value.get(roomId)?.name || ''
        } else {
          mixedRooms = true
          roomId = '__mixed__'
          roomName = 'Разные комнаты'
        }
        return {
          id: group.id,
          name: group.name || 'Группа без имени',
          devices: members,
          supports,
          roomId,
          roomName,
          mixedRooms
        }
      })
      .filter(Boolean)
  })

  const groupedDeviceIds = computed(() => {
    const set = new Set()
    groupEntries.value.forEach((group) => {
      group.devices.forEach((device) => set.add(device.id))
    })
    return set
  })

  const standaloneDevices = computed(() => {
    return (catalog.devices || [])
      .filter((device) => isTargetDevice(device) && !groupedDeviceIds.value.has(device.id))
      .map((device) => summarizeDevice(device, roomsById))
  })

  const sections = computed(() => {
    const roomOrder = new Map()
    ;(catalog.rooms || []).forEach((room, index) => {
      if (room?.id) roomOrder.set(room.id, index)
    })

    const ensureSection = (map, id, name, extras = {}) => {
      const key = id || '__unknown__'
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: name || (roomsById.value.get(id)?.name || 'Без комнаты'),
          groups: [],
          devices: [],
          ...extras
        })
      }
      const section = map.get(key)
      if (name && !section.name) section.name = name
      if (typeof extras.order === 'number') {
        const nextOrder = extras.order
        section.order = typeof section.order === 'number' ? Math.min(section.order, nextOrder) : nextOrder
      }
      if (extras.mixed) section.mixed = true
      return section
    }

    const sectionMap = new Map()

    groupEntries.value.forEach((group) => {
      const roomId = group.mixedRooms ? '__mixed__' : group.roomId || '__unknown__'
      const name = group.mixedRooms
        ? 'Разные комнаты'
        : roomsById.value.get(group.roomId)?.name || group.roomName || 'Без комнаты'
      const section = ensureSection(sectionMap, roomId, name, {
        order: group.mixedRooms
          ? Number.MAX_SAFE_INTEGER - 1
          : roomOrder.get(group.roomId) ?? Number.MAX_SAFE_INTEGER - 2,
        mixed: group.mixedRooms
      })
      if (group.mixedRooms) section.mixed = true
      section.groups.push(group)
    })

    standaloneDevices.value.forEach((device) => {
      const roomId = device.roomId || '__unknown__'
      const name = device.roomId ? roomsById.value.get(device.roomId)?.name || device.detail || '' : 'Без комнаты'
      const section = ensureSection(sectionMap, roomId, name, {
        order: roomOrder.get(device.roomId) ?? Number.MAX_SAFE_INTEGER - 2
      })
      section.devices.push(device)
    })

    const list = Array.from(sectionMap.values()).filter((section) => section.groups.length || section.devices.length)
    list.sort((a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return a.name.localeCompare(b.name, 'ru')
    })
    return list
  })

  const selectedDevices = computed(() => {
    const result = new Map()
    ;(target.devices || []).forEach((id) => {
      const device = devicesById.value.get(id)
      if (device) result.set(id, summarizeDevice(device, roomsById))
    })
    ;(target.groups || []).forEach((groupId) => {
      const group = groupEntries.value.find((entry) => entry.id === groupId)
      group?.devices.forEach((device) => result.set(device.id, device))
    })
    return Array.from(result.values())
  })

  return {
    roomsById,
    devicesById,
    sections,
    selectedDevices,
    groupEntries,
    standaloneDevices
  }
}
