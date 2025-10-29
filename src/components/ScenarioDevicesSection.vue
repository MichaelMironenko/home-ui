<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
    modelValue: {
        type: Object,
        default: () => ({ groups: [], devices: [] })
    },
    sections: {
        type: Array,
        default: () => []
    },
    loading: { type: Boolean, default: false },
    error: { type: [Object, String], default: null },
    showSelectedOnly: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const expanded = ref(new Set())

const selectedGroupIds = computed(() => new Set(props.modelValue?.groups || []))
const selectedDeviceIds = computed(() => new Set(props.modelValue?.devices || []))

const capabilityIcons = {
    brightness: '💡',
    color: '🌈'
}

const allGroups = computed(() =>
    props.sections.flatMap((section) => Array.isArray(section.groups) ? section.groups : [])
)

const standaloneDevices = computed(() =>
    props.sections.flatMap((section) => Array.isArray(section.devices) ? section.devices : [])
)

const allDevices = computed(() => {
    const seen = new Map()
    standaloneDevices.value.forEach((device) => {
        if (device?.id && !seen.has(device.id)) seen.set(device.id, device)
    })
    allGroups.value.forEach((group) => {
        (group.devices || []).forEach((device) => {
            if (device?.id && !seen.has(device.id)) seen.set(device.id, device)
        })
    })
    return Array.from(seen.values())
})

const totalSelected = computed(() => selectedGroupIds.value.size + selectedDeviceIds.value.size)

const showAllDevices = ref(false)

watch(
    () => props.showSelectedOnly,
    (next) => {
        if (!next) showAllDevices.value = false
    }
)

watch(
    () => totalSelected.value,
    (count) => {
        if (!count) showAllDevices.value = false
    }
)

const collapseEnabled = computed(() => props.showSelectedOnly && totalSelected.value > 0)
const collapseActive = computed(() => collapseEnabled.value && !showAllDevices.value)

const renderSections = computed(() => {
    if (!collapseActive.value) return props.sections || []
    const filtered = (props.sections || []).map((section) => {
        const groups = []
        const devices = []

            ; (section.groups || []).forEach((group) => {
                const groupSelected = selectedGroupIds.value.has(group.id)
                const memberList = Array.isArray(group.devices) ? group.devices : []
                if (groupSelected) {
                    groups.push({ ...group, devices: memberList.slice() })
                    return
                }
                const selectedMembers = memberList.filter((device) => selectedDeviceIds.value.has(device.id))
                if (selectedMembers.length) {
                    groups.push({ ...group, devices: selectedMembers })
                }
            })

            ; (section.devices || []).forEach((device) => {
                if (selectedDeviceIds.value.has(device.id)) devices.push(device)
            })

        if (!groups.length && !devices.length) return null
        return {
            ...section,
            groups,
            devices
        }
    }).filter(Boolean)

    return filtered.length ? filtered : props.sections || []
})

const summary = computed(() => {
    const items = []
    allGroups.value.forEach((group) => {
        if (selectedGroupIds.value.has(group.id)) items.push(group.name || 'Группа без имени')
    })
    allDevices.value.forEach((device) => {
        if (selectedDeviceIds.value.has(device.id)) {
            const label = device.detail ? `${device.name} · ${device.detail}` : device.name
            items.push(label || 'Устройство')
        }
    })
    if (!items.length) return 'Ничего не выбрано'
    return items.join(', ')
})

function updateSelection(groupSet, deviceSet) {
    emit('update:modelValue', {
        groups: Array.from(groupSet),
        devices: Array.from(deviceSet)
    })
}

function toggleGroup(group, checked) {
    const groupSet = new Set(selectedGroupIds.value)
    const deviceSet = new Set(selectedDeviceIds.value)
    const members = Array.isArray(group.devices) ? group.devices : []
    if (checked) {
        groupSet.add(group.id)
        members.forEach((device) => deviceSet.delete(device.id))
    } else {
        groupSet.delete(group.id)
    }
    updateSelection(groupSet, deviceSet)
}

