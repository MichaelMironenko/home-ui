import { temperatureToHex } from './colorUtils'
import { resolvePauseReason } from './scenarioStatusDisplay'

const ORIGIN_LABELS = {
    manual: 'Ручной запуск',
    'manual-batch': 'Ручной пакет',
    timer: 'Таймер',
    'timer-single': 'Таймер',
    scheduler: 'Таймер',
    save: 'Сохранение',
    resume: 'Возобновление',
    pause: 'Пауза',
    presence: 'Присутствие',
    enable: 'Включение',
    disable: 'Выключение'
}

const ORIGIN_VARIANTS = {
    manual: 'manual',
    'manual-batch': 'manual',
    timer: 'timer',
    'timer-single': 'timer',
    scheduler: 'timer',
    save: 'system',
    resume: 'system',
    presence: 'presence'
}

export function normalizeScenarioName(name) {
    return String(name || '').trim().toLowerCase()
}

function formatTime(ts) {
    if (!Number.isFinite(ts)) return ''
    const date = new Date(ts)
    const toTwo = (v) => v.toString().padStart(2, '0')
    return `${toTwo(date.getHours())}:${toTwo(date.getMinutes())}`
}

function formatTriggerLabel(origin) {
    if (!origin) return ''
    return ORIGIN_LABELS[origin] || origin
}

function formatTriggerIcon(origin) {
    if (!origin) return ''
    if (ORIGIN_VARIANTS[origin] === 'timer') return ''
    if (origin === 'save') return '💾'
    if (origin === 'resume') return '▶'
    if (origin === 'presence') return '👤'
    if (origin === 'manual' || origin === 'manual-batch') return '▶'
    if (origin.includes('pause')) return '⏸'
    return '⚙'
}

