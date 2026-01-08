import { ref } from 'vue'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'

function normalizeBase(raw = '') {
    return raw.replace(/\/+$/, '')
}

export function useScenariosApi() {
    const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })

    const loadConfig = async () => {
        const raw = await getConfig()
        const apiBase =
            raw.api ||
            raw.apiBase ||
            raw.scenariosUrl ||
            raw.scenariosURL ||
            raw.scenarioUrl ||
            raw.scenariosBase ||
            ''
        cfg.value.base = normalizeBase(apiBase)
        cfg.value.keyHeader = raw.keyHeader || raw['x-api-key-header'] || 'x-api-key'
        cfg.value.keyValue = raw.keyValue || raw.apiKey || raw['x-api-key'] || ''
    }

    const scenariosRequest = async (path, options = {}) => {
        if (!cfg.value.base) throw new Error('scenarios URL not configured')
        const headers = { ...(options.headers || {}) }
        if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
        if (cfg.value.keyValue) headers[cfg.value.keyHeader || 'x-api-key'] = cfg.value.keyValue
        trackFunctionCall()
        const res = await fetch(`${cfg.value.base}${path}`, {
            ...options,
            headers,
            credentials: options.credentials ?? 'include',
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined
        })
        const text = await res.text()
        let json
        try {
            json = text ? JSON.parse(text) : null
        } catch {
            json = null
        }
        if (!res.ok) {
            throw new Error(json?.error || text || res.statusText || 'Request failed')
        }
        return json
    }

    return {
        cfg,
        loadConfig,
        scenariosRequest
    }
}
