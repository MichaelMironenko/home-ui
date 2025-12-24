export function formatLuxTick(value) {
    const numeric = Math.round(Number(value) || 0)
    return `${numeric}`
}

export function formatLuxLabel(value) {
    const numeric = Math.round(Number(value) || 0)
    return `${numeric} лк`
}

export function formatPercentValue(value) {
    const numeric = Math.round(Number(value) || 0)
    return `${numeric}%`
}