function normalizeHexColor(value) {
    if (typeof value !== 'string') return null
    const clean = value.trim().toLowerCase().replace(/^#/, '').replace(/^0x/, '')
    if (/^[0-9a-f]{6}$/.test(clean)) return `#${clean}`
    if (/^[0-9a-f]{3}$/.test(clean)) {
        const expanded = clean.split('').map((ch) => ch + ch).join('')
        return `#${expanded}`
    }
    return null
}

export function normalizeEvents(list, scenarioIndex = { byId: new Map(), byName: new Map() }) {
    if (!Array.isArray(list)) return []
    const seenIds = new Map()
    const mapped = list.map((raw) => {
        if (!raw || typeof raw !== 'object') return null
        const tsSource = raw.ts || raw.timestamp || raw.timeText || null
        const parsedTs = tsSource ? Date.parse(tsSource) : NaN
        const timestamp = Number.isNaN(parsedTs) ? Date.now() : parsedTs
        const triggerVariant = ORIGIN_VARIANTS[raw?.origin] || 'generic'
        const origin = String(raw?.origin || '')
        const pausePayload = raw?.pause || raw?.result?.pause || null
        const resultReason = raw?.resultReason || raw?.result?.reason || ''
        const isPauseEvent =
            Boolean(pausePayload) ||
            resultReason === 'app_button_pause' ||
            resultReason === 'autopause' ||
            origin.includes('pause')
        const isResumeEvent = origin === 'resume'
        const isEnableEvent = origin === 'enable' || resultReason === 'enabled'
        const isDisableEvent = origin === 'disable' || resultReason === 'disabled'
        const pauseReason = pausePayload
            ? resolvePauseReason(pausePayload, { result: { reason: resultReason } })
            : ''
        const statusLabel = isPauseEvent
            ? pauseReason
                ? `Пауза · ${pauseReason}`
                : 'Пауза'
            : isResumeEvent
                ? 'Возобновление работы'
                : isEnableEvent
                    ? 'Сценарий включен'
                    : isDisableEvent
                        ? 'Сценарий выключен'
                        : ''

        const baseId = raw?.id || `evt_${timestamp}`
        const dupCount = seenIds.get(baseId) || 0
        const dedupedId = dupCount === 0 ? baseId : `${baseId}_${dupCount + 1}`
        seenIds.set(baseId, dupCount + 1)

        const normalizedHex = normalizeHexColor(raw?.colorHex)
        const scenarioId = raw?.scenarioId != null
            ? String(raw.scenarioId)
            : raw?.scenario_id != null
                ? String(raw.scenario_id)
                : raw?.scenario?.id != null
                    ? String(raw.scenario.id)
                    : raw?.scenario?.scenarioId != null
                        ? String(raw.scenario.scenarioId)
                        : ''
        const scenarioName = raw?.scenarioName || raw?.scenario?.name || scenarioId || 'Без имени'
        const normalizedScenarioName = normalizeScenarioName(scenarioName)
        const indexedByName = normalizedScenarioName
            ? scenarioIndex.byName?.get?.(normalizedScenarioName)
            : null
        const indexedById = scenarioId ? scenarioIndex.byId?.get?.(scenarioId) : null
        const resolvedScenarioId = scenarioId || indexedByName?.id || ''
        const scenarioType =
            raw?.scenario?.type ||
            raw?.scenarioType ||
            indexedById?.type ||
            indexedByName?.type ||
            null
        const scenarioKey = String(scenarioId || raw?.scenarioName || scenarioName)

        const sensorOff = raw?.sensorOff === true
        const sensorOffReason =
            typeof raw?.sensorOffReason === 'string'
                ? raw.sensorOffReason
                : ''

        const brightnessValue = Number.isFinite(raw?.brightness) ? Math.round(raw.brightness) : null
        const computedBrightnessDisplay = brightnessValue != null ? `${brightnessValue}%` : ''
        return {
            id: dedupedId,
            timestamp,
            timeText: formatTime(timestamp),
            scenarioName,
            scenarioId: resolvedScenarioId,
            scenarioType,
            scenarioKey,
            triggerVariant,
            triggerLabel: formatTriggerLabel(raw?.origin),
            triggerIcon: formatTriggerIcon(String(raw?.origin || '')),
            brightnessDisplay: computedBrightnessDisplay,
            brightness: brightnessValue,
            colorTemperature: Number.isFinite(raw?.colorTemperature) ? Number(raw.colorTemperature) : null,
            colorHexDisplay: normalizedHex,
            sensorLux: Number.isFinite(raw?.sensorLux) ? Math.round(raw.sensorLux) : null,
            sensorOff,
            sensorOffReason,
            statusLabel,
            _isStatusOnly: isPauseEvent
        }
    })

    const colorKeyOf = (event) => {
        if (!event) return null
        if (event.colorHexDisplay) return `hex:${event.colorHexDisplay}`
        if (Number.isFinite(event.colorTemperature)) return `cct:${Math.round(event.colorTemperature)}`
        return null
    }

    const oldestFirst = mapped.filter(Boolean).sort((a, b) => a.timestamp - b.timestamp)
    const lastStateByScenario = new Map()

    const flaggedOldestFirst = oldestFirst.map((event) => {
        const prev = lastStateByScenario.get(event.scenarioKey) || null

        const currentBrightness = event.brightnessDisplay || ''
        const prevBrightnessState = prev?.brightnessState || ''
        const hasBrightnessData = Boolean(currentBrightness)
        const showBrightness = Boolean(prev && hasBrightnessData && currentBrightness !== prevBrightnessState)

        const currentColorKey = colorKeyOf(event)
        const prevColorKeyState = prev?.colorKeyState || null
        const colorChanged = Boolean(prev && currentColorKey && currentColorKey !== prevColorKeyState)
        const initialColorState = Boolean(!prev && currentColorKey)
        const showColor = Boolean((colorChanged || initialColorState) && currentColorKey)

        const nextBrightnessState = prev ? prevBrightnessState : ''
        const nextColorKeyState = prev ? prevColorKeyState : null
        lastStateByScenario.set(event.scenarioKey, {
            brightnessState: hasBrightnessData ? currentBrightness : nextBrightnessState,
            colorKeyState: currentColorKey || nextColorKeyState
        })

        const currentCct = Number.isFinite(event.colorTemperature) ? Math.round(event.colorTemperature) : null
        const isStatusOnly = Boolean(event._isStatusOnly)

        return {
            ...event,
            brightnessDisplay: showBrightness && !isStatusOnly ? event.brightnessDisplay : '',
            colorTemperature: showColor && !isStatusOnly ? currentCct : null,
            colorHexDisplay: showColor && !isStatusOnly ? event.colorHexDisplay : null,
            reportedColorTemperature: !isStatusOnly && currentCct != null ? currentCct : null,
            statusLabel: isStatusOnly ? event.statusLabel : '',
            _showCctOnly:
                !isStatusOnly &&
                showColor &&
                currentCct != null &&
                !event.colorHexDisplay,
            _showColorAny: Boolean(showColor) && !isStatusOnly,
            _showBrightnessAny: Boolean(showBrightness) && !isStatusOnly
        }
    })

    return flaggedOldestFirst.reverse()
}

export function colorSwatchStyle(event) {
    if (event.colorHexDisplay) {
        return { backgroundColor: event.colorHexDisplay }
    }
    if (Number.isFinite(event.colorTemperature)) {
        return { backgroundColor: temperatureToHex(event.colorTemperature) }
    }
    return null
}
