import { temperatureToHex } from '../../utils/colorUtils'

/**
 * @typedef {'running' | 'pause' | 'sensor-off'} ScenarioStatusKind
 *
 * @typedef ScenarioHistoryEventRaw
 * @property {string} id
 * @property {number} timestamp
 * @property {string} brightnessDisplay
 * @property {string} colorHexDisplay
 * @property {number} colorTemperature
 * @property {boolean} sensorOff
 * @property {string} statusLabel
 * @property {boolean} _isStatusOnly
 * @property {string} origin
 * @property {string} scenarioName
 */

/**
 * @typedef NormalizedScenarioEvent
 * @property {string} id
 * @property {number} timestamp
 * @property {number|null} brightness
 * @property {boolean} hasBrightness
 * @property {string} color
 * @property {ScenarioStatusKind} statusKind
 * @property {string} statusLabel
 * @property {boolean} sensorOff
 * @property {string} origin
 * @property {string} timeText
 */

function parseBrightness(event) {
    const display = typeof event.brightnessDisplay === 'string'
        ? event.brightnessDisplay
        : typeof event.brightness === 'string'
            ? event.brightness
            : ''
    if (typeof display !== 'string' || !display.trim()) return null
    const cleaned = display.replace('%', '').replace(',', '.').trim()
    const parsed = Number(cleaned)
    if (!Number.isFinite(parsed)) return null
    return Math.min(Math.max(parsed, 0), 100)
}

function resolveStatusKind(event) {
    if (event.sensorOff || event.sensor_off) return 'sensor-off'
    const label = typeof event.statusLabel === 'string' ? event.statusLabel : ''
    if (label.startsWith('Пауза')) return 'pause'
    return 'running'
}

function parseTimestamp(event) {
    if (Number.isFinite(event.timestamp)) return event.timestamp
    if (typeof event.ts === 'string') {
        const parsed = Date.parse(event.ts)
        if (!Number.isNaN(parsed)) return parsed
    }
    if (typeof event.timeText === 'string') {
        const parsed = Date.parse(event.timeText)
        if (!Number.isNaN(parsed)) return parsed
    }
    return Date.now()
}

function formatTime(ts) {
    if (!Number.isFinite(ts)) return ''
    const date = new Date(ts)
    const toTwo = (value) => value.toString().padStart(2, '0')
    return `${toTwo(date.getHours())}:${toTwo(date.getMinutes())}`
}

/**
 * @param {ScenarioHistoryEventRaw[]} events
 * @param {{ fallbackColor?: string }} [options]
 * @returns {NormalizedScenarioEvent[]}
 */
export function normalizeScenarioEvents(events = [], { fallbackColor = '#a855f7' } = {}) {
    const normalized = []
    if (!Array.isArray(events)) return normalized
    let lastBrightness = null
    let lastColor = fallbackColor
    for (const event of events) {
        if (!event || typeof event !== 'object') continue
        const brightness = parseBrightness(event)
        if (brightness != null) {
            lastBrightness = brightness
        }
        const color =
            event.colorHexDisplay ||
            (Number.isFinite(event.colorTemperature) ? temperatureToHex(event.colorTemperature) : null) ||
            (typeof event.colorLabel === 'string' ? event.colorLabel : null) ||
            lastColor
        if (color) lastColor = color
        const statusKind = resolveStatusKind(event)
        const statusLabel =
            event.statusLabel ||
            (statusKind === 'sensor-off' ? 'Выключено по датчику' : '')
        normalized.push({
            id: event.id || `evt_${event.ts || event.timestamp || Date.now()}`,
            timestamp: parseTimestamp(event),
            brightness: lastBrightness,
            hasBrightness: Number.isFinite(lastBrightness),
            color,
            statusKind,
            statusLabel,
            sensorOff: Boolean(event.sensorOff),
            origin: typeof event.origin === 'string' ? event.origin : '',
            timeText: formatTime(event.timestamp)
        })
    }
    return normalized.sort((a, b) => a.timestamp - b.timestamp)
}
