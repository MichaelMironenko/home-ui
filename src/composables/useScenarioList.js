import { computed, ref } from 'vue'
import { cacheScenarioUpdate, seedScenarioCacheFromList } from '../lib/scenarioCache'
import { summarizeStatusRecord } from '../utils/scenarioStatusDisplay'
import { computeEnvironment } from '../utils/scenarioUtils'

function mapScenarioEntry(entry) {
    const key = String(entry?.key || '').trim()
    const cleanedId = key.replace(/^scenarios\//, '').replace(/\.json$/i, '')
    const id = String(entry?.id || cleanedId || '').trim()
    const name = String(entry?.name || cleanedId || id || '').trim() || 'Без имени'
    const statusSummary = summarizeStatusRecord(entry?.status || null)
    if (entry?.scenario) {
        const meta = entry?.lastModified != null || entry?.etag
            ? { lastModified: entry.lastModified, etag: entry?.etag || null }
            : null
        cacheScenarioUpdate(entry.scenario, meta, statusSummary)
    }
    const time = entry?.time || entry?.scenario?.time || null
    return {
        id,
        name,
        key,
        size: Number(entry?.size) || 0,
        lastModified: entry?.lastModified || '',
        etag: entry?.etag || '',
        pause: entry?.pause || null,
        status: statusSummary,
        type: entry?.type || null,
        disabled: entry?.disabled === true,
        time,
        env: computeEnvironment(time || {}),
        actions: Array.isArray(entry?.actions)
            ? entry.actions
            : Array.isArray(entry?.scenario?.actions)
                ? entry.scenario.actions
                : [],
        overlaps: Array.isArray(entry?.overlaps) ? entry.overlaps : [],
        targetGroups: Array.isArray(entry?.scenario?.target?.groups)
            ? entry.scenario.target.groups.map((groupId) => String(groupId))
            : []
    }
}

export function useScenarioList({ scenariosRequest, cfg, error }) {
    const loading = ref(true)
    const scenarios = ref([])
    const toggling = ref({})

    const sortedScenarios = computed(() => {
        return [...scenarios.value].sort((a, b) => {
            if (a.disabled !== b.disabled) return a.disabled ? 1 : -1
            return a.name.localeCompare(b.name)
        })
    })

    const hasScenarios = computed(() => sortedScenarios.value.length > 0)

    const loadScenarios = async () => {
        if (!cfg.value.base) {
            scenarios.value = []
            loading.value = false
            return
        }
        loading.value = true
        error.value = ''
        try {
            const data = await scenariosRequest('/list?full=1')
            if (Array.isArray(data?.scenarios)) {
                seedScenarioCacheFromList(data.scenarios)
                scenarios.value = data.scenarios.map(mapScenarioEntry)
            } else if (data?.ok === false && data?.error) {
                scenarios.value = []
                error.value = data.error
            } else {
                scenarios.value = []
                error.value = 'Не удалось получить список сценариев'
            }
        } catch (err) {
            error.value = `Не удалось загрузить сценарии: ${err}`
            scenarios.value = []
        } finally {
            loading.value = false
        }
    }

    const togglePause = async (item) => {
        if (!item?.id || toggling.value[item.id]) return
        if (item?.disabled) {
            error.value = 'Сценарий отключен — включите его, чтобы управлять паузой'
            return
        }
        toggling.value = { ...toggling.value, [item.id]: true }
        try {
            if (item.pause) {
                const res = await scenariosRequest('/scenario/resume', { method: 'POST', body: { id: item.id } })
                item.pause = res?.result?.pause || null
                if (res?.status) item.status = summarizeStatusRecord(res.status)
            } else {
                const res = await scenariosRequest('/scenario/pause', { method: 'POST', body: { id: item.id } })
                item.pause = res?.pause || { setAt: Date.now(), reason: { source: 'app_button_pause' } }
                if (res?.status) item.status = summarizeStatusRecord(res.status)
            }
        } catch (err) {
            error.value = String(err)
        } finally {
            toggling.value = { ...toggling.value, [item.id]: false }
        }
    }

    return {
        scenarios,
        sortedScenarios,
        hasScenarios,
        loading,
        toggling,
        loadScenarios,
        togglePause
    }
}
