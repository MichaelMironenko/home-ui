import { normalizeScenarioName } from '../utils/events'

const cacheState = {
    byId: new Map(),
    byName: new Map()
}

function cacheRecord(scenario, meta = null) {
    if (!scenario || !scenario.id) return
    const id = String(scenario.id)
    const nameKey = normalizeScenarioName(scenario.name || '')
    const record = {
        scenario,
        meta: meta || null
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
        cacheRecord(entry.scenario, meta)
    })
}

export function cacheScenarioUpdate(scenario, meta = null) {
    cacheRecord(scenario, meta)
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
