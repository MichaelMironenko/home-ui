const BRAND_NAME = 'ExtraHub'
export const SCENARIOS_TITLE = 'Умные сценарии света'

function normalizeParts(parts = []) {
    return parts
        .flat()
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter((part) => part.length > 0)
}

export function composeDocumentTitle(...parts) {
    const normalized = normalizeParts(parts)
    if (!normalized.length) return BRAND_NAME
    return [...normalized, BRAND_NAME].join(' | ')
}

export function setDocumentTitle(...parts) {
    if (typeof document === 'undefined') return
    document.title = composeDocumentTitle(...parts)
}
