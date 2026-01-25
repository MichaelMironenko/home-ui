function clampNumber(value, min = 0, max = 1) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return min
    if (numeric < min) return min
    if (numeric > max) return max
    return numeric
}

function easeLowBrightness(value) {
    const clamped = Math.max(0, Math.min(1, Number(value) || 0))
    if (clamped === 0) return 0
    return Math.max(Math.sqrt(clamped), 0.3)
}

export function rgbToHex(r, g, b) {
    const clampChannel = (value) => Math.max(0, Math.min(255, Number(value) || 0))
    return `#${[clampChannel(r), clampChannel(g), clampChannel(b)]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`
}

export function hexToRgb(hex) {
    const value = (hex || '').trim().replace('#', '')
    if (value.length !== 6) return { r: 255, g: 255, b: 255 }
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return { r: 255, g: 255, b: 255 }
    return { r, g, b }
}

export function hexToHsv(hex) {
    const { r, g, b } = hexToRgb(hex)
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
        if (max === rn) {
            h = ((gn - bn) / delta) % 6
        } else if (max === gn) {
            h = (bn - rn) / delta + 2
        } else {
            h = (rn - gn) / delta + 4
        }
        h *= 60
        if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : delta / max
    const v = max
    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        v: Math.round(v * 100)
    }
}

export function hsvToHex({ h = 0, s = 0, v = 0 } = {}) {
    const saturation = clampNumber(s, 0, 100) / 100
    const value = clampNumber(v, 0, 100) / 100
    const chroma = value * saturation
    const hp = (clampNumber(h, 0, 360) % 360) / 60
    const x = chroma * (1 - Math.abs((hp % 2) - 1))
    let r1 = 0
    let g1 = 0
    let b1 = 0
    if (hp >= 0 && hp < 1) [r1, g1, b1] = [chroma, x, 0]
    else if (hp < 2) [r1, g1, b1] = [x, chroma, 0]
    else if (hp < 3) [r1, g1, b1] = [0, chroma, x]
    else if (hp < 4) [r1, g1, b1] = [0, x, chroma]
    else if (hp < 5) [r1, g1, b1] = [x, 0, chroma]
    else [r1, g1, b1] = [chroma, 0, x]
    const m = value - chroma
    const r = Math.round((r1 + m) * 255)
    const g = Math.round((g1 + m) * 255)
    const b = Math.round((b1 + m) * 255)
    return rgbToHex(r, g, b)
}

export function temperatureToHex(kelvin) {
    const clamped = Math.max(1700, Math.min(6500, kelvin))
    const pivot = 5500
    const warm = { r: 255, g: 165, b: 70 }
    const neutral = { r: 255, g: 255, b: 255 }
    const cool = { r: 200, g: 225, b: 255 }
    let r
    let g
    let b
    if (clamped <= pivot) {
        const ratio = (clamped - 1700) / (pivot - 1700)
        r = Math.round(warm.r + (neutral.r - warm.r) * ratio)
        g = Math.round(warm.g + (neutral.g - warm.g) * ratio)
        b = Math.round(warm.b + (neutral.b - warm.b) * ratio)
    } else {
        const ratio = (clamped - pivot) / (6500 - pivot)
        r = Math.round(neutral.r + (cool.r - neutral.r) * ratio)
        g = Math.round(neutral.g + (cool.g - neutral.g) * ratio)
        b = Math.round(neutral.b + (cool.b - neutral.b) * ratio)
    }
    return rgbToHex(r, g, b)
}

export function applyBrightnessHex(hex, brightness, enabled) {
    if (!enabled || !Number.isFinite(brightness) || brightness >= 100) return hex
    const normalized = Math.max(1, Math.min(100, brightness))
    const ratio = easeLowBrightness(normalized / 100)
    const factor = 0.5 + 0.5 * ratio
    const { r, g, b } = hexToRgb(hex)
    return rgbToHex(Math.round(r * factor), Math.round(g * factor), Math.round(b * factor))
}

export function blendHex(first, second, ratio = 0) {
    const normalizedRatio = Math.max(0, Math.min(1, Number(ratio) || 0))
    const a = hexToRgb(first)
    const b = hexToRgb(second)
    const r = Math.round(a.r + (b.r - a.r) * normalizedRatio)
    const g = Math.round(a.g + (b.g - a.g) * normalizedRatio)
    const bl = Math.round(a.b + (b.b - a.b) * normalizedRatio)
    return rgbToHex(r, g, bl)
}

export function stopColorHex(stop) {
    if (!stop) return '#ccd4deff'
    if (stop.useColor) {
        const baseHex = stop.colorMode === 'rgb' ? stop.colorHex : temperatureToHex(stop.temperature)
        return applyBrightnessHex(baseHex, stop.brightness, stop.useBrightness)
    }
    if (stop.useBrightness) {
        const ratio = easeLowBrightness(clampNumber(stop.brightness, 0, 100) / 100)
        return blendHex('#0f172a', '#f8fafc', ratio)
    }
    return '#b9c1cdff'
}
