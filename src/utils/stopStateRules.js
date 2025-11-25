export function lockColorUsage(startStop, endStop) {
    if (!startStop || !endStop) return
    const startUsesColor = !!startStop.useColor
    if (!startUsesColor) {
        endStop.useColor = false
        return
    }
    endStop.useColor = true
    lockColorMode(startStop, endStop)
}

export function lockColorMode(startStop, endStop) {
    if (!startStop || !endStop) return
    if (!startStop.useColor) {
        endStop.useColor = false
        return
    }
    endStop.useColor = true
    const mode = startStop.colorMode || 'temperature'
    if (endStop.colorMode !== mode) endStop.colorMode = mode
}

export function lockBrightnessUsage(startStop, endStop) {
    if (!startStop || !endStop) return
    const shouldUse = !!startStop.useBrightness
    if (endStop.useBrightness === shouldUse) return
    endStop.useBrightness = shouldUse
}

export function applyBrightnessMode(mode, autoBrightness, startStop, endStop) {
    if (!autoBrightness) return
    const isAuto = mode === 'auto'
    autoBrightness.enabled = isAuto
    if (isAuto) {
        if (startStop) startStop.useBrightness = true
        if (endStop) endStop.useBrightness = true
    }
}
