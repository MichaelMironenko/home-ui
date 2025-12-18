<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ScenarioDevicesSection from './ScenarioDevicesSection.vue'
import TuningSliderColumn from './TuningSliderColumn.vue'
import ChartBlock from './ChartBlock.vue'
import PresenceOptions from './PresenceOptions.vue'
import AdaptiveLightRoomDemo from './AdaptiveLightRoomDemo.vue'
import { useTargetDevices } from '../composables/useTargetDevices'
import { useScenarioApi } from '../composables/useScenarioApi'
import { useAdjustControl } from '../composables/useAdjustControl'
import {
    DEFAULT_PARAMS,
    DEFAULT_BRIGHTNESS_CURVE_DAY,
    DEFAULT_BRIGHTNESS_CURVE_EVENING,
    ADJUST_THROTTLE_MS,
    ADJUST_IDLE_DELAY_MS,
    ADJUST_MIN_DELTA,
    ADJUST_MIN_DELTA_TEMP,
    ADJUST_COMMIT_DELAY_MS,
    PAUSE_REASON_TEXT
} from '../utils/autoLightConstants'
import {
    createDefaultAutoLightScenario,
    normalizeAutoLightScenarioStruct,
    convertCurveToPercent,
    luxToNormalized,
    buildDerivedAutoLightLocal,
    computeCctBaseSegments
} from '../utils/autoLightUtils'
import { computeEnvironment } from '../utils/scenarioUtils'
import { clampNumber } from '../utils/num'
import { piecewiseLinear } from '../utils/piecewise'

const props = defineProps({
    scenarioId: { type: String, default: '' }
})

const emit = defineEmits(['saved', 'deleted'])

const { loadConfig, scenarioRequest } = useScenarioApi()

const catalog = reactive({
    devices: [],
    groups: [],
    rooms: []
})

const scenario = reactive(createDefaultAutoLightScenario())
const derived = ref(buildDerivedAutoLightLocal(scenario))
const pauseInfo = ref(null)
const statusInfo = ref(null)
const loading = ref(true)
const saving = ref(false)
const running = ref(false)
const error = ref('')
const message = ref('')
const historyExpanded = ref(false)
const wasSaved = ref(Boolean(props.scenarioId))

const {
    roomsById,
    sections: targetSections,
    selectedDevices: selectedDevicesList,
    groupEntries,
    standaloneDevices
} = useTargetDevices(catalog, computed(() => scenario.target))

const allowedTargets = computed(() => {
    const groupIds = new Set()
    const deviceIds = new Set()
    groupEntries.value.forEach((group) => {
        groupIds.add(group.id)
        group.devices.forEach((device) => {
            deviceIds.add(device.id)
        })
    })
    standaloneDevices.value.forEach((device) => deviceIds.add(device.id))
    return { groupIds, deviceIds }
})

watch(
    allowedTargets,
    ({ groupIds, deviceIds }) => {
        const groups = Array.isArray(scenario.target?.groups)
            ? scenario.target.groups.filter((id) => groupIds.has(id))
            : []
        const devices = Array.isArray(scenario.target?.devices)
            ? scenario.target.devices.filter((id) => deviceIds.has(id) && !groups.some((groupId) => {
                const group = groupEntries.value.find((entry) => entry.id === groupId)
                return group?.devices?.some((device) => device.id === id)
            }))
            : []
        if (!scenario.target) {
            scenario.target = { groups: [], devices: [] }
        }
        if (
            scenario.target.groups.length !== groups.length ||
            scenario.target.devices.length !== devices.length ||
            scenario.target.groups.some((id, idx) => id !== groups[idx]) ||
            scenario.target.devices.some((id, idx) => id !== devices[idx])
        ) {
            scenario.target = { groups, devices }
        }
    },
    { immediate: true }
)

const sensorOptions = computed(() =>
    catalog.devices
        .flatMap((device) => {
            const propsList = Array.isArray(device.properties) ? device.properties : []
            return propsList
                .filter((prop) => prop?.parameters?.instance === 'illumination')
                .map(() => ({
                    id: `${device.id}#illumination`,
                    name: device.name || 'Сенсор',
                    detail: roomsById.value.get(device.room)?.name || '',
                    deviceId: device.id,
                    instance: 'illumination'
                }))
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
)

const isPersisted = computed(() => wasSaved.value)
const isDisabled = computed(() => scenario.disabled === true)

const latestState = computed(() => derived.value?.latest || {})
const latestNumbers = computed(() => ({
    lux: Number.isFinite(latestState.value.lux) ? latestState.value.lux : null,
    brightness: Number.isFinite(latestState.value.brightnessPercent) ? latestState.value.brightnessPercent : null,
    cct: Number.isFinite(latestState.value.cct) ? latestState.value.cct : null
}))

const scenarioTz = computed(() => scenario.time?.tz || scenario.autoLight?.location?.tz || 'Europe/Moscow')

const presenceChoices = Object.freeze([
    { value: 'always', label: 'Всегда' },
    { value: 'onlyWhenHome', label: 'Когда кто-то дома' },
    { value: 'onlyWhenAway', label: 'Когда никого нет дома' }
])

const paramsRef = computed(() => scenario.autoLight?.params || DEFAULT_PARAMS)
const minBrightnessPercent = computed(() =>
    Math.round((paramsRef.value.minBrightness ?? DEFAULT_PARAMS.minBrightness) * 100)
)
const maxBrightnessPercent = computed(() =>
    Math.round((paramsRef.value.maxBrightness ?? DEFAULT_PARAMS.maxBrightness) * 100)
)
const minCct = computed(() => Math.min(paramsRef.value.minCct ?? DEFAULT_PARAMS.minCct, DEFAULT_PARAMS.minCct))
const maxCct = computed(() => paramsRef.value.maxCct ?? DEFAULT_PARAMS.maxCct)

const quickActionsDisabled = computed(
    () => !isPersisted.value || saving.value || running.value || isDisabled.value
)

const formatTimeLabel = (ts) => {
    const value = Number(ts)
    if (!Number.isFinite(value)) return null
    try {
        const formatter = new Intl.DateTimeFormat('ru-RU', {
            timeZone: scenarioTz.value,
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        })
        return formatter.format(new Date(value))
    } catch (err) {
        console.warn('[auto-light] time format failed', err)
        return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }
}

const activationTime = computed({
    get() {
        const start = scenario.time?.start
        if (start?.type === 'clock' && typeof start.time === 'string') return start.time
        return '18:00'
    },
    set(value) {
        const clean = value && /^\d{2}:\d{2}$/.test(value) ? value : '18:00'
        scenario.time = {
            ...(scenario.time || {}),
            tz: scenario.time?.tz || 'Europe/Moscow',
            lat: scenario.time?.lat ?? scenario.autoLight?.location?.lat ?? 55.751,
            lon: scenario.time?.lon ?? scenario.autoLight?.location?.lon ?? 37.617,
            start: { type: 'clock', time: clean },
            end: { type: 'sun', anchor: 'sunset', offsetMin: 30 },
            days: Array.isArray(scenario.time?.days) && scenario.time.days.length ? scenario.time.days : [1, 2, 3, 4, 5, 6, 7]
        }
    }
})

const environmentInfo = computed(() => derived.value?.environment || computeEnvironment(scenario))

const currentLocalMinutes = computed(() => {
    const env = environmentInfo.value
    const tz = env?.tz || scenario.time?.tz || 'Europe/Moscow'
    const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    })
    const [hh, mm] = fmt.format(new Date()).split(':').map((part) => parseInt(part, 10))
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 0
    return hh * 60 + mm
})

