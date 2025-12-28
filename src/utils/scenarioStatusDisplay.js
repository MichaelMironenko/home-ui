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

const PAUSE_MANUAL_SOURCES = new Set(['manual', 'manual_pause', 'app_button_pause'])

const CURRENT_WINDOW_KEYS = ['window', 'currentWindow', 'activeWindow']
const NEXT_WINDOW_KEYS = ['nextWindow', 'upcomingWindow', 'next']

export function summarizeStatusRecord(status) {
    if (!status || typeof status !== 'object') return null
    const resultSource = status.result && typeof status.result === 'object' ? { ...status.result } : null
    if (resultSource?.windowTimeline) {
        const timeline = resultSource.windowTimeline
        if (!resultSource.currentWindow && timeline.current) resultSource.currentWindow = timeline.current
        if (!resultSource.nextWindow && timeline.next) resultSource.nextWindow = timeline.next
        if (!resultSource.lastWindow && timeline.previous) resultSource.lastWindow = timeline.previous
        if (!resultSource.lastEndedAt && timeline.previous?.end) resultSource.lastEndedAt = timeline.previous.end
        if (!resultSource.nextStartAt && timeline.next?.start) resultSource.nextStartAt = timeline.next.start
    }
    if (resultSource && !resultSource.lastEndedAt) {
        resultSource.lastEndedAt =
            status.result.lastEndedAt ||
            status.result.lastWindowEnd ||
            status.result.windowEnd ||
            status.result.endAt ||
            status.result.completedAt ||
            null
    }
    if (resultSource && !resultSource.nextStartAt) {
        resultSource.nextStartAt =
            status.result.nextStartAt ||
            status.result.nextWindowStart ||
            status.result.startAt ||
            status.result.nextRunUtc ||
            status.result.nextWindow?.start ||
            status.result.next?.start ||
            null
    }
    const summary = {
        ts: parseTimestamp(status.ts),
        origin: status.origin || null,
        result: null,
        error: status.error || null
    }
    if (resultSource && typeof resultSource === 'object') {
        summary.result = {
            active: !!resultSource.active,
            reason: resultSource.reason || null,
            actionsSent: Number.isFinite(Number(resultSource.actionsSent)) ? Number(resultSource.actionsSent) : null,
            tz: resultSource.tz || resultSource.timeZone || null,
            currentWindow: findWindow(resultSource, CURRENT_WINDOW_KEYS),
            nextWindow: findWindow(resultSource, NEXT_WINDOW_KEYS),
            lastWindow: findWindow(resultSource, ['lastWindow', 'previousWindow']),
            lastEndedAt: parseTimestamp(
                resultSource.lastEndedAt ||
                    resultSource.completedAt ||
                    resultSource.lastWindow?.end ||
                    resultSource.windowTimeline?.previous?.end
            ),
            nextStartAt: parseTimestamp(
                resultSource.nextStartAt ||
                    resultSource.nextStart ||
                    resultSource.nextWindowStart ||
                    resultSource.startAt ||
                    resultSource.upcomingStart ||
                    resultSource.nextRunUtc
            )
        }
    }
    return summary
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
    const statusReason = item.status?.result?.reason || null
    if (item.pause || statusReason === 'app_button_pause' || statusReason === 'autopause') {
        const reason = resolvePauseReason(item.pause, item.status)
        const label = reason ? `Пауза · ${reason}` : 'Пауза'
        return buildStatus('paused', label)
    }
    const status = item.status
    const result = status?.result
    const hasWindowData = !!(result?.currentWindow || result?.nextWindow || result?.lastWindow)
    const activeWindow = resolveActiveWindow(result, now)
    const actionsSent = Number.isFinite(Number(result?.actionsSent)) ? Number(result.actionsSent) : 0
    const fallbackActive = !hasWindowData && actionsSent > 0
    if (activeWindow || (result?.active && (isWindowActive(result?.currentWindow, now) || fallbackActive))) {
        return buildStatus('running', 'Работает')
    }

    const waitingLabel = buildWaitingLabel(result, now)
    if (waitingLabel) {
        return buildStatus('waiting', waitingLabel)
    }
    return buildStatus('waiting', 'Завершен')
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
    const source = pauseReason?.source || status?.result?.reason
    const normalized = source ? String(source).toLowerCase() : ''
    if (PAUSE_MANUAL_SOURCES.has(normalized)) return 'Ручная коррекция'
    if (normalized && PAUSE_REASON_LABELS[normalized]) return PAUSE_REASON_LABELS[normalized]
    if (normalized && normalized.includes('presence')) return PAUSE_REASON_LABELS.presence
    if (pauseReason?.label) return pauseReason.label
    return ''
}

function findWindow(result, keys) {
    if (!result || typeof result !== 'object') return null
    for (const key of keys) {
        const windowCandidate = result[key]
        if (windowCandidate && typeof windowCandidate === 'object') {
            const normalized = normalizeWindow(windowCandidate)
            if (normalized) return normalized
        }
    }
    return null
}

function normalizeWindow(source) {
    if (!source || typeof source !== 'object') return null
    const start = parseTimestamp(source.start || source.from || source.begin || source.openAt)
    const end = parseTimestamp(source.end || source.to || source.finish || source.closeAt)
    if (!Number.isFinite(start) && !Number.isFinite(end)) return null
    return { start: Number.isFinite(start) ? start : null, end: Number.isFinite(end) ? end : null }
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
        pickTimestamp
    }
}
