import { normalizeScenarioName } from '../utils/events'
import { summarizeStatusRecord } from '../utils/scenarioStatusDisplay'

const cacheState = {
    byId: new Map(),
    byName: new Map()
}

function cacheRecord(scenario, meta = null, statusSummary) {
    if (!scenario || !scenario.id) return
    const id = String(scenario.id)
    const nameKey = normalizeScenarioName(scenario.name || '')
    const existing = cacheState.byId.get(id)
    const record = {
        scenario,
        meta: meta || null,
        statusSummary: statusSummary !== undefined
            ? statusSummary
            : existing?.statusSummary || null
    }
    cacheState.byId.set(id, record)
    if (nameKey) cacheState.byName.set(nameKey, record)
}

export function seedScenarioCacheFromList(entries) {
    if (!Array.isArray(entries)) return
    entries.forEach((entry) => {
        if (!entry?.scenario) return
        const meta = entry?.lastModified != null || entry?.etag
            ? { lastModified: entry.lastModified, etag: entry?.etag || null }
            : null
        const statusSummary = summarizeStatusRecord(entry?.status || null)
        cacheRecord(entry.scenario, meta, statusSummary)
    })
}

export function cacheScenarioUpdate(scenario, meta = null, statusSummary) {
    cacheRecord(scenario, meta, statusSummary)
}

export function getCachedScenarioById(id) {
    if (!id) return null
    return cacheState.byId.get(String(id)) || null
}

export function getCachedScenarioByName(name) {
    const key = normalizeScenarioName(name || '')
    if (!key) return null
    return cacheState.byName.get(key) || null
}