function computeEveningProgress(minutes, env) {
    if (!env) return 0
    const sunset = Math.max(0, Math.min(1440, Number(env.sunsetMin) || 0))
    const eveningEnd = Math.max(sunset + 1, 21 * 60)
    if (minutes <= sunset) return 0
    if (minutes >= eveningEnd) return 1
    return (minutes - sunset) / (eveningEnd - sunset)
}

const isEveningMode = computed(() => {
    const env = environmentInfo.value
    const lux = latestNumbers.value.lux
    const afterSunset = env?.sunsetMin != null ? currentLocalMinutes.value >= env.sunsetMin : false
    const veryDark = lux != null ? lux <= ((scenario.autoLight.L_dark ?? 1) + 5) : false
    return afterSunset && (veryDark || lux == null)
})

const brightnessCurveDay = computed(() => scenario.autoLight?.brightnessCurveDay || DEFAULT_BRIGHTNESS_CURVE_DAY)
const brightnessCurveEvening = computed(() => scenario.autoLight?.brightnessCurveEvening || DEFAULT_BRIGHTNESS_CURVE_EVENING)

const autoBrightnessTarget = computed(() => {
    const env = environmentInfo.value
    if (isEveningMode.value) {
        const progress = computeEveningProgress(currentLocalMinutes.value, env)
        const curveValue = piecewiseLinear(brightnessCurveEvening.value, progress, (p) => p.x, (p) => p.y, 0, 1)
        return curveValue == null ? null : Math.round(curveValue * 100)
    }
    const lux = latestNumbers.value.lux
    if (lux == null) return null
    const normalized = luxToNormalized(lux, scenario.autoLight)
    if (normalized == null) return null
    const curveValue = piecewiseLinear(brightnessCurveDay.value, normalized, (p) => p.x, (p) => p.y, 0, 1)
    return curveValue == null ? null : Math.round(curveValue * 100)
})

const cctBaseSegments = computed(() => derived.value?.cct?.base || computeCctBaseSegments(scenario))

const autoCctTarget = computed(() => {
    const base = piecewiseLinear(
        cctBaseSegments.value,
        currentLocalMinutes.value,
        (seg) => seg.t_min ?? seg.t ?? 0,
        (seg) => seg.C ?? seg.k,
        0,
        1440
    )
    if (!Number.isFinite(base)) return null
    const alpha = paramsRef.value.alpha ?? DEFAULT_PARAMS.alpha
    const window = paramsRef.value.cctWindowMin ?? DEFAULT_PARAMS.cctWindowMin
    let value = base
    for (const entry of scenario.autoLight.cctOverrides || []) {
        if (!Number.isFinite(entry?.t_min) || !Number.isFinite(entry?.C)) continue
        const distance = Math.abs(entry.t_min - currentLocalMinutes.value)
        if (distance > window) continue
        const baseAtEntry = piecewiseLinear(
            cctBaseSegments.value,
            entry.t_min,
            (seg) => seg.t_min ?? seg.t ?? 0,
            (seg) => seg.C ?? seg.k,
            0,
            1440
        )
        const weight = 1 - distance / window
        value += (entry.C - baseAtEntry) * (alpha ?? 0.5) * weight
    }
    return Math.round(clampNumber(value, minCct.value, maxCct.value))
})

const currentBrightness = computed(() => {
    if (Number.isFinite(latestNumbers.value.brightness)) {
        return Math.round(latestNumbers.value.brightness)
    }
    if (Number.isFinite(autoBrightnessTarget.value)) {
        return clampNumber(autoBrightnessTarget.value, 0, 100)
    }
    return null
})

const currentCct = computed(() => {
    if (Number.isFinite(latestNumbers.value.cct)) {
        return Math.round(latestNumbers.value.cct)
    }
    if (Number.isFinite(autoCctTarget.value)) {
        return clampNumber(autoCctTarget.value, minCct.value, maxCct.value)
    }
    return null
})

const brightnessSnapshot = () => {
    const value = Number.isFinite(currentBrightness.value) ? currentBrightness.value : minBrightnessPercent.value
    return clampNumber(value, 0, 100)
}

const temperatureSnapshot = () => {
    const value = Number.isFinite(currentCct.value) ? currentCct.value : minCct.value
    return clampNumber(value, minCct.value, maxCct.value)
}

function hydrateScenarioFromResponse(response) {
    if (response?.scenario) {
        Object.assign(scenario, response.scenario)
        normalizeAutoLightScenarioStruct(scenario)
    }
    derived.value = response?.derived || buildDerivedAutoLightLocal(scenario)
    if (response?.pause !== undefined || response?.result?.pause !== undefined) {
        pauseInfo.value = response?.pause ?? response?.result?.pause ?? null
    }
    if (response?.status) {
        statusInfo.value = response.status
    } else if (response?.result) {
        statusInfo.value = { ...(statusInfo.value || {}), result: response.result }
    }
}

function ensureScenarioReady() {
    if (!scenario.id || !isPersisted.value) {
        message.value = 'Сохраните сценарий, чтобы управлять светом'
        return false
    }
    if (scenario.disabled) {
        message.value = 'Сценарий отключен'
        return false
    }
    return true
}