function toggleDevice(group, device, checked) {
    const groupSet = new Set(selectedGroupIds.value)
    const deviceSet = new Set(selectedDeviceIds.value)
    if (checked) {
        deviceSet.add(device.id)
    } else {
        deviceSet.delete(device.id)
        groupSet.delete(group.id)
    }

    allGroups.value.forEach((entry) => {
        const required = Array.isArray(entry.devices) ? entry.devices.map((item) => item.id) : []
        const allSelected = required.every((id) => deviceSet.has(id))
        if (allSelected) {
            groupSet.add(entry.id)
            required.forEach((id) => deviceSet.delete(id))
        }
    })

    updateSelection(groupSet, deviceSet)
}

function toggleStandalone(device, checked) {
    const groupSet = new Set(selectedGroupIds.value)
    const deviceSet = new Set(selectedDeviceIds.value)
    if (checked) deviceSet.add(device.id)
    else deviceSet.delete(device.id)
    updateSelection(groupSet, deviceSet)
}

function capabilityBadges(supports) {
    const badges = []
    Object.keys(capabilityIcons).forEach((key) => {
        if (supports?.[key]) badges.push(capabilityIcons[key])
    })
    return badges
}

function isGroupExpanded(id) {
    return expanded.value.has(id)
}

function toggleGroupExpanded(id) {
    const next = new Set(expanded.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expanded.value = next
}
</script>

<template>
    <section class="blk">
        <header class="blk__header">
            <div>
                <h2>Целевые устройства</h2>
            </div>
            <span v-if="totalSelected" class="counter">{{ totalSelected }}</span>
        </header>


        <div v-if="loading" class="notice">
            Загрузка каталога устройств…
        </div>
        <div v-else-if="error" class="alert alert--error">
            Не удалось загрузить список устройств
        </div>

        <div v-if="collapseEnabled && !loading" class="rooms__controls">
            <button v-if="collapseActive" type="button" class="rooms__toggle" @click="showAllDevices = true">Показать
                все
                устройства</button>
            <button v-else-if="showAllDevices" type="button" class="rooms__toggle"
                @click="showAllDevices = false">Скрыть список</button>
        </div>

        <div v-if="!loading" class="rooms">
            <div v-for="section in renderSections" :key="section.id" class="room">
                <span v-if="section.mixed" class="room__hint">разные комнаты</span>
                <div class="entries">
                    <div v-for="group in section.groups" :key="group.id" class="entry entry--group"
                        :class="{ selected: selectedGroupIds.has(group.id) }">
                        <div class="entry__line">
                            <button type="button" class="entry__toggle" @click="toggleGroupExpanded(group.id)">
                                <span class="caret" :class="{ open: isGroupExpanded(group.id) }">▸</span>
                            </button>
                            <label class="entry__label">
                                <input type="checkbox" :value="group.id" :checked="selectedGroupIds.has(group.id)"
                                    @change="toggleGroup(group, $event.target.checked)" />
                                <div class="entry__title">
                                    <div class="entry__headline">
                                        <strong>{{ group.name }}</strong>
                                        <span class="badges">
                                            <span v-for="badge in capabilityBadges(group.supports)" :key="badge"
                                                class="badge">{{ badge }}</span>
                                        </span>
                                    </div>
                                    <small v-if="group.mixedRooms">Разные комнаты</small>
                                </div>
                            </label>
                        </div>
                        <ul v-show="isGroupExpanded(group.id)" class="entry__members">
                            <li v-for="device in group.devices" :key="device.id">
                                <label class="member">
                                    <input type="checkbox" :value="device.id"
                                        :checked="selectedGroupIds.has(group.id) || selectedDeviceIds.has(device.id)"
                                        :disabled="selectedGroupIds.has(group.id)"
                                        @change="toggleDevice(group, device, $event.target.checked)" />
                                    <div class="member__title">
                                        <div class="entry__headline">
                                            <strong>{{ device.name }}</strong>
                                            <span class="badges">
                                                <span v-for="badge in capabilityBadges(device.supports)" :key="badge"
                                                    class="badge">{{ badge }}</span>
                                            </span>
                                        </div>
                                        <small v-if="group.mixedRooms && device.detail">{{ device.detail }}</small>
                                    </div>
                                </label>
                            </li>
                        </ul>
                    </div>

                    <label v-for="device in section.devices" :key="device.id" class="entry entry--device"
                        :class="{ selected: selectedDeviceIds.has(device.id) }">
                        <input type="checkbox" :value="device.id" :checked="selectedDeviceIds.has(device.id)"
                            @change="toggleStandalone(device, $event.target.checked)" />
                        <div class="entry__title">
                            <div class="entry__headline">
                                <strong>{{ device.name }}</strong>
                                <span class="badges">
                                    <span v-for="badge in capabilityBadges(device.supports)" :key="badge"
                                        class="badge">{{ badge }}</span>
                                </span>
                            </div>
                        </div>
                    </label>
                </div>
            </div>

            <p v-if="!renderSections.length" class="muted">Нет подходящих устройств.</p>
        </div>
    </section>
</template>

<style scoped>
.blk {
    background: rgba(17, 24, 39, 0.7);
    border-radius: 16px;
    border: 1px solid rgba(55, 65, 81, 0.6);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.blk__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.blk__header h2 {
    margin: 0;
    font-size: 18px;
    color: #e5e7eb;
}

.blk__hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: #94a3b8;
}

.counter {
    min-width: 32px;
    height: 32px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(59, 130, 246, 0.22);
    color: #93c5fd;
    font-weight: 600;
}

.summary {
    margin: 0;
    font-size: 13px;
    color: #d1d5db;
}

.summary.empty {
    color: #9ca3af;
}

.notice {
    font-size: 13px;
    color: #9ca3af;
}

.alert {
    padding: 12px;
    border-radius: 12px;
    background: rgba(248, 113, 113, 0.12);
    border: 1px solid rgba(248, 113, 113, 0.4);
    color: #fecaca;
    font-size: 13px;
}

.rooms__controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: #94a3b8;
    margin: 4px 0;
}

