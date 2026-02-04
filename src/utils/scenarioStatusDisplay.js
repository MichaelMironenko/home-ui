const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const PAUSE_REASON_LABELS = {
    manual_override: 'Свет изменен вручную',
    manual_adjust: 'Свет изменен вручную',
    manual_change: 'Свет изменен вручную',
    manual_control: 'Свет изменен вручную',
    presence: 'Никого нет дома',
    presence_guard: 'Никого нет дома',
    away: 'Никого нет дома',
    presence_away: 'Никого нет дома'
}

const PAUSE_MANUAL_SOURCES = new Set(['manual', 'manual_pause', 'manual_override'])
const PAUSE_MANUAL_IDENTIFIERS = new Set(['manual', 'manual_pause', 'manual_override', 'app_button_pause'])
const PAUSE_AUTO_SOURCES = new Set(['autopause', 'presence', 'presence_guard', 'away', 'presence_away'])

export function summarizeStatusRecord(status) {
    if (!status || typeof status !== 'object') return null
    const normalizedResult = status.result ? normalizeScenarioResult(status.result) : null
    return {
        ts: parseTimestamp(status.ts),
        origin: status.origin || null,
        result: normalizedResult,
        error: status.error || null,
        pause: status.pause || null
    }
}

function normalizeScenarioResult(rawResult = {}) {
    const currentWindow = normalizeWindow(rawResult.currentWindow)
    const nextWindow = normalizeWindow(rawResult.nextWindow)
    const lastWindow = normalizeWindow(rawResult.lastWindow)

    const lastEndedAt = pickTimestamp([
        rawResult.lastEndedAt,
        rawResult.lastWindow?.end,
        lastWindow?.end,
        rawResult.completedAt
    ])

    const nextStartAt = pickTimestamp([
        rawResult.nextStartAt,
        rawResult.nextWindow?.start,
        nextWindow?.start,
        rawResult.nextRunUtc
    ])

    return {
        active: Boolean(rawResult.active),
        reason: rawResult.reason || null,
        actionsSent: Number.isFinite(Number(rawResult.actionsSent)) ? Number(rawResult.actionsSent) : null,
        tz: rawResult.tz || rawResult.timeZone || null,
        currentWindow,
        nextWindow,
        lastWindow,
        lastEndedAt,
        nextStartAt
    }
}

function resolveActiveWindow(result, now) {
    if (!result) return null
    if (isWindowActive(result.currentWindow, now)) return result.currentWindow
    if (isWindowActive(result.nextWindow, now)) return result.nextWindow
    return null
}

export function deriveScenarioListStatus(item, nowInput = Date.now()) {
    const now = typeof nowInput === 'number' ? nowInput : parseTimestamp(nowInput) || Date.now()
    if (!item) return buildStatus('waiting', 'Завершен')
    if (item.disabled) return buildStatus('off', 'Выключен')
    const ctx = buildScenarioContext(item, now)
    const state = resolveScenarioState(ctx)
    return buildStatus(state.kind, state.label)
}

function buildScenarioContext(item, now) {
    const result = item?.status?.result || null
    const activeWindow = resolveActiveWindow(result, now)
    const hasWindowData = Boolean(result?.currentWindow || result?.nextWindow || result?.lastWindow)
    const currentWindowActive = isWindowActive(result?.currentWindow, now)
    const actionsSent = Number.isFinite(Number(result?.actionsSent)) ? Number(result.actionsSent) : 0
    const fallbackActive = !hasWindowData && actionsSent > 0
    const running = Boolean(
        activeWindow || (result?.active && (currentWindowActive || fallbackActive))
    )
    return {
        disabled: Boolean(item.disabled),
        pause: getPauseInfo({ pause: item.pause, status: item.status }, result, activeWindow, hasWindowData),
        running,
        waitingLabel: buildWaitingLabel(result, now)
    }
}

function resolveScenarioState(ctx) {
    if (ctx.disabled) return { kind: 'off', label: 'Выключен' }
    if (ctx.pause) return { kind: 'paused', label: ctx.pause.label }
    if (ctx.running) return { kind: 'running', label: 'Работает' }
    if (ctx.waitingLabel) return { kind: 'waiting', label: ctx.waitingLabel }
    return { kind: 'waiting', label: 'Завершен' }
}

function getPauseInfo(pausePayload, result, activeWindow, hasWindowData) {
    const { pause, status } = pausePayload || {}
    const statusReason = status?.result?.reason
    const pauseReason = pause?.reason
    const sourceCandidate = pauseReason?.source || statusReason || ''
    const normalizedSource = sourceCandidate ? String(sourceCandidate).toLowerCase() : ''
    const hasPausePayload = Boolean(pause) || statusReason === 'app_button_pause' || statusReason === 'autopause'
    if (!hasPausePayload) return null

    if (PAUSE_MANUAL_IDENTIFIERS.has(normalizedSource)) {
        const label = resolvePauseReason(pause, status)
        return { label: label ? `Пауза · ${label}` : 'Пауза' }
    }

    if (PAUSE_AUTO_SOURCES.has(normalizedSource)) {
        const autopauseActive = hasWindowData ? Boolean(activeWindow) : true
        if (autopauseActive) {
            const label = resolvePauseReason(pause, status)
            return { label: label ? `Пауза · ${label}` : 'Пауза' }
        }
    }

    return null
}