async function handleAdjustSend(value, note, force, kind) {
    if (!ensureScenarioReady()) {
        if (kind === 'brightness') brightnessControl.reset()
        if (kind === 'temperature') temperatureControl.reset()
        return
    }
    const payload = {
        id: scenario.id,
        timeMinutes: currentLocalMinutes.value,
        source: note
    }
    if (kind === 'brightness') {
        payload.brightnessPercent = clampNumber(value, 0, 100)
    }
    if (kind === 'temperature') {
        payload.cct = clampNumber(value, minCct.value, maxCct.value)
        payload.brightnessPercent = clampNumber(brightnessControl.control.value, 0, 100)
    }
    if (Number.isFinite(latestNumbers.value.lux)) {
        payload.lux = latestNumbers.value.lux
    }
    console.info('[auto-light] adjust request', { kind, payload })
    try {
        const response = await scenarioRequest('/auto-light/adjust', { method: 'POST', body: payload })
        hydrateScenarioFromResponse(response)
        error.value = response?.error || ''
    } catch (err) {
        console.error('[auto-light] adjust failed', err)
        error.value = err?.message || String(err)
    }
}

async function applyCorrection(payload) {
    if (!scenario.id) return null
    const body = {
        id: scenario.id,
        ...payload
    }
    console.info('[auto-light] correction request', body)
    try {
        const response = await scenarioRequest('/auto-light/correct', {
            method: 'POST',
            body
        })
        console.info('[auto-light] correction response', response)
        hydrateScenarioFromResponse(response)
        wasSaved.value = true
        return response
    } catch (err) {
        error.value = err?.message || String(err)
        return null
    }
}

async function handleCommitSend(value, note, kind) {
    if (!ensureScenarioReady()) return
    const payload = {
        timeMinutes: currentLocalMinutes.value,
        note: note || 'Коррекция света',
        source: 'app'
    }
    let includeBrightness = false
    let includeTemperature = false
    if (kind === 'brightness') {
        payload.brightnessPercent = clampNumber(value, 0, 100)
        includeBrightness = true
    } else if (kind === 'temperature') {
        payload.cct = clampNumber(value, minCct.value, maxCct.value)
        payload.brightnessPercent = clampNumber(brightnessControl.control.value, 0, 100)
        includeBrightness = true
        includeTemperature = true
    }
    if (!includeBrightness && brightnessControl.pending.value != null) {
        payload.brightnessPercent = clampNumber(brightnessControl.pending.value, 0, 100)
        includeBrightness = true
    }
    if (!includeTemperature && temperatureControl.pending.value != null) {
        payload.cct = clampNumber(temperatureControl.pending.value, minCct.value, maxCct.value)
        includeTemperature = true
    }
    if (!includeBrightness && !includeTemperature) return
    if (includeBrightness) {
        payload.lux = Number.isFinite(latestNumbers.value.lux)
            ? latestNumbers.value.lux
            : (scenario.autoLight.L_dark || 1)
    }
    try {
        await applyCorrection(payload)
    } catch (err) {
        console.error('[auto-light] correction commit failed', err)
        error.value = err?.message || String(err)
    }
}

const brightnessControl = useAdjustControl({
    label: 'Яркость',
    kind: 'brightness',
    min: () => 0,
    max: () => 100,
    snapshot: brightnessSnapshot,
    currentAutoTarget: () => autoBrightnessTarget.value,
    onSend: handleAdjustSend,
    onCommit: handleCommitSend,
    minDelta: ADJUST_MIN_DELTA,
    idleDelayMs: ADJUST_IDLE_DELAY_MS,
    throttleMs: ADJUST_THROTTLE_MS,
    commitDelayMs: ADJUST_COMMIT_DELAY_MS
})

const temperatureControl = useAdjustControl({
    label: 'Температура',
    kind: 'temperature',
    min: () => minCct.value,
    max: () => maxCct.value,
    snapshot: temperatureSnapshot,
    currentAutoTarget: () => autoCctTarget.value,
    onSend: handleAdjustSend,
    onCommit: handleCommitSend,
    minDelta: ADJUST_MIN_DELTA_TEMP,
    idleDelayMs: ADJUST_IDLE_DELAY_MS,
    throttleMs: ADJUST_THROTTLE_MS,
    commitDelayMs: ADJUST_COMMIT_DELAY_MS,
    snapToAuto: false
})

watch(
    () => currentBrightness.value,
    (value) => {
        if (Number.isFinite(value)) {
            brightnessControl.setFromOutside(clampNumber(value, 0, 100))
        }
    },
    { immediate: true }
)

watch(
    () => currentCct.value,
    (value) => {
        if (Number.isFinite(value)) {
            temperatureControl.setFromOutside(clampNumber(value, minCct.value, maxCct.value))
        }
    },
    { immediate: true }
)

watch(
    [minBrightnessPercent, maxBrightnessPercent],
    () => {
        brightnessControl.setFromOutside(brightnessControl.control.value)
    }
)

watch(
    [minCct, maxCct],
    () => {
        temperatureControl.setFromOutside(temperatureControl.control.value)
    }
)

const brightnessDisplayValue = computed(() =>
    Math.round(clampNumber(brightnessControl.display.value ?? brightnessSnapshot(), 0, 100))
)

const temperatureDisplayValue = computed(() =>
    Math.round(clampNumber(temperatureControl.display.value ?? temperatureSnapshot(), minCct.value, maxCct.value))
)

const brightnessFillPercent = computed(() => brightnessDisplayValue.value)

const temperatureFillPercent = computed(() => {
    const span = maxCct.value - minCct.value
    if (span <= 0) return 0
    return ((temperatureDisplayValue.value - minCct.value) / span) * 100
})

const brightnessTargetPercent = computed(() => {
    if (!Number.isFinite(autoBrightnessTarget.value)) return null
    return clampNumber(autoBrightnessTarget.value, 0, 100)
})

const temperatureTargetPercent = computed(() => {
    if (!Number.isFinite(autoCctTarget.value)) return null
    const span = maxCct.value - minCct.value
    if (span <= 0) return null
    return ((autoCctTarget.value - minCct.value) / span) * 100
})

const brightnessLimits = computed(() => ({
    canIncrease: brightnessControl.control.value < 100,
    canDecrease: brightnessControl.control.value > 0
}))

