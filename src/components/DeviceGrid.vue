<script setup>
import { ref, onMounted, computed } from 'vue'
import DeviceCard from './DeviceCard.vue'



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

onMounted(async () => {
    loading.value = true
    error.value = null
    try {
        const url = `${props.apiBase}${props.path}`
        const res = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(props.apiKey ? { 'x-api-key': props.apiKey } : {}),
            }
        })
        const data = await res.json()

        // поддержим оба режима:
        // 1) debug_devices=1 -> { devices:[{id,...,capabilities:[string]}], groups:[...] }
        // 2) debug_userinfo=1 -> сырой user/info (devices objects с полями state/params и rooms)
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

        // комнаты если есть
        const rooms = data.rooms || data?.payload?.rooms || []
        roomsById.value = Object.fromEntries(
            rooms.map(r => [r.id, r])
        )
    } catch (e) {
        error.value = e?.message || String(e)
    } finally {
        loading.value = false
    }
})

const displayEntities = computed(() => {
    const groupedIds = new Set()
    groups.value.forEach(group => {
        (group.devices || []).forEach(id => groupedIds.add(id))
    })

    const normalizedGroups = groups.value.map(group => ({
        ...group,
        entityType: 'group',
        type: group.type || 'devices.types.group',
        properties: group.properties || []
    }))

    const standaloneDevices = devices.value
        .filter(device => !groupedIds.has(device.id))
        .map(device => ({
            ...device,
            entityType: device.entityType || 'device'
        }))

    return [...normalizedGroups, ...standaloneDevices]
})
</script>

<template>
    <div>
        <div v-if="loading">Loading devices…</div>
        <div v-else-if="error" style="color:#b00">Error: {{ error }}</div>
        <div v-else class="grid">
            <DeviceCard v-for="entity in displayEntities" :key="entity.id" :device="entity"
                :entity-type="entity.entityType" :rooms-by-id="roomsById" />
            <div v-if="displayEntities.length === 0" style="color:#666">No devices</div>
        </div>
    </div>
</template>

<style scoped>
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
}
</style>
