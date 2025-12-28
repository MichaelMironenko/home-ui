import { hexToHsv, hsvToHex, stopColorHex, temperatureToHex } from './colorUtils'

export function normalizeScenarioName(value) {
    const trimmed = String(value ?? '').trim()
    return trimmed.slice(0, 30)
}

export function clampNumberLocal(value, min = 0, max = 100) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return min
    return Math.max(min, Math.min(max, numeric))
}

export function minutesToTimeString(minute) {
    const value = ((minute % 1440) + 1440) % 1440
    const hours = Math.floor(value / 60)
    const mins = value % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export function timeFromStop(stop) {
    if (stop.mode === 'clock') {
        return {
            type: 'clock',
            time: minutesToTimeString(stop.clockMinutes)
        }
    }
    return {
        type: 'sun',
        anchor: stop.mode,
        offsetMin: Number.isFinite(stop.offset) ? stop.offset : 0
    }
}

export function serializeStop(stop) {
    return {
        mode: stop.mode,
        clockMinutes: stop.clockMinutes,
        offset: stop.offset,
        colorMode: stop.colorMode,
        temperature: stop.temperature,
        colorHex: stop.colorHex,
        brightness: stop.brightness,
        useColor: stop.useColor,
        useBrightness: stop.useBrightness
    }
}

export function applyStop(runStop, stored) {
    if (!stored) return
    runStop.mode = stored.mode || 'clock'
    runStop.clockMinutes = Number.isFinite(stored.clockMinutes) ? stored.clockMinutes : runStop.clockMinutes
    runStop.offset = Number.isFinite(stored.offset) ? stored.offset : runStop.offset
    runStop.colorMode = stored.colorMode || 'temperature'
    runStop.temperature = Number.isFinite(stored.temperature) ? stored.temperature : runStop.temperature
    runStop.colorHex = stored.colorHex || runStop.colorHex
    runStop.brightness = Number.isFinite(stored.brightness) ? stored.brightness : runStop.brightness
    runStop.useColor = stored.useColor ?? runStop.useColor
    runStop.useBrightness = stored.useBrightness ?? runStop.useBrightness
}

export function updateStopFromTime(stop, time) {
    if (!time) return
    if (time.type === 'clock' && typeof time.time === 'string') {
        const [hh, mm] = time.time.split(':').map((value) => Number(value))
        if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
            stop.mode = 'clock'
            stop.clockMinutes = hh * 60 + mm
            stop.offset = 0
            return
        }
    }
    if (time.anchor === 'sunrise' || time.anchor === 'sunset') {
        stop.mode = time.anchor
        stop.offset = Number.isFinite(time.offsetMin) ? time.offsetMin : 0
    }
}

export function summarizeStopState(stop, autoBrightnessEnabled) {
    const hasColor = !!stop.useColor
    let colorHex = stopColorHex(stop)
    if (autoBrightnessEnabled && hasColor) {
        const baseColor =
            stop.colorMode === 'rgb' ? (stop.colorHex || colorHex) : temperatureToHex(stop.temperature)
        colorHex = baseColor
    }
    const values = []
    if (hasColor && stop.colorMode === 'temperature') values.push(`${stop.temperature}K`)
    if (stop.useBrightness) values.push(autoBrightnessEnabled ? 'Автояркость' : `${Math.round(stop.brightness)}%`)
    return {
        colorHex,
        values,
        hasColor,
        hasBrightness: !!stop.useBrightness,
        brightness: Number.isFinite(stop.brightness) ? stop.brightness : 0,
        temperature: Number.isFinite(stop.temperature) ? stop.temperature : 0,
        colorMode: stop.colorMode === 'rgb' ? 'rgb' : 'temperature',
        placeholder: hasColor || stop.useBrightness ? '' : 'Не меняем'
    }
}

export function buildBrightnessAction({ startStop, endStop, autoBrightness }) {
    if (!startStop.useBrightness && !endStop.useBrightness) return null
    if (autoBrightness.enabled) {
        const sensorMin = clampNumberLocal(autoBrightness.luxMin, 0, autoBrightness.luxMax)
        const sensorMax = Math.max(sensorMin + 1, clampNumberLocal(autoBrightness.luxMax, sensorMin + 1, 100000))
        return {
            type: 'light.brightness',
            source: {
                type: 'sensorMap',
                sensorId: autoBrightness.sensorId || '',
                sensorMin,
                sensorMax,
                outputMin: clampNumberLocal(autoBrightness.brightnessMin, 0, 100),
                outputMax: clampNumberLocal(autoBrightness.brightnessMax, 0, 100)
            }
        }
    }
    const from = clampNumberLocal(startStop.brightness ?? endStop.brightness ?? 0, 1, 100)
    const to = clampNumberLocal(endStop.brightness ?? startStop.brightness ?? from, 1, 100)
    return {
        type: 'light.brightness',
        source: {
            type: 'manualRamp',
            from,
            to
        }
    }
}

export function buildColorAction({ startStop, endStop }) {
    if (!startStop.useColor || !endStop.useColor) return null
    if (startStop.colorMode === 'temperature' && endStop.colorMode === 'temperature') {
        return {
            type: 'light.color.cct',
            source: {
                type: 'manualRamp',
                fromK: clampNumberLocal(startStop.temperature, 1700, 6500),
                toK: clampNumberLocal(endStop.temperature, 1700, 6500)
            }
        }
    }
    return {
        type: 'light.color.hsv',
        source: {
            type: 'manualRamp',
            from: hexToHsv(startStop.colorHex),
            to: hexToHsv(endStop.colorHex)
        }
    }
}

