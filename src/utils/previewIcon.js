export const AUTO_BRIGHTNESS_COLOR = '#f8fafc'

export function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min
    return Math.min(max, Math.max(min, value))
}

export function brightnessOpacity(value) {
    const clamped = clamp(value ?? 1, 1, 100)
    const normalized = (clamped - 1) / 99
    return 0.6 + normalized * 0.4
}

export function hexToRgb(hex) {
    const value = (hex || '').replace('#', '').trim()
    if (value.length !== 6) return null
    const r = parseInt(value.slice(0, 2), 16)
    const g = parseInt(value.slice(2, 4), 16)
    const b = parseInt(value.slice(4, 6), 16)
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null
    return { r, g, b }
}

export function computePreviewIconStyle(summary = {}, autoActive = false) {
    if (autoActive && summary?.hasColor) {
        const rgb = hexToRgb(summary.colorHex)
        if (rgb) {
            return {
                '--state-icon-bg': `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
                '--state-icon-color': summary.colorHex
            }
        }
    }
    if (autoActive && summary?.hasBrightness) {
        return {
            '--state-icon-bg': 'rgba(248, 250, 252, 0.9)',
            '--state-icon-color': AUTO_BRIGHTNESS_COLOR
        }
    }
    if (summary?.hasColor) {
        const rgb = hexToRgb(summary.colorHex)
        if (summary.hasBrightness && rgb) {
            const opacity = brightnessOpacity(summary.brightness)
            return {
                '--state-icon-bg': `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`,
                '--state-icon-color': summary.colorHex
            }
        }
        if (summary.colorHex) {
            return {
                '--state-icon-bg': summary.colorHex,
                '--state-icon-color': summary.colorHex
            }
        }
    }
    if (summary?.hasBrightness) {
        const opacity = brightnessOpacity(summary.brightness)
        return {
            '--state-icon-bg': `rgba(255, 255, 255, ${opacity})`,
            '--state-icon-color': '#ffffff'
        }
    }
    return {}
}
