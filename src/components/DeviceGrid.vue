<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import DeviceCard from './DeviceCard.vue'
import { trackYandexCall } from '../lib/requestMetrics'
import { hasBrightnessCapability, supportsColorCapability } from '../utils/deviceCapabilities'

const props = defineProps({
    apiBase: { type: String, required: true },
    path: { type: String, required: true },
    apiKey: { type: String, default: '' },
})

const loading = ref(true)
const error = ref(null)
const devices = ref([])
const groups = ref([])
const roomsById = ref({})
const roomOrder = ref(new Map())
const fetching = ref(false)

const capType = (cap) => {
    if (!cap) return ''
    if (typeof cap === 'string') return cap
    return cap.type || ''
}

const aggregateOnState = (members) => {
    let sawOn = false
    let sawOff = false
    for (const member of members) {
        if (!member) continue
        const caps = Array.isArray(member.capabilities) ? member.capabilities : []
        const onCap = caps.find((cap) => capType(cap).includes('on_off'))
        if (onCap?.state?.value === true) sawOn = true
        else if (onCap?.state?.value === false) sawOff = true
    }
    if (!sawOn && !sawOff) return null
    if (sawOn && !sawOff) return true
    if (!sawOn && sawOff) return false
    return null
}

const deriveGroupCapabilities = (group, members) => {
    const baseCaps = Array.isArray(group?.capabilities)
        ? group.capabilities.map((cap) => ({ ...cap }))
        : []
    const hasOnOff = baseCaps.some((cap) => capType(cap).includes('on_off'))
    if (!hasOnOff) {
        const aggregated = aggregateOnState(members)
        baseCaps.push(
            aggregated == null
                ? { type: 'devices.capabilities.on_off' }
                : { type: 'devices.capabilities.on_off', state: { instance: 'on', value: aggregated } }
        )
    }
    return baseCaps
}

const hasIllumination = (device) => {
    if (!device) return false
    return (Array.isArray(device.properties) ? device.properties : []).some(
        (prop) => prop?.parameters?.instance === 'illumination' &&
            typeof prop?.state?.value === 'number'
    )
}

const shouldDisplayDevice = (device) => {
    if (!device) return false
    if (hasIllumination(device)) return true
    return hasBrightnessCapability(device) || supportsColorCapability(device)
}

let pollId = null

async function loadCatalog({ refresh = false, showLoading = false } = {}) {
    if (fetching.value) return
    fetching.value = true
    if (showLoading) {
        loading.value = true
        error.value = null
    }
    try {
        const suffix = refresh ? '?refresh=1' : ''
        const url = `${props.apiBase}${props.path}${suffix}`
        trackYandexCall()
        const res = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(props.apiKey ? { 'x-api-key': props.apiKey } : {}),
            },
            credentials: 'include',
        })
        const text = await res.text()
        let data
        try {
            data = text ? JSON.parse(text) : null
        } catch (_) {
            throw new Error(text || `Malformed response (${res.status})`)
        }
        if (!res.ok) {
            throw new Error(data?.error || res.statusText || 'Request failed')
        }

        if (Array.isArray(data.devices)) {
            devices.value = data.devices
        } else if (Array.isArray(data?.devices)) {
            devices.value = data.devices
        } else if (Array.isArray(data?.payload?.devices)) {
            devices.value = data.payload.devices
        } else {
            devices.value = []
        }

        const groupList = data.groups || data?.payload?.groups || []
        groups.value = Array.isArray(groupList) ? groupList : []

        const rooms = data.rooms || data?.payload?.rooms || []
        roomsById.value = Object.fromEntries(
            rooms.map(r => [r.id, r])
        )
        const orderMap = new Map()
        rooms.forEach((room, index) => {
            if (room?.id) orderMap.set(room.id, index)
        })
        roomOrder.value = orderMap
    } catch (e) {
        if (showLoading) {
            error.value = e?.message || String(e)
        }
        return false
    } finally {
        fetching.value = false
        if (showLoading) loading.value = false
    }
    return true
}

onMounted(async () => {
    const initialSuccess = await loadCatalog({ refresh: false, showLoading: true })
    if (initialSuccess) {
        loadCatalog({ refresh: true, showLoading: false })
    }
    pollId = setInterval(() => loadCatalog({ refresh: false, showLoading: false }), 60000)
})

onBeforeUnmount(() => {
    if (pollId) clearInterval(pollId)
})

const filteredDevices = computed(() => devices.value.filter(shouldDisplayDevice))

const devicesById = computed(() => {
    const map = new Map()
    filteredDevices.value.forEach((device) => {
        if (device?.id) map.set(device.id, device)
    })
    return map
})