export function buildScenarioActions({ scenarioActions, startStop, endStop, autoBrightness }) {
    const preserved = Array.isArray(scenarioActions)
        ? scenarioActions.filter(
            (action) => !['light.brightness', 'light.color.cct', 'light.color.hsv'].includes(action?.type)
        )
        : []
    const actions = []
    const brightnessAction = buildBrightnessAction({ startStop, endStop, autoBrightness })
    if (brightnessAction) actions.push(brightnessAction)
    const colorAction = buildColorAction({ startStop, endStop })
    if (colorAction) actions.push(colorAction)
    return preserved.concat(actions)
}

export function buildScenarioPayload({
    scenario,
    selectedGroupIds,
    selectedDeviceIds,
    selectedDays,
    startStop,
    endStop,
    autoBrightness,
    presenceMode
}) {
    const payload = JSON.parse(JSON.stringify(scenario || {}))
    payload.name = normalizeScenarioName(payload.name) || 'Новый сценарий'
    payload.target = payload.target || {}
    payload.target.groups = Array.from(selectedGroupIds || []).filter(Boolean).sort()
    payload.target.devices = Array.from(selectedDeviceIds || []).filter(Boolean).sort()
    payload.time = payload.time || {}
    payload.time.start = timeFromStop(startStop)
    payload.time.end = timeFromStop(endStop)
    payload.time.days = (Array.isArray(selectedDays) ? selectedDays : []).slice().sort((a, b) => a - b)
    payload.actions = buildScenarioActions({
        scenarioActions: payload.actions,
        startStop,
        endStop,
        autoBrightness
    })
    const scenarioType = typeof payload.type === 'string' ? payload.type : ''
    const isAutoLightScenario = /auto-light/i.test(scenarioType)
    if (isAutoLightScenario) {
        payload.autoLight = payload.autoLight || {}
        payload.autoLight.state = {
            startStop: serializeStop(startStop),
            endStop: serializeStop(endStop),
            time: {
                start: payload.time.start,
                end: payload.time.end
            },
            selectedDevices: Array.from(selectedDeviceIds || []),
            autoBrightness: {
                enabled: !!autoBrightness?.enabled,
                sensorId: autoBrightness?.sensorId || '',
                luxMin: autoBrightness?.luxMin,
                luxMax: autoBrightness?.luxMax,
                brightnessMin: autoBrightness?.brightnessMin,
                brightnessMax: autoBrightness?.brightnessMax
            }
        }
        if (autoBrightness?.sensorId) payload.autoLight.sensorId = autoBrightness.sensorId
    } else {
        delete payload.autoLight
    }
    payload.runtime = payload.runtime || {}
    payload.runtime.presence = presenceMode === 'home' ? 'onlyWhenHome' : 'always'
    payload.disabled = scenario?.disabled === true
    return payload
}

export function hydrateStopsFromActions(actions, { startStop, endStop, autoBrightness }) {
    if (!Array.isArray(actions)) {
        startStop.useBrightness = false
        endStop.useBrightness = false
        startStop.useColor = false
        endStop.useColor = false
        return
    }
    const brightnessAction = actions.find((action) => action?.type?.includes('light.brightness'))
    if (brightnessAction?.source) {
        startStop.useBrightness = true
        endStop.useBrightness = true
        if (brightnessAction.source.type === 'sensorMap') {
            autoBrightness.enabled = true
            autoBrightness.sensorId = brightnessAction.source.sensorId || ''
            const luxMin = clampNumberLocal(brightnessAction.source.sensorMin ?? autoBrightness.luxMin, 0, autoBrightness.luxMax)
            const luxMax = clampNumberLocal(
                brightnessAction.source.sensorMax ?? autoBrightness.luxMax,
                Math.max(luxMin + 1, 1),
                100000
            )
            autoBrightness.luxMin = Math.min(luxMin, luxMax - 1)
            autoBrightness.luxMax = luxMax
            autoBrightness.brightnessMin = clampNumberLocal(
                brightnessAction.source.outputMin ?? autoBrightness.brightnessMin,
                0,
                autoBrightness.brightnessMax
            )
            autoBrightness.brightnessMax = clampNumberLocal(
                brightnessAction.source.outputMax ?? autoBrightness.brightnessMax,
                Math.max(autoBrightness.brightnessMin, 0),
                100
            )
        } else {
            autoBrightness.enabled = false
            if (brightnessAction.source.from != null) {
                startStop.brightness = clampNumberLocal(brightnessAction.source.from, 1, 100)
            }
            if (brightnessAction.source.to != null) {
                endStop.brightness = clampNumberLocal(brightnessAction.source.to, 1, 100)
            }
        }
    } else {
        startStop.useBrightness = false
        endStop.useBrightness = false
        autoBrightness.enabled = false
    }

    const colorAction = actions.find((action) => action?.type?.startsWith('light.color'))
    if (colorAction?.type === 'light.color.cct') {
        startStop.useColor = true
        endStop.useColor = true
        startStop.colorMode = 'temperature'
        endStop.colorMode = 'temperature'
        if (colorAction.source?.fromK) startStop.temperature = clampNumberLocal(colorAction.source.fromK, 1700, 6500)
        if (colorAction.source?.toK) endStop.temperature = clampNumberLocal(colorAction.source.toK, 1700, 6500)
        startStop.colorHex = temperatureToHex(startStop.temperature)
        endStop.colorHex = temperatureToHex(endStop.temperature)
    } else if (colorAction?.type?.includes('hsv')) {
        startStop.useColor = true
        endStop.useColor = true
        startStop.colorMode = 'rgb'
        endStop.colorMode = 'rgb'
        if (colorAction.source?.from) startStop.colorHex = hsvToHex(colorAction.source.from)
        if (colorAction.source?.to) endStop.colorHex = hsvToHex(colorAction.source.to)
    } else {
        startStop.useColor = false
        endStop.useColor = false
    }
}
