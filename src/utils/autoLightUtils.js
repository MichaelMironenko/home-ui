import { clampNumber } from './num'
import { computeEnvironment } from './scenarioUtils'
import {
    DEFAULT_PARAMS,
    DEFAULT_BRIGHTNESS_CURVE_DAY,
    DEFAULT_BRIGHTNESS_CURVE_EVENING
} from './autoLightConstants'
import { piecewiseLinear } from './piecewise'

function normalizeCurve(points, fallback = []) {
    const source = Array.isArray(points) && points.length ? points : fallback
    return source.map((p) => ({
        x: clampNumber(p?.x, 0, 1),
        y: clampNumber(p?.y, 0, 1)
    }))
}

export function convertCurveToPercent(curve) {
    return (Array.isArray(curve) ? curve : []).map((p) => ({
        x: Number(p?.x) || 0,
        value: Math.round(clampNumber(p?.y, 0, 1) * 100)
    }))
}

export function luxToNormalized(lux, cfg) {
    const Ld = Math.max(0, Number(cfg?.L_dark) || 0)
    const Lo = Math.max(Ld + 1, Number(cfg?.L_off) || 100)
    const normalized = (Number(lux) - Ld) / (Lo - Ld)
    if (!Number.isFinite(normalized)) return null
    return clampNumber(normalized, 0, 1)
}

export function computeCctBaseSegments(scenario) {
    const location = {
        tz: scenario.autoLight?.location?.tz || scenario.time?.tz,
        lat: scenario.autoLight?.location?.lat ?? scenario.time?.lat,
        lon: scenario.autoLight?.location?.lon ?? scenario.time?.lon
    }
    const env = computeEnvironment({ time: location })
    const sunriseMin = env.sunriseMin
    const sunsetMin = env.sunsetMin
    const preDawn = Math.max(0, sunriseMin - 60)
    const eveningTarget = Math.min(21 * 60, 1440)
    return [
        { t_min: 0, C: 2700 },
        { t_min: preDawn, C: 2700 },
        { t_min: sunriseMin, C: 5500 },
        { t_min: sunsetMin, C: 5500 },
        { t_min: eveningTarget, C: 2700 },
        { t_min: 1440, C: 2700 }
    ]
}