const normalizedGroups = computed(() => {
    return groups.value.map(group => {
        const memberDevices = (group.devices || [])
            .map((id) => devicesById.value.get(id))
            .filter(Boolean)
        if (!memberDevices.length) return null
        const memberRoomIds = Array.from(new Set(
            memberDevices
                .map((device) => device.room || '')
                .filter((value) => value)
        ))
        let roomId = ''
        let roomName = ''
        let mixed = false
        if (memberRoomIds.length === 1) {
            roomId = memberRoomIds[0]
            roomName = roomsById.value[roomId]?.name || ''
        } else if (memberRoomIds.length > 1) {
            mixed = true
            roomId = '__mixed__'
            roomName = 'Разные комнаты'
        }
        return {
            ...group,
            entityType: 'group',
            type: group.type || 'devices.types.group',
            properties: group.properties || [],
            capabilities: deriveGroupCapabilities(group, memberDevices),
            roomId,
            roomName,
            mixed,
            memberDevices
        }
    }).filter(Boolean)
})

const groupedIds = computed(() => {
    const set = new Set()
    normalizedGroups.value.forEach(group => {
        (group.memberDevices || []).forEach(device => {
            if (device?.id) set.add(device.id)
        })
    })
    return set
})

const standaloneDevices = computed(() => {
    return filteredDevices.value
        .filter(device => !groupedIds.value.has(device.id))
        .map(device => ({
            ...device,
            entityType: device.entityType || 'device'
        }))
})

const ensureSection = (map, roomId, name, extras = {}) => {
    const key = roomId || '__unknown__'
    if (!map.has(key)) {
        const defaultName = roomId ? (roomsById.value[roomId]?.name || 'Без комнаты') : 'Без комнаты'
        const defaultOrder = typeof extras.order === 'number'
            ? extras.order
            : (roomId && roomOrder.value.has(roomId)
                ? roomOrder.value.get(roomId)
                : Number.MAX_SAFE_INTEGER)
        map.set(key, {
            id: key,
            name: name || defaultName,
            order: defaultOrder,
            items: [],
            mixed: !!extras.mixed
        })
    }
    const section = map.get(key)
    if (name && !section.name) {
        section.name = name
    }
    if (name && section.name === 'Без комнаты') {
        section.name = name
    }
    if (typeof extras.order === 'number') {
        section.order = Math.min(section.order ?? Number.MAX_SAFE_INTEGER, extras.order)
    }
    return section
}

const getPriority = (entity) => {
    if (!entity) return 3
    if (entity.entityType === 'group') return 1
    const typeHint = String(entity?.type || entity?.deviceType || entity?.kind || entity?.icon || '')
        .toLowerCase()
    if (typeHint.includes('light')) return 0
    if (hasBrightnessCapability(entity) || supportsColorCapability(entity)) return 0
    const hasIlluminationProp = (entity.properties || []).some(p => p?.parameters?.instance === 'illumination')
    if (hasIlluminationProp) return 2
    return 3
}

const sections = computed(() => {
    const sectionMap = new Map()
    normalizedGroups.value.forEach(group => {
        const roomId = group.roomId || ''
        const order = group.mixed ? Number.MAX_SAFE_INTEGER - 1 : (group.roomId && roomOrder.value.has(group.roomId)
            ? roomOrder.value.get(group.roomId)
            : Number.MAX_SAFE_INTEGER)
        const section = ensureSection(sectionMap, roomId, group.roomName || '', {
            order,
            mixed: group.mixed
        })
        section.items.push(group)
    })
    standaloneDevices.value.forEach(device => {
        const roomId = device.room || ''
        const order = roomId && roomOrder.value.has(roomId) ? roomOrder.value.get(roomId) : Number.MAX_SAFE_INTEGER
        const section = ensureSection(sectionMap, roomId, roomId ? roomsById.value[roomId]?.name || '' : 'Без комнаты', {
            order
        })
        section.items.push(device)
    })
    const list = Array.from(sectionMap.values()).filter(section => section.items.length)
    list.forEach(section => {
        section.items.sort((a, b) => {
            const pa = getPriority(a)
            const pb = getPriority(b)
            if (pa !== pb) return pa - pb
            return 0
        })
    })
    list.sort((a, b) => {
        const orderA = a.order ?? Number.MAX_SAFE_INTEGER
        const orderB = b.order ?? Number.MAX_SAFE_INTEGER
        if (orderA !== orderB) return orderA - orderB
        return a.name.localeCompare(b.name, 'ru')
    })
    return list
})
</script>

<template>
    <div>
        <div v-if="loading">Loading devices…</div>
        <div v-else-if="error" style="color:#b00">Error: {{ error }}</div>
        <div v-else>
            <section v-for="section in sections" :key="section.id" class="section">
                <div class="section-header">{{ section.name }}</div>
                <div class="grid">
                    <DeviceCard v-for="entity in section.items" :key="entity.id" :device="entity"
                        :entity-type="entity.entityType" />
                </div>
            </section>
            <div v-if="!sections.length" class="empty-state">No devices</div>
        </div>
    </div>
</template>

<style scoped>
.section {
    margin-bottom: 16px;
}

.section-header {
    font-weight: 600;
    font-size: 14px;
    color: #e2e8f0;
    margin-bottom: 8px;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    grid-auto-rows: minmax(120px, auto);
}

@media (max-width: 640px) {
    .grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.empty-state {
    color: #cbd5f5;
    margin-top: 12px;
}
</style>