const temperatureLimits = computed(() => ({
    canIncrease: temperatureControl.control.value < maxCct.value,
    canDecrease: temperatureControl.control.value > minCct.value
}))

const pauseTargetTs = computed(() => {
    const resumeAt = Number(pauseInfo.value?.reason?.resumeAt)
    if (Number.isFinite(resumeAt)) return resumeAt
    const until = Number(pauseInfo.value?.until)
    return Number.isFinite(until) ? until : null
})

const pauseUntilLabel = computed(() =>
    Number.isFinite(pauseTargetTs.value) ? formatTimeLabel(pauseTargetTs.value) : null
)

const pauseReasonLabel = computed(() => {
    const type = pauseInfo.value?.reason?.type
    return type ? (PAUSE_REASON_TEXT[type] || type) : null
})

const pauseSummary = computed(() => {
    if (!pauseInfo.value?.until) return null
    return {
        until: pauseUntilLabel.value,
        reason: pauseReasonLabel.value
    }
})

const statusResult = computed(() => statusInfo.value?.result || null)

const isPaused = computed(() => {
    if (pauseInfo.value?.until && Date.now() < pauseInfo.value.until) return true
    if (derived.value?.status === 'PAUSE') return true
    if (statusResult.value?.reason === 'manual_pause') return true
    return false
})

const statusView = computed(() => {
    if (isDisabled.value) {
        return { text: 'Отключен' }
    }
    const result = statusResult.value
    if (!result) {
        return { text: 'Нет данных' }
    }
    if (result.reason === 'presence_guard') {
        return { text: 'Заблокирован по присутствию' }
    }
    if (result.reason === 'manual_pause') {
        return { text: 'На паузе' }
    }
    if (result.reason === 'disabled') {
        return { text: 'Отключен' }
    }
    if (result.active) {
        return { text: 'Активен' }
    }
    if (typeof result.reason === 'string' && result.reason) {
        return { text: result.reason }
    }
    return { text: 'Не активен' }
})

const statusLabel = computed(() => statusView.value.text)
const runPauseLabel = computed(() => (isPaused.value ? 'Запустить' : 'Пауза'))

const statusNotes = computed(() => {
    const notes = []
    const result = statusResult.value
    if (result) {
        if (Number.isFinite(result.actionsSent)) {
            notes.push(`Команды: ${result.actionsSent}`)
        }
        if (result.reason && !['manual_pause', 'presence_guard', 'disabled'].includes(result.reason)) {
            notes.push(result.reason)
        }
    }
    if (pauseSummary.value) {
        notes.push(`Пауза до ${pauseSummary.value.until}${pauseSummary.value.reason ? ` (${pauseSummary.value.reason})` : ''}`)
    }
    return notes
})

const presenceStatusLabel = computed(() => {
    const anyoneHome = statusResult.value?.presence?.anyoneHome
    if (anyoneHome === true) return 'Кто-то дома'
    if (anyoneHome === false) return 'Никого нет'
    return null
})

const derivedHistory = computed(() => {
    const list = derived.value?.history
    if (!Array.isArray(list)) return []
    return [...list].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 10)
})

const latestBrightness = computed(() =>
    Number.isFinite(latestNumbers.value.brightness) ? Math.round(latestNumbers.value.brightness) : null
)
const latestCct = computed(() =>
    Number.isFinite(latestNumbers.value.cct) ? Math.round(latestNumbers.value.cct) : null
)
const latestLux = computed(() =>
    Number.isFinite(latestNumbers.value.lux) ? latestNumbers.value.lux : null
)

watch(
    () => [scenario.time?.tz, scenario.time?.lat, scenario.time?.lon],
    () => {
        scenario.autoLight.location = scenario.autoLight.location || {}
        scenario.autoLight.location.tz = scenario.time?.tz || scenario.autoLight.location.tz
        scenario.autoLight.location.lat = scenario.time?.lat ?? scenario.autoLight.location.lat
        scenario.autoLight.location.lon = scenario.time?.lon ?? scenario.autoLight.location.lon
    }
)

function resetCurve(kind) {
    if (kind === 'day') {
        scenario.autoLight.brightnessCurveDay = scenario.autoLight.brightnessCurveDayBase.map((p) => ({ ...p }))
        message.value = 'Дневная кривая сброшена'
    } else if (kind === 'evening') {
        scenario.autoLight.brightnessCurveEvening = scenario.autoLight.brightnessCurveEveningBase.map((p) => ({ ...p }))
        message.value = 'Вечерняя кривая сброшена'
    } else if (kind === 'cct') {
        scenario.autoLight.cctOverrides = []
        message.value = 'Температурные поправки сброшены'
    }
    derived.value = buildDerivedAutoLightLocal(scenario)
}

const brightnessChart = computed(() => {
    const dayBase = derived.value?.brightness?.day?.base || convertCurveToPercent(scenario.autoLight.brightnessCurveDayBase)
    const dayCurve = derived.value?.brightness?.day?.curve || convertCurveToPercent(scenario.autoLight.brightnessCurveDay)
    const eveningBase = derived.value?.brightness?.evening?.base || convertCurveToPercent(scenario.autoLight.brightnessCurveEveningBase)
    const eveningCurve = derived.value?.brightness?.evening?.curve || convertCurveToPercent(scenario.autoLight.brightnessCurveEvening)
    return {
        day: { base: dayBase, curve: dayCurve },
        evening: { base: eveningBase, curve: eveningCurve }
    }
})

const cctChart = computed(() => {
    const base = derived.value?.cct?.base || computeCctBaseSegments(scenario)
    const overrides = derived.value?.cct?.overrides || scenario.autoLight.cctOverrides || []
    return { base, overrides }
})

function brightnessPath(points, width, height) {
    if (!Array.isArray(points) || !points.length) return ''
    const coords = points.map((p, index) => {
        const x = p.x * width
        const y = height - (p.value / 100) * height
        return `${index === 0 ? 'M' : 'L'}${x},${y}`
    })
    return coords.join(' ')
}

function cctPath(points, width, height, minValue, maxValue) {
    if (!Array.isArray(points) || !points.length) return ''
    const span = Math.max(1, maxValue - minValue)
    const coords = points.map((p, index) => {
        const x = (p.t_min / 1440) * width
        const y = height - ((p.C - minValue) / span) * height
        return `${index === 0 ? 'M' : 'L'}${x},${y}`
    })
    return coords.join(' ')
}

