export function clampNumber(value, min, max) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return min
    if (numeric < min) return min
    if (numeric > max) return max
    return numeric
}
