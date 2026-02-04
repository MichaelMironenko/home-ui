import { temperatureToHex } from '../../utils/colorUtils'

/**
 * @typedef {'running' | 'pause' | 'sensor-off'} ScenarioStatusKind
 *
 * @typedef ScenarioHistoryEventRaw
 * @property {string} id
 * @property {number} timestamp
 * @property {string} brightnessDisplay
 * @property {string} colorHexDisplay
 * @property {number} reportedColorTemperature
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
    if (Number.isFinite(event.brightness)) {
        return Math.min(Math.max(Number(event.brightness), 0), 100)
    }
    return null
}

const SENSOR_REASON_LABELS = {
    above: 'выкл',
    below: 'вкл'
}

function parseSensorLux(event) {
    const raw = event.sensorLux ?? event.sensor_lux
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) return Math.round(numeric)
    return null
}

function parseSensorOffReason(event) {
    const raw = typeof event.sensorOffReason === 'string'
        ? event.sensorOffReason
        : typeof event.sensor_off_reason === 'string'
            ? event.sensor_off_reason
            : ''
    return raw
}

function formatSensorStatusLabel(lux, reason) {
    const parts = []
    if (Number.isFinite(lux)) {
        parts.push(`${lux} lx`)
    }
    const mappedReason = SENSOR_REASON_LABELS[reason]
    if (mappedReason) {
        parts.push(mappedReason)
    }
    if (parts.length) {
        return parts.join(' ')
    }
    return 'Выключено по датчику'
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
        const isSensorOff = Boolean(event.sensorOff || event.sensor_off)
        if (brightness != null && !isSensorOff) {
            lastBrightness = brightness
        }
        const colorTemperature =
            Number.isFinite(event.reportedColorTemperature)
                ? Math.round(event.reportedColorTemperature)
                : Number.isFinite(event.colorTemperature)
                    ? Math.round(event.colorTemperature)
                    : null
        const color =
            event.colorHexDisplay || (colorTemperature ? temperatureToHex(colorTemperature) : null) || lastColor
        if (color) lastColor = color
        const statusKind = resolveStatusKind(event)
        const sensorLux = parseSensorLux(event)
        const sensorOffReason = parseSensorOffReason(event)
        const statusLabel =
            event.statusLabel ||
            (statusKind === 'sensor-off' ? formatSensorStatusLabel(sensorLux, sensorOffReason) : '')
        normalized.push({
            id: event.id || `evt_${event.ts || event.timestamp || Date.now()}`,
            timestamp: parseTimestamp(event),
            brightness: isSensorOff ? null : lastBrightness,
            hasBrightness: Number.isFinite(isSensorOff ? null : lastBrightness),
            color,
            colorTemperature,
            statusKind,
            statusLabel,
            sensorLux,
            sensorOffReason,
            sensorOff: isSensorOff,
            origin: typeof event.origin === 'string' ? event.origin : '',
            timeText: formatTime(event.timestamp)
        })
    }
    return normalized.sort((a, b) => a.timestamp - b.timestamp)
}