async function loadCatalog() {
    try {
        const data = await scenarioRequest('/catalog')
        catalog.devices = Array.isArray(data?.devices) ? data.devices : []
        catalog.groups = Array.isArray(data?.groups) ? data.groups : []
        catalog.rooms = Array.isArray(data?.rooms) ? data.rooms : []
    } catch (err) {
        console.warn('Failed to load catalog', err)
    }
}

async function loadScenario(id) {
    brightnessControl.reset()
    temperatureControl.reset()
    if (!id) {
        Object.assign(scenario, createDefaultAutoLightScenario())
        derived.value = buildDerivedAutoLightLocal(scenario)
        pauseInfo.value = null
        statusInfo.value = null
        wasSaved.value = false
        return
    }
    const data = await scenarioRequest(`/scenario?id=${encodeURIComponent(id)}`)
    if (data?.scenario) {
        Object.assign(scenario, createDefaultAutoLightScenario(), data.scenario)
    }
    normalizeAutoLightScenarioStruct(scenario)
    if (!scenario.id) {
        scenario.id = 'autolight'
    }
    hydrateScenarioFromResponse(data)
    wasSaved.value = true
    brightnessControl.setFromOutside(currentBrightness.value ?? brightnessSnapshot())
    temperatureControl.setFromOutside(currentCct.value ?? temperatureSnapshot())
}

async function saveScenario(options = {}) {
    saving.value = true
    error.value = ''
    message.value = ''
    try {
        const payload = JSON.parse(JSON.stringify(scenario))
        console.info('[auto-light] saving payload', payload)
        const response = await scenarioRequest('/save', { method: 'POST', body: { scenario: payload } })
        hydrateScenarioFromResponse(response)
        wasSaved.value = true
        if (!props.scenarioId && scenario.id) emit('saved', scenario.id)
        if (!options.silent) message.value = 'Сценарий сохранён'
    } catch (err) {
        console.error('[auto-light] save failed', err)
        const details = err?.data?.errors || err?.data || null
        if (details) console.error('[auto-light] validation details', details)
        error.value = err?.message || String(err)
    } finally {
        saving.value = false
    }
}

async function handleQuickBrightness(delta) {
    if (!ensureScenarioReady()) {
        brightnessControl.reset()
        return
    }
    if (delta > 0 && !brightnessLimits.value.canIncrease) {
        message.value = 'Максимальная яркость уже достигнута'
        return
    }
    if (delta < 0 && !brightnessLimits.value.canDecrease) {
        message.value = 'Минимальная яркость уже достигнута'
        return
    }
    const note = delta > 0 ? 'Кнопка ярче' : 'Кнопка темнее'
    console.info('[auto-light] quick brightness', { delta })
    brightnessControl.quickAdjust(delta, note)
    message.value = delta > 0 ? 'Команда: ярче' : 'Команда: темнее'
}

async function handleQuickTemperature(delta) {
    if (!ensureScenarioReady()) {
        temperatureControl.reset()
        return
    }
    if (delta > 0 && !temperatureLimits.value.canIncrease) {
        message.value = 'Выше установленного максимума температура не поднимается'
        return
    }
    if (delta < 0 && !temperatureLimits.value.canDecrease) {
        message.value = 'Ниже установленного минимума температура не опускается'
        return
    }
    const note = delta > 0 ? 'Кнопка теплее' : 'Кнопка холоднее'
    console.info('[auto-light] quick temperature', { delta })
    temperatureControl.quickAdjust(delta, note)
    message.value = delta > 0 ? 'Команда: теплее' : 'Команда: холоднее'
}

async function handleRunPause() {
    if (!scenario.id) return
    if (!isPersisted.value) {
        message.value = 'Сценарий не сохранён'
        return
    }
    if (scenario.disabled) {
        message.value = 'Сценарий отключен'
        return
    }
    error.value = ''
    const pauseRequested = !isPaused.value
    const endpoint = pauseRequested ? '/pause' : '/resume'
    const logAction = pauseRequested ? 'pause' : 'resume'
    console.info('[auto-light] run/pause request', { id: scenario.id, action: logAction })
    running.value = true
    try {
        const response = await scenarioRequest(endpoint, { method: 'POST', body: { id: scenario.id } })
        console.info('[auto-light] run/pause response', response)
        hydrateScenarioFromResponse(response)
        if (pauseRequested) {
            message.value = 'Сценарий поставлен на паузу'
        } else {
            const result = response?.result || null
            const stillPaused = !!(response?.pause || result?.reason === 'manual_pause')
            if (stillPaused) {
                message.value = result?.reason === 'presence_guard'
                    ? 'Команда отклонена: никого нет дома'
                    : 'Сценарий остаётся на паузе'
            } else if (result?.reason === 'presence_guard') {
                message.value = 'Команда отклонена: никого нет дома'
            } else if (result?.active && result?.actionsSent != null) {
                message.value = `Команды отправлены: ${result.actionsSent}`
            } else if (result?.active) {
                message.value = 'Пауза снята'
            } else if (response?.error) {
                message.value = response.error
            } else {
                message.value = 'Пауза снята'
            }
        }
    } catch (err) {
        error.value = err?.message || String(err)
        console.error('[auto-light] run/pause failed', err)
    } finally {
        running.value = false
    }
}

async function toggleDisabled() {
    if (!scenario.id || !isPersisted.value) {
        message.value = 'Сохраните сценарий, чтобы изменить состояние'
        return
    }
    const nextDisabled = !scenario.disabled
    const path = nextDisabled ? '/disable' : '/enable'
    console.info('[auto-light] toggle disabled request', { id: scenario.id, disable: nextDisabled })
    error.value = ''
    message.value = ''
    if (nextDisabled) {
        brightnessControl.reset()
        temperatureControl.reset()
    }
    try {
        const response = await scenarioRequest(path, { method: 'POST', body: { id: scenario.id } })
        console.info('[auto-light] toggle disabled response', response)
        if (response?.scenario?.disabled != null) {
            scenario.disabled = response.scenario.disabled === true
        } else {
            scenario.disabled = nextDisabled
        }
        hydrateScenarioFromResponse(response)
        message.value = scenario.disabled ? 'Сценарий выключен' : 'Сценарий включен'
    } catch (err) {
        scenario.disabled = !nextDisabled
        error.value = err?.message || String(err)
        console.error('[auto-light] toggle disabled failed', err)
        derived.value = buildDerivedAutoLightLocal(scenario)
    }
}

