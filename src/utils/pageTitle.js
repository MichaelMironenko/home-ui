const BRAND_NAME = 'ExtraHub'
const DEFAULT_DESCRIPTION =
    'ExtraHub помогает управлять светом в Яндекс Доме: создавайте сценарии, задавайте расписания и отслеживайте события устройств.'
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

export function setDocumentDescription(content = DEFAULT_DESCRIPTION) {
    if (typeof document === 'undefined') return
    const meta =
        document.querySelector('meta[name="description"]') ||
        (() => {
            const created = document.createElement('meta')
            created.setAttribute('name', 'description')
            document.head?.appendChild(created)
            return created
        })()
    meta.setAttribute('content', content || DEFAULT_DESCRIPTION)
}
