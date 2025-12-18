<script setup>
import { computed, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ScenarioEditor from '../components/ScenarioEditor.vue'
import { setDocumentDescription, setDocumentTitle, SCENARIOS_TITLE } from '../utils/pageTitle'

const route = useRoute()
const router = useRouter()

const paramId = computed(() => route.params.id)
const scenarioId = computed(() => {
  const id = paramId.value
  return typeof id === 'string' ? id : ''
})

const isCreateMode = computed(() => route.name === 'scenario-create-legacy')

watchEffect(() => {
  setDocumentTitle(isCreateMode.value ? 'Новый классический сценарий' : 'Классический сценарий', SCENARIOS_TITLE)
  setDocumentDescription(
    isCreateMode.value
      ? 'Создайте классический сценарий ExtraHub для умного света: расписания, режимы и цели устройств.'
      : 'Редактирование классического сценария ExtraHub: управление временем, устройствами и паузами.'
  )
})

function handleSaved(id) {
  if (!id) return
  const current = scenarioId.value
  if (isCreateMode.value || current !== id) {
    router.replace({ name: 'scenario-edit-legacy', params: { id } })
  }
}

function handleDeleted() {
  router.replace({ name: 'scenarios-list' })
}
</script>

<template>
  <div class="scenario-page">
    <ScenarioEditor
      :key="isCreateMode ? 'new' : scenarioId"
      :scenario-id="isCreateMode ? '' : scenarioId"
      @saved="handleSaved"
      @deleted="handleDeleted"
    />
  </div>
</template>

<style scoped>
.scenario-page {
  padding: 24px 0 40px;
}
</style>