.rooms__toggle {
    padding: 0;
    border: none;
    background: none;
    color: #93c5fd;
    font-size: 12px;
    cursor: pointer;
}

.rooms__toggle:hover {
    text-decoration: underline;
}

.rooms {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.room {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.room__hint {
    font-size: 12px;
    color: #facc15;
}

.entries {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.entry {
    display: flex;
    flex-direction: column;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid rgba(55, 65, 81, 0.5);
    background: rgba(17, 24, 39, 0.45);
    color: #e2e8f0;
    gap: 10px;
}

.entry.selected {
    border-color: rgba(147, 197, 253, 0.65);
    box-shadow: 0 0 0 1px rgba(147, 197, 253, 0.2);
}

.entry--device {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
}

.entry--device input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
}

.entry--device .entry__title {
    flex: 1;
}

.entry__line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.entry__toggle {
    border: none;
    background: transparent;
    color: #93c5fd;
    cursor: pointer;
    padding: 0;
    margin-top: 2px;
}

.caret {
    display: inline-block;
    transition: transform 0.15s ease;
}

.caret.open {
    transform: rotate(90deg);
}

.entry__label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex: 1;
}

.entry__label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
}

.entry__title {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.entry__headline {
    display: flex;
    align-items: center;
    gap: 8px;
}

.entry__headline strong {
    font-size: 14px;
    color: #e5e7eb;
}

.entry__title small {
    font-size: 11px;
    color: #a5b4fc;
}

.entry__members {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.member {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    color: #e2e8f0;
}

.member__title {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.member .entry__headline {
    gap: 6px;
}

.member input[type='checkbox'] {
    margin-top: 2px;
}

.badges {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    font-style: normal;
}

.badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: #facc15;
}

.muted {
    font-size: 13px;
    color: #9ca3af;
}
</style>