function buildWaitingLabel(result, now) {
    if (!result || typeof result !== 'object') return ''
    const lastEndTs = pickTimestamp([
        result.lastWindow?.end,
        result.lastWindow?.finish,
        result.currentWindow?.end,
        result.currentWindow?.finish,
        result.lastEndedAt
    ])
    const nextStartTs = pickTimestamp([
        result.nextWindow?.start,
        result.nextWindow?.begin,
        result.next?.start,
        result.next?.begin,
        result.nextStartAt
    ])
    if (Number.isFinite(lastEndTs) && Number.isFinite(nextStartTs) && nextStartTs > lastEndTs) {
        const gap = nextStartTs - lastEndTs
        const recentWindow = gap / 4
        const timeSinceEnd = now - lastEndTs
        if (timeSinceEnd >= 0 && timeSinceEnd <= recentWindow) {
            return buildRecentlyCompletedPhrase(timeSinceEnd)
        }
        if (now < nextStartTs) {
            return buildCountdownPhrase(nextStartTs - now)
        }
    }
    if (Number.isFinite(nextStartTs) && nextStartTs > now) {
        return buildCountdownPhrase(nextStartTs - now)
    }
    if (Number.isFinite(lastEndTs)) {
        return `Завершен в ${formatTime(lastEndTs, result.tz)}`
    }
    return ''
}

function isWindowActive(windowRange, now) {
    if (!windowRange) return false
    const { start, end } = windowRange
    const hasStart = Number.isFinite(start)
    const hasEnd = Number.isFinite(end)
    if (hasStart && hasEnd) return now >= start && now <= end
    if (hasStart) return now >= start
    if (hasEnd) return now <= end
    return false
}

function buildCountdownPhrase(deltaMs) {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 'Запуск через 0 мин'
    const totalMinutes = Math.max(0, Math.ceil(deltaMs / MINUTE_MS))
    if (totalMinutes > 120) {
        const hours = Math.max(1, Math.floor(totalMinutes / 60))
        return `Запуск через ${hours} ч`
    }
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const parts = []
    if (hours > 0) parts.push(`${hours} ч`)
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} мин`)
    return `Запуск через ${parts.join(' ')}`
}

function buildRecentlyCompletedPhrase(deltaMs) {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return ''
    const totalMinutes = Math.floor(deltaMs / MINUTE_MS)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const parts = []
    if (hours > 0) parts.push(`${hours} ч`)
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} мин`)
    return `Завершен ${parts.join(' ')} назад`
}

function formatTime(timestamp, tz) {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return ''
    const formatter = new Intl.DateTimeFormat('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz || undefined
    })
    return formatter.format(date)
}

export function resolvePauseReason(pause, status) {
    const pauseReason = pause?.reason
    const statusReason = status?.result?.reason
    const statusNormalized = statusReason ? String(statusReason).toLowerCase() : ''
    if (statusNormalized === 'app_button_pause') return ''
    const source = pauseReason?.source || statusReason
    const normalized = source ? String(source).toLowerCase() : ''
    if (PAUSE_MANUAL_SOURCES.has(normalized)) return 'Ручная коррекция'
    if (normalized && PAUSE_REASON_LABELS[normalized]) return PAUSE_REASON_LABELS[normalized]
    if (normalized && normalized.includes('presence')) return PAUSE_REASON_LABELS.presence
    if (pauseReason?.label) return pauseReason.label
    return ''
}

function normalizeWindow(source) {
    if (!source || typeof source !== 'object') return null
    const start = parseTimestamp(source.start || source.from || source.begin || source.openAt)
    const end = parseTimestamp(source.end || source.to || source.finish || source.closeAt)
    if (!Number.isFinite(start) && !Number.isFinite(end)) return null
    return { start: Number.isFinite(start) ? start : null, end: Number.isFinite(end) ? end : null, tz: source.tz || source.timezone || null }
}

function parseTimestamp(value) {
    if (value == null) return null
    if (value instanceof Date) {
        const ms = value.getTime()
        return Number.isNaN(ms) ? null : ms
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null
        return value > 1e12 ? value : value * 1000
    }
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return null
        const numeric = Number(trimmed)
        if (Number.isFinite(numeric) && trimmed.length <= 13) {
            return parseTimestamp(numeric)
        }
        const ms = Date.parse(trimmed)
        return Number.isNaN(ms) ? null : ms
    }
    return null
}

function pickTimestamp(candidates) {
    for (const value of candidates) {
        const parsed = parseTimestamp(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return null
}

function buildStatus(kind, label) {
    return { kind, label }
}

export function __testables__() {
    return {
        buildWaitingLabel,
        formatTime,
        buildCountdownPhrase,
        resolvePauseReason,
        parseTimestamp,
        pickTimestamp,
        normalizeScenarioResult,
        resolveScenarioState,
        getPauseInfo
    }
}
