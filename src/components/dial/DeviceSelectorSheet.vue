<script setup>
defineProps({
  sections: {
    type: Array,
    required: true
  },
  selectedIds: {
    type: Object,
    required: true
  },
  selectedCount: {
    type: Number,
    required: true
  }
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <div>
    <p class="modal-hint">
      Выберите лампы с управлением яркостью и цветом. Сейчас выбрано {{ selectedCount }} устройств.
    </p>
    <div v-for="section in sections" :key="section.id" class="device-section">
      <p class="section-title">{{ section.name }}</p>
      <label v-for="device in section.devices" :key="device.id" class="device-row">
        <span>{{ device.name }}</span>
        <button
          type="button"
          class="toggle"
          :class="{ active: selectedIds.has(device.id) }"
          @click.prevent="emit('toggle', device.id)"
        >
          <span />
        </button>
      </label>
    </div>
  </div>
</template>

<style scoped>
.modal-hint {
  margin: 0;
  color: #94a3b8;
}

.device-section {
  background: #0b1220;
  border-radius: 16px;
  padding: 12px;
  margin-top: 12px;
}

.section-title {
  margin: 0 0 8px;
  font-weight: 600;
}

.device-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.device-row:last-child {
  border-bottom: none;
}

.toggle {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: rgba(148, 163, 184, 0.4);
  padding: 0;
  position: relative;
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

.toggle.active {
  background: #34d399;
}

.toggle.active span {
  transform: translateX(18px);
}
</style>
