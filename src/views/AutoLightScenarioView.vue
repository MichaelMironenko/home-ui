<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AutoLightEditor from '../components/AutoLightEditor.vue'

const route = useRoute()
const router = useRouter()

const routeId = computed(() => route.params.id)
const scenarioId = computed(() => {
  const id = routeId.value
  return typeof id === 'string' ? id : ''
})

const isCreateMode = computed(() => route.name === 'auto-light-create')

function handleSaved(id) {
  if (!id) return
  if (isCreateMode.value || scenarioId.value !== id) {
    router.replace({ name: 'auto-light-edit', params: { id } })
  }
}
</script>

<template>
  <div class="view">
    <AutoLightEditor
      :key="isCreateMode ? 'new' : scenarioId"
      :scenario-id="isCreateMode ? '' : scenarioId"
      @saved="handleSaved"
    />
  </div>
</template>

<style scoped>
.view {
  padding: 0 0 40px;
}
</style>
