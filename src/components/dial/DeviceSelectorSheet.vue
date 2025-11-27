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
    border-radius: 16px;
    padding: 12px 0px 12px 0px;
}

.section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.section-title {
    margin: 0 0 8px;
    font-weight: 600;
    color: #e5e7eb;
}

.group-row,
.device-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.group-row:last-child,
.device-row:last-child {
    border-bottom: none;
}

.group-name {
    margin: 0;
    font-weight: 600;
    color: #e5e7eb;
}

.group-meta {
    margin: 2px 0 0;
    color: #94a3b8;
    font-size: 12px;
}

.group-badge {
    display: inline-flex;
    padding: 2px 8px;
    border-radius: 10px;
    background: rgba(99, 102, 241, 0.2);
    color: #c5c7ff;
    font-size: 10px;
    text-transform: uppercase;
}

.group-devices {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
    padding-left: 16px;
}

.group-device-row {
    border-bottom: none;
    padding: 6px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.group-title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.group-device-row span {
    font-size: 13px;
    color: #e5e7eb;
}

.device-row span {
    font-size: 15px;
    color: #e2e8f0;
}

.toggle {
    width: 44px;
    height: 24px;
    border-radius: 999px;
    border: none;
    background: rgba(148, 163, 184, 0.4);
    padding: 0;
    position: relative;
    cursor: pointer;
}

.toggle.small {
    width: 34px;
    height: 20px;
}

.toggle span {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: white;
    top: 3px;
    left: 4px;
    transition: transform 0.2s;
}

.toggle.small span {
    width: 14px;
    height: 14px;
    top: 3px;
    left: 3px;
}

.toggle.active {
    background: #34d399;
}

.toggle.active span {
    transform: translateX(18px);
}

.toggle.small.toggle.active span {
    transform: translateX(14px);
}
</style>
