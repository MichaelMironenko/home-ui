import { computed, onUnmounted, ref } from 'vue'
import { deriveScenarioListStatus, summarizeStatusRecord } from '../utils/scenarioStatusDisplay'
import { useScenariosApi } from './useScenariosApi'

const DEFAULT_POLL_INTERVAL = 5 * 60 * 1000

function normalizeScenarioEntry(entry = {}) {
  const statusPayload = summarizeStatusRecord(entry?.statusSummary || entry?.status || null)
  return {
    pause: entry?.pause || null,
    disabled: entry?.disabled === true,
    status: statusPayload
  }
}

export function useRunningScenarioMonitor({ pollInterval = DEFAULT_POLL_INTERVAL } = {}) {
  const { cfg, loadConfig, scenariosRequest } = useScenariosApi()
  const hasRunningScenario = ref(false)
  const loading = ref(false)
  const error = ref(null)
  let pollId = null

  async function refresh() {
    if (!cfg.value.base) {
      try {
        await loadConfig()
      } catch (err) {
        error.value = err?.message || String(err)
        return
      }
    }
    loading.value = true
    error.value = null
    try {
      const data = await scenariosRequest('/list?full=1')
      const list = Array.isArray(data?.scenarios) ? data.scenarios : []
      const running = list.some((entry) => {
        const normalized = normalizeScenarioEntry(entry)
        const derived = deriveScenarioListStatus(
          {
            pause: normalized.pause,
            disabled: normalized.disabled,
            status: normalized.status
          },
          Date.now()
        )
        return derived?.kind === 'running'
      })
      hasRunningScenario.value = running
    } catch (err) {
      error.value = err?.message || String(err)
    } finally {
      loading.value = false
    }
  }

  function startAutoRefresh() {
    if (pollId) return
    pollId = setInterval(refresh, pollInterval)
  }

  function stopAutoRefresh() {
    if (!pollId) return
    clearInterval(pollId)
    pollId = null
  }

  onUnmounted(() => {
    stopAutoRefresh()
  })

  const ready = computed(() => !loading.value && error.value === null)

  return {
    hasRunningScenario,
    loading,
    error,
    ready,
    refresh,
    startAutoRefresh,
    stopAutoRefresh
  }
}
