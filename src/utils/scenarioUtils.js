import { sunriseUTC, sunsetUTC } from './sunCalc'

const DEFAULT_TZ = 'Europe/Moscow'
const DEFAULT_LAT = 55.751
const DEFAULT_LON = 37.617
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6, 7]

export function toLocalMinutes(date, tz) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    })
    const [hh, mm] = fmt.format(date).split(':').map((n) => parseInt(n, 10))
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 0
    return hh * 60 + mm
}

function resolveCoordinates(source = {}) {
    const timeSource = source.time && typeof source.time === 'object' ? source.time : source
    const tz = timeSource?.tz || DEFAULT_TZ
    const lat = Number.isFinite(Number(timeSource?.lat)) ? Number(timeSource.lat) : DEFAULT_LAT
    const lon = Number.isFinite(Number(timeSource?.lon)) ? Number(timeSource.lon) : DEFAULT_LON
    return { tz, lat, lon }
}

export function computeEnvironment(source = {}) {
    const coords = resolveCoordinates(source)
    const nowUtc = new Date()
    const sunrise = sunriseUTC(nowUtc, coords.lat, coords.lon, coords.tz)
    const sunset = sunsetUTC(nowUtc, coords.lat, coords.lon, coords.tz)
    return {
        tz: coords.tz,
        lat: coords.lat,
        lon: coords.lon,
        sunriseUtc: sunrise,
        sunsetUtc: sunset,
        sunriseMin: toLocalMinutes(sunrise, coords.tz),
        sunsetMin: toLocalMinutes(sunset, coords.tz)
    }
}

export function createDefaultScenario() {
    return {
        id: '',
        name: 'Новый сценарий',
        type: 'scenario-v1',
        version: 1,
        disabled: false,
        target: { groups: [], devices: [] },
        time: {
            tz: DEFAULT_TZ,
            lat: DEFAULT_LAT,
            lon: DEFAULT_LON,
            start: { type: 'clock', time: '18:00' },
            end: { type: 'clock', time: '23:00' },
            days: [...DEFAULT_DAYS]
        },
        runtime: {
            presence: 'always'
        },
        actions: []
    }
}

function sanitizeIdList(list) {
    if (!Array.isArray(list)) return []
    return list
        .map((value) => (value != null ? String(value) : ''))
        .filter((value) => value.length > 0)
}

function normalizeBoundary(boundary, fallback) {
    const source = boundary && typeof boundary === 'object' ? boundary : null
    if (!source) return { ...fallback }
    if (source.type === 'sun' || source.anchor === 'sunrise' || source.anchor === 'sunset') {
        const anchor = source.anchor || (source.type === 'sunrise' ? 'sunrise' : 'sunset')
        return {
            type: 'sun',
            anchor: anchor === 'sunrise' ? 'sunrise' : 'sunset',
            offsetMin: Number.isFinite(source.offsetMin)
                ? Math.round(source.offsetMin)
                : Number.isFinite(source.offset)
                    ? Math.round(source.offset)
                    : 0
        }
    }
    if (source.type === 'sunrise' || source.type === 'sunset') {
        return {
            type: 'sun',
            anchor: source.type === 'sunrise' ? 'sunrise' : 'sunset',
            offsetMin: Number.isFinite(source.offsetMin)
                ? Math.round(source.offsetMin)
                : Number.isFinite(source.offset)
                    ? Math.round(source.offset)
                    : 0
        }
    }
    const timeString = typeof source.time === 'string' && source.time.trim().length ? source.time.trim() : null
    return {
        type: 'clock',
        time: timeString || fallback.time || '18:00'
    }
}

function normalizeDays(days) {
    if (!Array.isArray(days)) return [...DEFAULT_DAYS]
    const filtered = days
        .map((day) => Number(day))
        .filter((day) => Number.isFinite(day) && day >= 1 && day <= 7)
        .sort((a, b) => a - b)
    return filtered.length ? filtered : [...DEFAULT_DAYS]
}

export function normalizeScenarioStruct(scenario) {
    if (!scenario || typeof scenario !== 'object') return
    scenario.id = typeof scenario.id === 'string' ? scenario.id : String(scenario.id || '')
    scenario.name = typeof scenario.name === 'string' && scenario.name.trim().length ? scenario.name : 'Новый сценарий'
    scenario.type = scenario.type || 'scenario-v1'
    scenario.version = Number.isFinite(Number(scenario.version)) ? Number(scenario.version) : 1
    scenario.disabled = scenario.disabled === true
    const target = scenario.target && typeof scenario.target === 'object' ? scenario.target : {}
    scenario.target = {
        groups: sanitizeIdList(target.groups),
        devices: sanitizeIdList(target.devices)
    }
    const rawTime = scenario.time && typeof scenario.time === 'object' ? scenario.time : {}
    scenario.time = {
        tz: rawTime.tz || DEFAULT_TZ,
        lat: Number.isFinite(Number(rawTime.lat)) ? Number(rawTime.lat) : DEFAULT_LAT,
        lon: Number.isFinite(Number(rawTime.lon)) ? Number(rawTime.lon) : DEFAULT_LON,
        days: normalizeDays(rawTime.days),
        start: normalizeBoundary(rawTime.start, { type: 'clock', time: '18:00' }),
        end: normalizeBoundary(rawTime.end, { type: 'clock', time: '23:00' })
    }
    scenario.runtime = scenario.runtime && typeof scenario.runtime === 'object' ? { ...scenario.runtime } : {}
    if (!['always', 'onlyWhenHome'].includes(scenario.runtime.presence)) {
        scenario.runtime.presence = 'always'
    }
    scenario.actions = Array.isArray(scenario.actions) ? [...scenario.actions] : []
}
