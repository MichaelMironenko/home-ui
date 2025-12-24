const SENSOR_MIN_FLOOR = 1

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
}

export function resolveLuxBounds(minCandidate, maxCandidate) {
    const min = Math.max(SENSOR_MIN_FLOOR, Math.round(Number(minCandidate) || SENSOR_MIN_FLOOR))
    const maxSource = Math.round(Number(maxCandidate) || min + 1)
    const max = Math.max(min + 1, maxSource)
    return { min, max }
}

export function normalizeAutoBrightness(state, bounds) {
    if (!state) return null
    const minBound = Math.max(SENSOR_MIN_FLOOR, bounds?.min ?? SENSOR_MIN_FLOOR)
    const maxBound = Math.max(minBound + 1, bounds?.max ?? minBound + 1)

    const luxMin = clamp(Math.round(state.luxMin ?? minBound), minBound, maxBound - 1)
    const luxMax = clamp(Math.round(state.luxMax ?? maxBound), luxMin + 1, maxBound)

    const brightnessMin = clamp(
        Math.round(state.brightnessMin ?? 0),
        0,
        Math.max(0, (state.brightnessMax ?? 100) - 1)
    )
    const brightnessMax = clamp(
        Math.round(state.brightnessMax ?? 100),
        Math.max(brightnessMin + 1, 1),
        100
    )

    return {
        ...state,
        luxMin,
        luxMax,
        brightnessMin,
        brightnessMax
    }
}

export function luxToPercent(lux, bounds) {
    const min = Math.max(bounds.min, SENSOR_MIN_FLOOR)
    const max = Math.max(bounds.max, min + 1)
    const clamped = clamp(Number(lux) || min, min, max)
    const logMin = Math.log10(min)
    const logMax = Math.log10(max)
    if (!Number.isFinite(logMin) || !Number.isFinite(logMax) || logMax === logMin) return 0
    const raw = ((Math.log10(clamped) - logMin) / (logMax - logMin)) * 100
    return 100 - raw
}

export function percentToLux(percent, bounds) {
    const min = Math.max(bounds.min, SENSOR_MIN_FLOOR)
    const max = Math.max(bounds.max, min + 1)
    const logMin = Math.log10(min)
    const logMax = Math.log10(max)
    const ratio = 1 - clamp(Number(percent) || 0, 0, 100) / 100
    const value = Math.pow(10, logMin + (logMax - logMin) * ratio)
    return clamp(value, min, max)
}

export function snapLuxValue(value) {
    const rounded = Math.max(1, Math.round(Number(value) || 0))
    if (rounded < 100) return rounded
    if (rounded < 1000) return Math.round(rounded / 10) * 10
    if (rounded < 10000) return Math.round(rounded / 100) * 100
    return Math.round(rounded / 1000) * 1000
}

export function buildLuxTicks(bounds) {
    const min = bounds.min
    const max = bounds.max
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return [min, max].filter((value) => Number.isFinite(value))
    }
    const ticks = new Set([min, max])
    const minPower = Math.floor(Math.log10(min))
    const maxPower = Math.ceil(Math.log10(max))
    for (let power = minPower; power <= maxPower; power += 1) {
        const value = Math.pow(10, power)
        if (value > min && value < max) ticks.add(value)
    }
    return Array.from(ticks).sort((a, b) => a - b)
}