export function normalizeAutoLightScenarioStruct(scenario) {
    scenario.disabled = scenario.disabled === true
    if (!scenario.autoLight || typeof scenario.autoLight !== 'object') scenario.autoLight = {}
    const cfg = scenario.autoLight
    cfg.sensorId = cfg.sensorId || ''
    cfg.L_dark = Number.isFinite(cfg.L_dark) ? cfg.L_dark : 1
    cfg.L_off = Number.isFinite(cfg.L_off) ? cfg.L_off : 1500
    cfg.params = { ...DEFAULT_PARAMS, ...(cfg.params || {}) }
    cfg.params.minCct = DEFAULT_PARAMS.minCct
    const migratingLegacy = !Array.isArray(cfg.brightnessCurveDayBase) && !Array.isArray(cfg.brightnessCurveDay)
    cfg.brightnessCurveDayBase = normalizeCurve(
        migratingLegacy ? DEFAULT_BRIGHTNESS_CURVE_DAY : (cfg.brightnessCurveDayBase || cfg.brightnessCurveBase),
        DEFAULT_BRIGHTNESS_CURVE_DAY
    )
    cfg.brightnessCurveDay = normalizeCurve(
        migratingLegacy ? DEFAULT_BRIGHTNESS_CURVE_DAY : (cfg.brightnessCurveDay || cfg.brightnessCurve),
        cfg.brightnessCurveDayBase
    )
    cfg.brightnessCurveEveningBase = normalizeCurve(
        cfg.brightnessCurveEveningBase,
        DEFAULT_BRIGHTNESS_CURVE_EVENING
    )
    cfg.brightnessCurveEvening = normalizeCurve(
        cfg.brightnessCurveEvening,
        cfg.brightnessCurveEveningBase
    )
    cfg.cctOverrides = Array.isArray(cfg.cctOverrides)
        ? cfg.cctOverrides.map((entry) => ({
            t_min: clampNumber(entry?.t_min, 0, 1440),
            C: Number(entry?.C) || DEFAULT_PARAMS.maxCct,
            note: entry?.note || null,
            source: entry?.source || null,
            updatedAt: entry?.updatedAt || null
        }))
        : []
    delete cfg.brightnessCurve
    delete cfg.brightnessCurveBase
    cfg.location = cfg.location || {
        tz: scenario.time?.tz,
        lat: scenario.time?.lat,
        lon: scenario.time?.lon
    }
    cfg.state = cfg.state && typeof cfg.state === 'object' ? cfg.state : {}
    cfg.state.status = ['ACTIVE', 'PAUSE'].includes(cfg.state.status) ? cfg.state.status : 'ACTIVE'
    cfg.state.pauseUntil = Number.isFinite(cfg.state.pauseUntil) ? cfg.state.pauseUntil : null
    cfg.state.latest = cfg.state.latest || null
    if (cfg.state.resumePlanSeed === undefined) cfg.state.resumePlanSeed = null
    cfg.history = Array.isArray(cfg.history) ? cfg.history : []

    scenario.runtime = scenario.runtime && typeof scenario.runtime === 'object' ? scenario.runtime : {}
    if (!['always', 'onlyWhenHome', 'onlyWhenAway'].includes(scenario.runtime.presence)) {
        scenario.runtime.presence = 'always'
    }
    const fallbackTime = {
        tz: cfg.location?.tz || 'Europe/Moscow',
        lat: cfg.location?.lat ?? 55.751,
        lon: cfg.location?.lon ?? 37.617,
        start: { type: 'clock', time: '18:00' },
        end: { type: 'sun', anchor: 'sunset', offsetMin: 30 },
        days: [1, 2, 3, 4, 5, 6, 7]
    }

    const normalizeBoundary = (boundary, fallback) => {
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

    const rawTime = scenario.time && typeof scenario.time === 'object' ? scenario.time : {}
    const normalizedDays = Array.isArray(rawTime.days)
        ? rawTime.days
            .map((day) => Number(day))
            .filter((day) => Number.isFinite(day) && day >= 1 && day <= 7)
            .sort((a, b) => a - b)
        : null

    scenario.time = {
        tz: rawTime.tz || fallbackTime.tz,
        lat: Number.isFinite(Number(rawTime.lat)) ? Number(rawTime.lat) : fallbackTime.lat,
        lon: Number.isFinite(Number(rawTime.lon)) ? Number(rawTime.lon) : fallbackTime.lon,
        days: normalizedDays && normalizedDays.length ? normalizedDays : [...fallbackTime.days],
        start: normalizeBoundary(rawTime.start, fallbackTime.start),
        end: normalizeBoundary(rawTime.end, fallbackTime.end)
    }
}

export function createDefaultAutoLightScenario() {
    const tz = 'Europe/Moscow'
    const lat = 55.751
    const lon = 37.617
    const base = {
        id: 'autolight',
        name: 'Автоматический свет',
        type: 'auto-light-v1',
        version: 1,
        disabled: false,
        target: { groups: [], devices: [] },
        time: {
            tz,
            lat,
            lon,
            start: { type: 'clock', time: '18:00' },
            end: { type: 'sun', anchor: 'sunset', offsetMin: 30 },
            days: [1, 2, 3, 4, 5, 6, 7]
        },
        runtime: {
            presence: 'always'
        },
        autoLight: {
            sensorId: '',
            L_dark: 1,
            L_off: 1500,
            params: { ...DEFAULT_PARAMS },
            brightnessCurveDayBase: DEFAULT_BRIGHTNESS_CURVE_DAY.map((p) => ({ ...p })),
            brightnessCurveDay: DEFAULT_BRIGHTNESS_CURVE_DAY.map((p) => ({ ...p })),
            brightnessCurveEveningBase: DEFAULT_BRIGHTNESS_CURVE_EVENING.map((p) => ({ ...p })),
            brightnessCurveEvening: DEFAULT_BRIGHTNESS_CURVE_EVENING.map((p) => ({ ...p })),
            cctOverrides: [],
            location: { tz, lat, lon },
            state: { status: 'ACTIVE', pauseUntil: null, latest: null, resumePlanSeed: null },
            history: []
        }
    }
    normalizeAutoLightScenarioStruct(base)
    return base
}

export function buildDerivedAutoLightLocal(scenario) {
    const brightness = {
        day: {
            base: convertCurveToPercent(scenario.autoLight.brightnessCurveDayBase),
            curve: convertCurveToPercent(scenario.autoLight.brightnessCurveDay)
        },
        evening: {
            base: convertCurveToPercent(scenario.autoLight.brightnessCurveEveningBase),
            curve: convertCurveToPercent(scenario.autoLight.brightnessCurveEvening)
        }
    }
    const cctBase = computeCctBaseSegments(scenario)
    return {
        brightness,
        cct: {
            base: cctBase,
            overrides: scenario.autoLight.cctOverrides || []
        },
        history: scenario.autoLight.history || [],
        latest: scenario.autoLight.state?.latest || null,
        status: scenario.autoLight.state?.status || 'ACTIVE',
        pauseUntil: scenario.autoLight.state?.pauseUntil || null,
        environment: computeEnvironment({
            time: {
                tz: scenario.autoLight?.location?.tz || scenario.time?.tz,
                lat: scenario.autoLight?.location?.lat ?? scenario.time?.lat,
                lon: scenario.autoLight?.location?.lon ?? scenario.time?.lon
            }
        })
    }
}

export function evaluatePiecewise(points, x, xAccessor, yAccessor, xMin, xMax) {
    return piecewiseLinear(points, x, xAccessor, yAccessor, xMin, xMax)
}