async function initialize() {
    try {
        await loadConfig()
        await loadCatalog()
        await loadScenario(props.scenarioId)
    } catch (err) {
        error.value = err?.message || String(err)
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    initialize()
})

onBeforeUnmount(() => {
    brightnessControl.teardown()
    temperatureControl.teardown()
})

watch(
    () => props.scenarioId,
    async (next) => {
        loading.value = true
        try {
            await loadScenario(next)
        } catch (err) {
            error.value = err?.message || String(err)
        } finally {
            loading.value = false
        }
    }
)
</script>

<template>
    <section class="auto-light">
        <div v-if="loading" class="loading">Загрузка…</div>
        <div v-if="!loading" class="content">
            <header class="head">
                <div>
                    <label class="name-label">
                        <span>Название</span>
                        <input v-model="scenario.name" type="text" maxlength="80" placeholder="Автоматический свет" />
                    </label>
                    <div class="status-line">
                        <span class="status-pill" :class="{ paused: isPaused, disabled: isDisabled }">
                            <template v-if="isDisabled">Отключен</template>
                            <template v-else>
                                {{ isPaused ? 'На паузе' : 'Активен' }}
                                <template v-if="pauseUntilLabel">
                                    · до {{ pauseUntilLabel }}<template v-if="pauseReasonLabel"> · {{ pauseReasonLabel
                                    }}</template>
                                </template>
                            </template>
                        </span>
                        <span class="sensor-pill" v-if="scenario.autoLight.sensorId">
                            Датчик: {{sensorOptions.find((opt) => opt.id === scenario.autoLight.sensorId)?.name ||
                                scenario.autoLight.sensorId
                            }}
                        </span>
                    </div>
                </div>
                <div class="head-actions">
                    <button type="button" class="secondary" @click="toggleDisabled" :disabled="!isPersisted || saving">
                        {{ isDisabled ? 'Включить' : 'Выключить' }}
                    </button>
                    <button type="button" class="secondary" @click="handleRunPause"
                        :disabled="!isPersisted || running || isDisabled">
                        <template v-if="running">
                            {{ isPaused ? 'Запуск…' : 'Пауза…' }}
                        </template>
                        <template v-else>
                            {{ runPauseLabel }}
                        </template>
                    </button>
                    <button type="button" class="primary" @click="saveScenario" :disabled="saving">
                        {{ saving ? 'Сохранение…' : 'Сохранить' }}
                    </button>
                </div>
            </header>

            <section class="panel" aria-labelledby="targets">
                <h2 id="targets">Устройства</h2>
                <ScenarioDevicesSection :catalog="catalog" :sections="targetSections"
                    :selected-devices="selectedDevicesList" :group-entries="groupEntries"
                    :standalone-devices="standaloneDevices" v-model="scenario.target" :show-selected-only="true" />
                <div class="activation">
                    <label>
                        <span>Включение света</span>
                        <input type="time" v-model="activationTime" />
                    </label>
                    <p class="activation__hint">Автоматическая яркость работает круглосуточно, а максимум держится до 30
                        минут после
                        заката.</p>
                </div>
            </section>

            <section class="panel sensor-config">
                <header class="section-head">
                    <div>
                        <h2>Источник освещённости</h2>
                        <p class="hint">Выберите датчик и уровень, при котором автомат выключает свет</p>
                    </div>
                </header>
                <div class="sensor-grid">
                    <label>
                        <span>Датчик освещённости</span>
                        <select v-model="scenario.autoLight.sensorId">
                            <option value="">Выберите датчик…</option>
                            <option v-for="sensor in sensorOptions" :key="sensor.id" :value="sensor.id">
                                {{ sensor.name }}<template v-if="sensor.detail"> · {{ sensor.detail }}</template>
                            </option>
                        </select>
                    </label>
                    <label>
                        <span>Выключать при ≥ (лк)</span>
                        <input type="number" min="1" v-model.number="scenario.autoLight.L_off" />
                    </label>
                </div>
            </section>

            <section class="panel tuning-panel">
                <header class="section-head">
                    <div>
                        <h2>Настройка света</h2>
                        <p class="hint">Живое обновление каждую минуту • перетаскивайте ползунки или используйте кнопки
                        </p>
                    </div>
                    <button type="button" class="outline" :disabled="!isPersisted || !derivedHistory.length"
                        @click="historyExpanded = !historyExpanded">
                        {{ historyExpanded ? 'Скрыть историю' : 'История' }}
                    </button>
                </header>

                <AdaptiveLightRoomDemo />

                <div class="tuning-grid">
                    <TuningSliderColumn
                        label="Яркость"
                        unit="%"
                        :min="0"
                        :max="100"
                        :step="1"
                        :value="brightnessControl.control.value"
                        :display-value="brightnessDisplayValue"
                        :fill-percent="brightnessFillPercent"
                        :target-percent="brightnessTargetPercent"
                        :disabled="!isPersisted || isDisabled"
                        :quick-increase-disabled="quickActionsDisabled || !brightnessLimits.canIncrease"
                        :quick-decrease-disabled="quickActionsDisabled || !brightnessLimits.canDecrease"
                        increase-label="Ярче"
                        decrease-label="Темнее"
                        increase-icon="+"
                        decrease-icon="−"
                        track-class="tuning-slider__track--brightness"
                        fill-class="tuning-slider__fill--brightness"
                        fill-gradient="linear-gradient(180deg, #ffffff 0%, #111827 100%)"
                        slider-class="tuning-slider__input--brightness"
                        @pointerdown="brightnessControl.onPointerDown"
                        @pointerup="brightnessControl.onPointerUp"
                        @pointercancel="brightnessControl.onPointerUp"
                        @input="(value) => brightnessControl.onInput(value, 'Ползунок яркости')"
                        @change="() => brightnessControl.scheduleSend(true)"
                        @quick-plus="() => handleQuickBrightness(10)"
                        @quick-minus="() => handleQuickBrightness(-10)"
                    />

                    <TuningSliderColumn
                        label="Цветовая температура"
                        unit="K"
                        :min="minCct"
                        :max="maxCct"
                        :step="1"
                        :value="temperatureControl.control.value"
                        :display-value="temperatureDisplayValue"
                        :fill-percent="temperatureFillPercent"
                        :target-percent="temperatureTargetPercent"
                        :disabled="!isPersisted || isDisabled"
                        :quick-increase-disabled="quickActionsDisabled || !temperatureLimits.canIncrease"
                    :quick-decrease-disabled="quickActionsDisabled || !temperatureLimits.canDecrease"
                    increase-label="Теплее"
                    decrease-label="Холоднее"
                    increase-icon="+"
                    decrease-icon="−"
                    track-class="tuning-slider__track--cct"
                    fill-class="tuning-slider__fill--cct"
                    slider-class="tuning-slider__input--cct"
                    @pointerdown="temperatureControl.onPointerDown"
                    @pointerup="temperatureControl.onPointerUp"
                        @pointercancel="temperatureControl.onPointerUp"
                        @input="(value) => temperatureControl.onInput(value, 'Ползунок температуры')"
                        @change="() => temperatureControl.scheduleSend(true)"
                        @quick-plus="() => handleQuickTemperature(100)"
                        @quick-minus="() => handleQuickTemperature(-100)"
                    />
                </div>

                <transition name="fade">
                    <ul v-if="historyExpanded && derivedHistory.length" class="history history--stacked">
                        <li v-for="entry in derivedHistory" :key="entry.ts">
                            <span>{{ formatTimeLabel(entry.ts) }}</span>
                            <span v-if="entry.lux != null">{{ Math.round(entry.lux) }} лк →</span>
                            <span v-if="entry.brightness != null">{{ entry.brightness }}%</span>
                            <span v-if="entry.cct != null">{{ entry.cct }}K</span>
                            <span v-if="entry.note" class="history-note">{{ entry.note }}</span>
                        </li>
                    </ul>
                </transition>
            </section>

            <section class="panel presence-panel">
                <header class="section-head">
                    <div>
                        <h2>Присутствие</h2>
                        <p class="hint">Выберите условия, при которых автоматизация активна.</p>
                    </div>
                    <span v-if="presenceStatusLabel" class="presence-status">{{ presenceStatusLabel }}</span>
                </header>
                <PresenceOptions
                    v-model="scenario.runtime.presence"
                    :choices="presenceChoices"
                    name="presence-mode-autolight"
                    :disabled="isDisabled"
                />
            </section>

            <section v-if="statusInfo || latestState" class="panel status-panel">
                <header class="section-head">
                    <div>
                        <h2>Состояние</h2>
                        <p class="hint">Последний запуск и фактические значения устройств.</p>
                    </div>
                </header>
                <div class="status-grid">
                    <div class="status-cell">
                        <span class="status-label">Последний запуск</span>
                        <span class="status-value">
                            {{ statusInfo?.ts ? new Date(statusInfo.ts).toLocaleString('ru-RU') : '—' }}
                        </span>
                    </div>
                    <div class="status-cell">
                        <span class="status-label">Статус</span>
                        <span class="status-value">{{ statusLabel }}</span>
                    </div>
                    <div class="status-cell">
                        <span class="status-label">Пауза</span>
                        <span class="status-value">
                            <template v-if="pauseSummary">
                                до {{ pauseSummary.until }}<template v-if="pauseSummary.reason"> · {{
                                    pauseSummary.reason }}</template>
                            </template>
                            <template v-else>—</template>
                        </span>
                    </div>
                    <div class="status-cell">
                        <span class="status-label">Яркость</span>
                        <span class="status-value">
                            {{ latestBrightness != null ? `${latestBrightness}%` : '—' }}
                        </span>
                    </div>
                    <div class="status-cell">
                        <span class="status-label">Цветовая температура</span>
                        <span class="status-value">
                            {{ latestCct != null ? `${latestCct} K` : '—' }}
                        </span>
                    </div>
                    <div class="status-cell">
                        <span class="status-label">Освещённость</span>
                        <span class="status-value">
                            {{ latestLux != null ? `${Math.round(latestLux)} лк` : '—' }}
                        </span>
                    </div>
                </div>
                <p v-if="statusNotes.length" class="status-note">
                    <span v-for="(note, idx) in statusNotes" :key="idx">
                        <template v-if="idx"> · </template>{{ note }}
                    </span>
                </p>
            </section>

            <section class="panel charts">
                <ChartBlock
                    title="Дневная яркость"
                    :hint="`Работает по датчику до ${scenario.autoLight.L_off} лк`"
                    reset-label="Сбросить кривую"
                    @reset="resetCurve('day')"
                >
                    <svg viewBox="0 0 400 200" role="img" aria-label="Day brightness curve">
                        <text x="200" y="195" class="axis-label">Освещённость (норм., 0→1)</text>
                        <text x="14" y="100" class="axis-label axis-label--y" transform="rotate(-90, 14, 100)">Яркость (%)</text>
                        <path :d="brightnessPath(brightnessChart.day.base, 400, 200)" class="curve curve--base" />
                        <path :d="brightnessPath(brightnessChart.day.curve, 400, 200)" class="curve curve--current" />
                    </svg>
                </ChartBlock>

                <ChartBlock
                    title="Вечерняя яркость"
                    hint="После наступления темноты"
                    reset-label="Сбросить кривую"
                    @reset="resetCurve('evening')"
                >
                    <svg viewBox="0 0 400 200" role="img" aria-label="Evening brightness curve">
                        <text x="200" y="195" class="axis-label">Прогресс вечера (0→1)</text>
                        <text x="14" y="100" class="axis-label axis-label--y" transform="rotate(-90, 14, 100)">Яркость (%)</text>
                        <path :d="brightnessPath(brightnessChart.evening.base, 400, 200)" class="curve curve--base" />
                        <path :d="brightnessPath(brightnessChart.evening.curve, 400, 200)"
                            class="curve curve--current" />
                    </svg>
                </ChartBlock>

                <ChartBlock
                    title="Кривая цветовой температуры"
                    hint="База от рассвета до заката + локальные сдвиги"
                    reset-label="Сбросить кривую"
                    @reset="resetCurve('cct')"
                >
                    <svg viewBox="0 0 400 200" role="img" aria-label="CCT curve">
                        <text x="200" y="195" class="axis-label">Время суток</text>
                        <text x="14" y="100" class="axis-label axis-label--y" transform="rotate(-90, 14, 100)">Цветовая температура (K)</text>
                        <path
                            :d="cctPath(cctChart.base, 400, 200, scenario.autoLight.params?.minCct || DEFAULT_PARAMS.minCct, scenario.autoLight.params?.maxCct || DEFAULT_PARAMS.maxCct)"
                            class="curve curve--base" />
                        <path v-if="cctChart.overrides.length" :d="cctPath(
                            cctChart.overrides,
                            400,
                            200,
                            scenario.autoLight.params?.minCct || DEFAULT_PARAMS.minCct,
                            scenario.autoLight.params?.maxCct || DEFAULT_PARAMS.maxCct
                        )" class="curve curve--override" />
                    </svg>
                </ChartBlock>
            </section>

            <section v-if="error" class="alert error">{{ error }}</section>
            <section v-else-if="message" class="alert success">{{ message }}</section>
        </div>
    </section>
