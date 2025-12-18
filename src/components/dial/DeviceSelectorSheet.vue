<script setup>
const props = defineProps({
    sections: {
        type: Array,
        required: true
    },
    selectedIds: {
        type: Object,
        required: true
    },
    selectedGroups: {
        type: Object,
        required: true
    }
})

const emit = defineEmits(['toggle-group', 'toggle-device'])

function handleGroupToggle(group, event) {
    event.preventDefault()
    if (!group || !group.id) return
    emit('toggle-group', group, !props.selectedGroups.has(group.id))
}

function handleDeviceToggle(device, group, event) {
    event.preventDefault()
    if (!device || !device.id) return
    emit('toggle-device', { device, group }, !props.selectedIds.has(device.id))
}
</script>

<template>
    <div>
        <div v-for="section in props.sections" :key="section.id" class="device-section">
            <div class="section-header">
                <p class="section-title">{{ section.name }}</p>
            </div>
            <div v-for="group in section.groups" :key="group.id" class="group-block">
                <div class="group-row">
                    <div class="group-title">
                        <p class="group-name">{{ group.name }}</p>
                        <span class="group-badge">Группа</span>
                    </div>
                    <button type="button" class="toggle" :class="{ active: props.selectedGroups.has(group.id) }"
                        @click="(event) => handleGroupToggle(group, event)">
                        <span />
                    </button>
                </div>
                <div class="group-devices">
                    <label v-for="device in group.devices" :key="device.id" class="group-device-row">
                        <span>{{ device.name }}</span>
                        <button type="button" class="toggle small" :class="{ active: props.selectedIds.has(device.id) }"
                            @click="(event) => handleDeviceToggle(device, group, event)">
                            <span />
                        </button>
                    </label>
                </div>
            </div>
            <label v-for="device in section.devices" :key="device.id" class="device-row">
                <span>{{ device.name }}</span>
                <button type="button" class="toggle" :class="{ active: props.selectedIds.has(device.id) }"
                    @click="(event) => handleDeviceToggle(device, null, event)">
                    <span />
                </button>
            </label>
        </div>
    </div>
</template>

<style scoped>
.device-section {
    background: #0b1220;
    border-radius: 14px;
    padding: 8px 0 6px;
    margin-bottom: 10px;
    border: 1px solid rgba(148, 163, 184, 0.12);
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 0 12px 4px;
}

.section-title {
    margin: 0;
    font-weight: 600;
    color: #717884;
    font-size: 19px;
}

.group-row,
.device-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.group-row:last-child,
.device-row:last-child {
    border-bottom: none;
}

.group-name {
    margin: 0;
    font-weight: 600;
    color: #e5e7eb;
    font-size: 17px;
    margin-left: 12px;
}

.group-meta {
    margin: 2px 0 0;
    color: #94a3b8;
    font-size: 12px;
}

.group-badge {
    display: inline-flex;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(99, 102, 241, 0.18);
    color: #c5c7ff;
    font-size: 10px;
    text-transform: uppercase;
}

.group-devices {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
    padding: 0 12px 0 32px;
}

.group-device-row {
    border-bottom: none;
    padding: 4px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.group-title {
    display: flex;
    align-items: center;
    gap: 6px;
}

.group-device-row span {
    font-size: 15px;
    color: #e5e7eb;
}

.device-row span {
    font-size: 14px;
    color: #e2e8f0;
}

.toggle {
    width: 38px;
    height: 20px;
    border-radius: 999px;
    border: none;
    background: rgba(148, 163, 184, 0.4);
    padding: 0;
    position: relative;
    cursor: pointer;
}

.toggle.small {
    width: 30px;
    height: 18px;
}

.toggle span {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    top: 2px;
    left: 3px;
    transition: transform 0.2s;
}

.toggle.small span {
    width: 12px;
    height: 12px;
    top: 3px;
    left: 3px;
}

.toggle.active {
    background: var(--primary);
}

.toggle.active span {
    transform: translateX(16px);
}

.toggle.small.toggle.active span {
    transform: translateX(12px);
}
</style>
