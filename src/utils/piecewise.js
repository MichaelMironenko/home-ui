import { clampNumber } from './num'

export function piecewiseLinear(points, x, getX, getY, xMin, xMax) {
    const ordered = (Array.isArray(points) ? points : [])
        .map((entry) => ({
            x: clampNumber(getX(entry), xMin, xMax),
            y: getY(entry)
        }))
        .sort((a, b) => a.x - b.x)

    if (!ordered.length) return null
    if (x <= ordered[0].x) return ordered[0].y
    for (let i = 1; i < ordered.length; i += 1) {
        const prev = ordered[i - 1]
        const next = ordered[i]
        if (x <= next.x) {
            const span = Math.max(next.x - prev.x, 1e-6)
            const t = clampNumber((x - prev.x) / span, 0, 1)
            return prev.y + (next.y - prev.y) * t
        }
    }
    return ordered[ordered.length - 1].y
}