</template>

<style scoped>
.auto-light {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
}

.content {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    background: rgba(248, 250, 252, 0.85);
    border-radius: 16px;
    padding: 20px;
    border: 1px solid rgba(148, 163, 184, 0.35);
}

.head-actions {
    display: flex;
    gap: 10px;
    align-items: center;
}

.name-label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    color: #475569;
}

.name-label input {
    border-radius: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(148, 163, 184, 0.7);
    font-size: 16px;
    background: #fff;
}

.status-line {
    display: flex;
    gap: 12px;
    margin-top: 10px;
    align-items: center;
    color: #334155;
    font-size: 13px;
}

.status-pill {
    padding: 6px 12px;
    border-radius: 999px;
    font-weight: 600;
    background: rgba(34, 197, 94, 0.12);
    color: #047857;
}

.status-pill.paused {
    background: rgba(251, 191, 36, 0.16);
    color: #b45309;
}

.status-pill.disabled {
    background: rgba(148, 163, 184, 0.18);
    color: #475569;
}

.sensor-pill {
    padding: 6px 11px;
    border-radius: 999px;
    background: rgba(59, 130, 246, 0.1);
    color: #1d4ed8;
    font-weight: 600;
}

.panel {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 18px;
    padding: 20px;
    border: 1px solid rgba(203, 213, 225, 0.6);
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.section-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.section-head h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
}

