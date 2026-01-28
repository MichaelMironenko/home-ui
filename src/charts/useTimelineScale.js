const DEFAULT_VIEW_SIZE = 640
const DEFAULT_PADDING = { top: 36, bottom: 48, left: 60, right: 20 }
const HOUR_MS = 60 * 60 * 1000

function formatTime(ts) {
    if (!Number.isFinite(ts)) return ''
    const date = new Date(ts)
    const pad = (value) => value.toString().padStart(2, '0')
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildTicks(startTime, endTime, span, padding, width) {
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return []
    const firstHour = Math.ceil(startTime / HOUR_MS) * HOUR_MS
    const lastHour = Math.floor(endTime / HOUR_MS) * HOUR_MS
    if (firstHour > lastHour) return []
    const ticks = []
    for (let current = firstHour; current <= lastHour; current += HOUR_MS) {
        const ratio = span === 0 ? 0 : Math.min(Math.max((current - startTime) / span, 0), 1)
        ticks.push({
            x: padding.left + ratio * width,
            label: formatTime(current)
        })
    }
    return ticks
}

export function buildTimelineScale(events = [], config = {}) {
    const viewSize = config.viewSize || DEFAULT_VIEW_SIZE
    const padding = config.padding || DEFAULT_PADDING
    const maxWindowMs = Number.isFinite(config.maxWindowMs) ? config.maxWindowMs : 12 * 60 * 60 * 1000
    const drawableWidth = viewSize - padding.left - padding.right
    const drawableHeight = viewSize - padding.top - padding.bottom
    if (!Array.isArray(events) || !events.length) return null
    const latestTs = events[events.length - 1].timestamp
    const cutoff = Math.max(events[0].timestamp, latestTs - maxWindowMs)
    const filtered = events.filter((event) => event.timestamp >= cutoff)
    if (!filtered.length) return null
    const startTime = filtered[0].timestamp
    const endTime = filtered[filtered.length - 1].timestamp
    const span = endTime === startTime ? 1 : endTime - startTime
    const brightnessValues = filtered
        .filter((entry) => entry.hasBrightness)
        .map((entry) => entry.brightness)
    const rawMaxBrightness = brightnessValues.length ? Math.max(...brightnessValues) : 0
    const chartMaxBrightness = brightnessValues.length
        ? Math.min(100, Math.max(rawMaxBrightness * 1.2, Math.max(rawMaxBrightness, 10)))
        : 0
    const brightnessScale = chartMaxBrightness || 100
    const points = filtered.map((event) => {
        const ratio = span === 0 ? 0.5 : Math.min(Math.max((event.timestamp - startTime) / span, 0), 1)
        const x = padding.left + ratio * drawableWidth
        const y =
            event.hasBrightness && Number.isFinite(event.brightness)
                ? padding.top + (1 - event.brightness / brightnessScale) * drawableHeight
                : padding.top + drawableHeight
        return {
            ...event,
            x,
            y,
            displayTime: formatTime(event.timestamp),
            displayBrightness: event.hasBrightness ? `${Math.round(event.brightness)}%` : '—'
        }
    })
    const segments = []
    for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1]
        const current = points[i]
        if (!prev.hasBrightness || !current.hasBrightness) continue
        const isPause = prev.statusKind === 'pause' || current.statusKind === 'pause'
        const isSensorOff = prev.statusKind === 'sensor-off' || current.statusKind === 'sensor-off'
        segments.push({
            id: `segment-${i}`,
            start: prev,
            end: current,
            gradientId: `segment-gradient-${i}`,
            type: isPause ? 'pause' : isSensorOff ? 'sensor-off' : 'normal'
        })
    }
    const hasSegments = segments.length > 0
    if (!hasSegments) return null
    const ticks = buildTicks(startTime, endTime, span, padding, drawableWidth)
    const maxValue = chartMaxBrightness || 100
    const axisRatios = [1, 0.75, 0.5, 0.25, 0]
    const axisMarkers = axisRatios.map((ratio) => ({
        ratio,
        value: Math.round(maxValue * ratio),
        label: `${Math.round(maxValue * ratio)}%`,
        y: padding.top + (1 - ratio) * drawableHeight
    }))
    const gridMarkers = axisMarkers.filter((marker) => marker.ratio > 0 && marker.ratio < 1)
    return {
        points,
        segments,
        ticks,
        axisMarkers,
        gridMarkers,
        chartMaxBrightness: maxValue,
        brightnessScale,
        startTime,
        endTime,
        span
    }
}

export const DEFAULT_CHART_SIZE = DEFAULT_VIEW_SIZE
export const DEFAULT_CHART_PADDING = DEFAULT_PADDING
