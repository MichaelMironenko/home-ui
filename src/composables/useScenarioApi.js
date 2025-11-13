import { getConfig } from '../lib/api';

const routerBase = {
    base: '',
    keyHeader: 'x-api-key',
    keyValue: ''
};

function ensureBaseUrl() {
    if (!routerBase.base) {
        throw new Error('scenariosURL не задан в config.json');
    }
}

export function useScenarioApi() {
    const loadConfig = async () => {
        const raw = await getConfig();
        routerBase.base = (raw.scenariosUrl || raw.scenariosURL || raw.scenarioUrl || '').replace(/\/+$/, '');
        routerBase.keyHeader = raw.keyHeader || raw['x-api-key-header'] || 'x-api-key';
        routerBase.keyValue = raw.keyValue || raw.apiKey || raw['x-api-key'] || '';
    };

    const scenarioRequest = async (path, options = {}) => {
        ensureBaseUrl();
        const headers = { ...(options.headers || {}) };
        if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
        if (routerBase.keyValue) headers[routerBase.keyHeader || 'x-api-key'] = routerBase.keyValue;
        const response = await fetch(`${routerBase.base}${path}`, {
            ...options,
            headers,
            credentials: options.credentials ?? 'include',
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined
        });
        const text = await response.text();
        let json;
        try {
            json = text ? JSON.parse(text) : null;
        } catch (_) {
            json = null;
        }
        if (!response.ok) {
            const message = json?.error || response.statusText || 'Request failed';
            const error = new Error(message);
            error.data = json;
            throw error;
        }
        return json;
    };

    return {
        loadConfig,
        scenarioRequest
    };
}