.section-head .hint {
    margin: 4px 0 0;
    font-size: 13px;
    color: #64748b;
}

.sensor-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
}

.sensor-grid label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: #334155;
}

.sensor-grid select,
.sensor-grid input {
    border-radius: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(148, 163, 184, 0.7);
    font-size: 14px;
}

.activation {
    display: flex;
    align-items: center;
    gap: 16px;
    border-top: 1px solid rgba(226, 232, 240, 0.7);
    padding-top: 16px;
}

.activation label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    color: #334155;
}

.activation input[type='time'] {
    border-radius: 12px;
    padding: 8px 12px;
    border: 1px solid rgba(148, 163, 184, 0.7);
    font-size: 14px;
}

.activation__hint {
    margin: 0;
    font-size: 12px;
    color: #64748b;
}

.tuning-panel {
    gap: 20px;
}

.tuning-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 20px;
    align-items: stretch;
}

.presence-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.presence-status {
    font-size: 14px;
    color: #1f2937;
    font-weight: 600;
    margin-left: auto;
}

.chart-reset {
    border: none;
    background: transparent;
    color: #2563eb;
    font-size: 13px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
}

.chart-reset:hover {
    background: rgba(37, 99, 235, 0.08);
}

.presence-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.presence-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.5);
    background: rgba(248, 250, 252, 0.85);
    cursor: pointer;
    font-size: 14px;
}

.presence-option input {
    margin: 0;
}

.presence-option.active {
    border-color: rgba(59, 130, 246, 0.55);
    background: rgba(59, 130, 246, 0.12);
    box-shadow: 0 6px 14px rgba(59, 130, 246, 0.18);
}

.presence-option.active span {
    color: #1d4ed8;
    font-weight: 600;
}

.presence-option.disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.status-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
}

.status-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: #f8fafc;
    border-radius: 12px;
    padding: 12px;
    border: 1px solid #e2e8f0;
}

.status-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
}

.status-value {
    font-size: 14px;
    color: #0f172a;
    font-weight: 600;
}

.status-note {
    margin: 0;
}

.history {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
    font-size: 13px;
    color: #475569;
}

.history--stacked li {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, auto));
    gap: 6px;
    align-items: center;
}

.history-note {
    color: #1d4ed8;
    font-weight: 600;
}

.charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
}

.chart-block {
    background: rgba(248, 250, 252, 0.9);
    border-radius: 16px;
    padding: 16px;
    border: 1px solid rgba(203, 213, 225, 0.6);
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.chart-block svg {
    width: 100%;
    height: auto;
}

.axis-label {
    font-size: 12px;
    fill: #475569;
    text-anchor: middle;
    dominant-baseline: middle;
}

.axis-label--y {
    text-anchor: middle;
}

.curve {
    fill: none;
    stroke-width: 3;
}

.curve--base {
    stroke: #cbd5f5;
    stroke-dasharray: 6 6;
}

.curve--current {
    stroke: #4338ca;
}

.curve--override {
    stroke: #f59e0b;
    stroke-dasharray: 4 6;
}

.current-dot {
    fill: #fb7185;
    stroke: #fff;
    stroke-width: 3;
}

.presence {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    color: #334155;
}

.alert {
    padding: 12px 16px;
    border-radius: 12px;
    font-weight: 600;
}

.alert.error {
    background: #fee2e2;
    color: #b91c1c;
}

.alert.success {
    background: #dcfce7;
    color: #047857;
}

.primary {
    padding: 10px 18px;
    border-radius: 999px;
    border: 1px solid #4338ca;
    background: linear-gradient(135deg, #4338ca, #6366f1);
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: transform .1s ease, box-shadow .15s;
}

.primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px rgba(79, 70, 229, 0.35);
}

.secondary {
    padding: 10px 18px;
    border-radius: 999px;
    border: 1px solid #94a3b8;
    background: #f8fafc;
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s ease;
}

.secondary:hover {
    background: #e2e8f0;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity .2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.loading {
    padding: 12px 16px;
    border-radius: 12px;
    background: #e0f2fe;
    color: #0369a1;
    font-weight: 600;
    max-width: 240px;
    text-align: center;
}

@media (max-width: 768px) {
    .head-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .charts {
        grid-template-columns: 1fr;
    }
}

</style>
