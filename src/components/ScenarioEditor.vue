<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import ScenarioDevicesSection from './ScenarioDevicesSection.vue'
import ScenarioMappingSection from './ScenarioMappingSection.vue'
import ScenarioTimeSection from './ScenarioTimeSection.vue'
import ColorRamp from './ColorRamp.vue'
import PresenceOptions from './PresenceOptions.vue'
import {
    extractBrightnessValue,
    extractColorTemperature,
    extractColorHsv
} from '../utils/deviceState.js'
import {
    hsvToHex,
    rgbIntToRgb,
    rgbToHex,
    interpolateHsv,
    interpolateValue
} from '../utils/color.js'
import { useTargetDevices } from '../composables/useTargetDevices'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'

const props = defineProps({
    scenarioId: { type: String, default: '' }
})

const emit = defineEmits(['saved', 'deleted'])

const CYRILLIC_TO_LATIN = Object.freeze({
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
    з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
})

function slugify(value) {
    const lower = String(value || '').trim().toLowerCase()
    if (!lower) return ''
    const transliterated = lower
        .split('')
        .map((ch) => {
            if (/[a-z0-9]/.test(ch)) return ch
            if (CYRILLIC_TO_LATIN[ch] !== undefined) return CYRILLIC_TO_LATIN[ch]
            if (/\s|[-_]/.test(ch)) return '-'
            return ''
        })
        .join('')
    return transliterated.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

function normalizeBase(url) {
    const clean = String(url || '').trim()
    if (!clean) return ''
    return clean.replace(/\/+$/, '')
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min
    return Math.min(Math.max(value, min), max)
}

function toNumber(value) {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
}

function sanitizeIdList(list) {
    return Array.from(
        new Set(
            (Array.isArray(list) ? list : [])
                .map((id) => String(id || '').trim())
                .filter(Boolean)
        )
    )
}

function formatTimestamp(ts) {
    if (!ts) return '—'
    try {
        return new Date(ts).toLocaleString('ru-RU')
    } catch (_) {
        return String(ts)
    }
}

function statusReasonText(result) {
    if (!result) return ''
    if (result.error) return result.error
    if (result.active) return 'Активен'
    if (result.reason === 'manual_pause') return 'На паузе'
    if (result.reason === 'presence_guard') return 'Заблокирован по присутствию'
    if (result.reason === 'disabled') return 'Отключен'
    if (result.reason) return result.reason
    return result.active === false ? 'Не активен' : ''
}

function formatPresenceState(presence) {
    if (!presence) return '—'
    const parts = []
    if (typeof presence.anyoneHome === 'boolean') {
        parts.push(presence.anyoneHome ? 'кто-то дома' : 'никого нет')
    }
    if (Array.isArray(presence.considered) && presence.considered.length) {
        parts.push(`учтены: ${presence.considered.join(', ')}`)
    }
    if (presence.reason) {
        parts.push(`причина: ${presence.reason}`)
    }
    return parts.length ? parts.join(' · ') : '—'
}

const config = reactive({
    scenariosBase: '',
    apiKey: ''
})

const catalog = reactive({
    devices: [],
    groups: [],
    rooms: []
})

const state = reactive({
    id: '',
    name: '',
    disabled: false,
    target: { groups: [], devices: [] },
    time: {
        tz: 'Europe/Moscow',
        lat: 55.751,
        lon: 37.617,
        start: { type: 'clock', time: '18:00' },
        end: { type: 'clock', time: '23:00' },
        days: [1, 2, 3, 4, 5, 6, 7]
    },
    brightness: {
        enabled: true,
        mode: 'manual',
        manual: { from: 80, to: 20 },
        sensor: {
            sensorId: '',
            sensorMin: 0,
            sensorMax: 2000,
            outputMin: 10,
            outputMax: 100
        }
    },
    color: {
        enabled: false,
        mode: 'temperature',
        temperature: { fromK: 4000, toK: 2700 },
        colors: {
            from: { h: 35, s: 70, v: 90 },
            to: { h: 210, s: 40, v: 60 }
        }
    },
    presence: {
        mode: 'always'
    },
    runtimeExtras: {}
})

const {
    roomsById,
    devicesById,
    sections: targetSections,
    selectedDevices: selectionDevices,
    groupEntries,
    standaloneDevices
} = useTargetDevices(catalog, state.target)

const isCatalogScenario = computed(() => {
    const extras = state.runtimeExtras || {}
    return Boolean(
        extras.catalogId ||
        extras.catalogKey ||
        extras.catalogScenarioId ||
        extras.presetId ||
        extras.templateId ||
        extras.prebuilt === true ||
        extras.origin === 'catalog' ||
        extras.catalog
    )
})

const isDisabled = computed(() => state.disabled === true)

function computeLocalTimeProgress(timeConfig) {
    if (!timeConfig) return { active: false, progress: null }
    const tz = timeConfig.tz || Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return { active: false, progress: null }

    const now = new Date()
    const zoned = new Date(now.toLocaleString('en-US', { timeZone: tz }))
    const day = zoned.getDay() === 0 ? 7 : zoned.getDay()
    if (Array.isArray(timeConfig.days) && timeConfig.days.length && !timeConfig.days.includes(day)) {
        return { active: false, progress: null }
    }

    const toMinutes = (input) => {
        const [hh, mm] = String(input || '00:00').split(':').map((part) => Number(part) || 0)
        return hh * 60 + mm
    }

    if (timeConfig.start?.type !== 'clock' || timeConfig.end?.type !== 'clock') {
        return { active: false, progress: null }
    }

    const startMin = toMinutes(timeConfig.start.time)
    const endMin = toMinutes(timeConfig.end.time)
    const currentMin = zoned.getHours() * 60 + zoned.getMinutes() + zoned.getSeconds() / 60

    if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
        return { active: false, progress: null }
    }

    if (startMin === endMin) {
        return { active: true, progress: 0 }
    }

    if (startMin < endMin) {
        if (currentMin < startMin || currentMin > endMin) {
            return { active: false, progress: null }
        }
        return { active: true, progress: clamp((currentMin - startMin) / (endMin - startMin), 0, 1) }
    }

    // Overnight window
    const adjustedEnd = endMin + 24 * 60
    const adjustedCurrent = currentMin < startMin ? currentMin + 24 * 60 : currentMin
    if (adjustedCurrent < startMin || adjustedCurrent > adjustedEnd) {
        return { active: false, progress: null }
    }
    return { active: true, progress: clamp((adjustedCurrent - startMin) / (adjustedEnd - startMin), 0, 1) }
}


const sensorOptions = computed(() => {
    const options = []
    catalog.devices.forEach((device) => {
        const props = Array.isArray(device.properties) ? device.properties : []
        props.forEach((prop) => {
            const instance = prop?.parameters?.instance
            if (instance === 'illumination') {
                options.push({
                    id: `${device.id}#${instance}`,
                    name: device.name || 'Сенсор',
                    detail: roomsById.value.get(device.room)?.name || '',
                    instance
                })
            }
        })
    })
    return options.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

const presenceChoices = Object.freeze([
    { value: 'always', label: 'Всегда' },
    { value: 'onlyWhenHome', label: 'Когда кто-то дома' },
    { value: 'onlyWhenAway', label: 'Когда никого нет дома' }
])

const ready = ref(false)
const loadingScenario = ref(false)
const catalogLoading = ref(false)
const catalogError = ref(null)
const saving = ref(false)
const running = ref(false)
const deleting = ref(false)
const warnings = ref([])
const validationErrors = ref([])
const conflict = ref(null)
const message = ref('')
const loadError = ref(null)
const scenarioVersion = ref(1)
const lastSnapshot = ref('')
const idTouched = ref(false)
const pauseInfo = ref(null)
const statusInfo = ref(null)

const fallbackId = ref(`scn_${Math.random().toString(36).slice(2, 8)}`)

const brightnessSupport = computed(() => {
    if (!selectionDevices.value.length) return { available: false, partial: false, hasSelection: false }
    let available = false
    let partial = false
    selectionDevices.value.forEach((device) => {
        if (device.supports.brightness) available = true
        else partial = true
    })
    return { available, partial, hasSelection: true }
})

const brightnessRuntime = computed(() => {
    const runtime = statusInfo.value?.result
    const active = !!runtime?.active
    let value = null
    let source = 'none'

    if (runtime) {
        const directCandidates = [
            runtime.currentBrightness,
            runtime.brightness,
            runtime?.current?.brightness,
            runtime?.state?.brightness,
            runtime?.metrics?.brightness,
            runtime?.calc?.brightness,
            runtime?.outputs?.brightness
        ]
        for (const candidate of directCandidates) {
            const numeric = toNumber(candidate)
            if (numeric != null) {
                value = numeric
                source = 'backend'
                break
            }
        }

        if (value == null) {
            const fromState = extractBrightnessValue(runtime.state)
            if (fromState != null) {
                value = fromState
                source = 'backend'
            }
        }

        if (value == null && Array.isArray(runtime.debug)) {
            for (let i = runtime.debug.length - 1; i >= 0; i--) {
                const entry = runtime.debug[i]
                if (!entry || typeof entry !== 'object') continue
                const ev = entry.ev
                if ((ev === 'common_value_from_sensor' || ev === 'common_value_from_ramp') && typeof entry.value === 'number') {
                    value = entry.value
                    source = ev === 'common_value_from_sensor' ? 'sensor' : 'manual'
                    break
                }
                if (ev === 'expected_brightness' && typeof entry.val === 'number') {
                    value = entry.val
                    source = 'calculated'
                    break
                }
                if ((ev === 'caps_brightness_manual' || ev === 'caps_generic') && entry.caps) {
                    const extracted = extractBrightnessValue(entry.caps)
                    if (extracted != null) {
                        value = extracted
                        source = ev === 'caps_brightness_manual' ? 'manual' : 'calculated'
                        break
                    }
                }
                if (value == null) {
                    const extracted = extractBrightnessValue(entry)
                    if (extracted != null) {
                        value = extracted
                        source = 'debug'
                        break
                    }
                }
            }
        }
    }

    if (value == null && state.brightness?.enabled) {
        if (state.brightness.mode === 'sensor') {
            value = clamp(Math.round(toNumber(state.brightness.sensor?.outputMax) ?? 100), 0, 100)
        } else {
            value = clamp(Math.round(toNumber(state.brightness.manual?.from) ?? 80), 1, 100)
        }
        source = 'config'
    }

    return {
        active,
        value,
        source
    }
})

const colorSupport = computed(() => {
    if (!selectionDevices.value.length) return { available: false, partial: false, hasSelection: false }
    let available = false
    let partial = false
    selectionDevices.value.forEach((device) => {
        if (device.supports.color) available = true
        else partial = true
    })
    return { available, partial, hasSelection: true }
})

const colorRuntime = computed(() => {
    const runtime = statusInfo.value?.result
    const runtimeActive = !!runtime?.active
    let debugActive = null
    const mode = state.color.mode === 'colors' ? 'colors' : 'temperature'
    let temperature = null
    let colorHex = null
    let hsv = null
    let source = 'none'
    let progress = null

    const setTemperature = (input, origin) => {
        const numeric = toNumber(input)
        if (!Number.isFinite(numeric)) return
        temperature = clamp(Math.round(numeric), 2000, 7000)
        if (source === 'none') source = origin
    }

    const setHsv = (value, origin) => {
        if (!value) return
        const safe = {
            h: clamp(Math.round(toNumber(value.h) ?? 0), 0, 360),
            s: clamp(Math.round(toNumber(value.s) ?? 0), 0, 100),
            v: clamp(Math.round(toNumber(value.v) ?? 0), 0, 100)
        }
        hsv = safe
        if (!colorHex) colorHex = hsvToHex(safe)
        if (source === 'none') source = origin
    }

    const setColorHex = (value, origin) => {
        if (!value) return
        const hex = String(value).trim()
        if (!hex) return
        colorHex = hex.startsWith('#') ? hex.toUpperCase() : `#${hex}`.toUpperCase()
        if (source === 'none') source = origin
    }

    if (runtime) {
        const temperatureCandidates = [
            runtime.currentColorTemperature,
            runtime.colorTemperature,
            runtime?.current?.colorTemperature,
            runtime?.state?.colorTemperature,
            runtime?.metrics?.colorTemperature,
            runtime?.calc?.colorTemperature
        ]
        for (const candidate of temperatureCandidates) {
            if (temperature != null) break
            setTemperature(candidate, 'backend')
        }
        if (temperature == null) {
            const extracted = extractColorTemperature(runtime.state)
            if (extracted != null) setTemperature(extracted, 'backend')
        }

        if (!colorHex) {
            const colorCandidates = [
                runtime.currentColor,
                runtime.color,
                runtime?.current?.color,
                runtime?.state?.color
            ]
            for (const candidate of colorCandidates) {
                if (!candidate) continue
                if (typeof candidate === 'string') {
                    setColorHex(candidate, 'backend')
                    break
                }
                const extractedHsv = extractColorHsv(candidate)
                if (extractedHsv) {
                    setHsv(extractedHsv, 'backend')
                    break
                }
            }
        }

        progress = toNumber(runtime?.progress) ?? toNumber(runtime?._dbg?.progress)

        if (Array.isArray(runtime.debug)) {
            for (let i = runtime.debug.length - 1; i >= 0; i--) {
                const entry = runtime.debug[i]
                if (!entry || typeof entry !== 'object') continue
                const ev = entry.ev || 'debug'
                if (debugActive === null && typeof entry.active === 'boolean' && ev === 'time_progress') {
                    debugActive = entry.active
                }
                if (typeof progress !== 'number' && typeof entry.progress === 'number') {
                    progress = entry.progress
                }
                if (temperature == null) {
                    if (typeof entry.safeK === 'number') setTemperature(entry.safeK, ev)
                    else {
                        const extracted = extractColorTemperature(entry)
                        if (extracted != null) setTemperature(extracted, ev)
                    }
                }
                if (!colorHex || !hsv) {
                    if (entry.hsv) setHsv(entry.hsv, ev)
                    else {
                        const extractedHsv = extractColorHsv(entry)
                        if (extractedHsv) setHsv(extractedHsv, ev)
                    }
                    if (!colorHex && typeof entry.color === 'string') setColorHex(entry.color, ev)
                    if (!colorHex && entry.caps) {
                        const capsHsv = extractColorHsv(entry.caps)
                        if (capsHsv) setHsv(capsHsv, ev)
                        const capsTemp = extractColorTemperature(entry.caps)
                        if (capsTemp != null) setTemperature(capsTemp, ev)
                    }
                }
                if (temperature != null && colorHex) break
                if (ev === 'time_progress' && typeof entry.progress === 'number') {
                    progress = entry.progress
                }
            }
        }
    }

    if (typeof progress === 'number') progress = clamp(progress, 0, 1)
    else progress = null

    const localWindow = computeLocalTimeProgress(state.time)
    if (progress === null && localWindow.progress != null) {
        progress = localWindow.progress
    }

    const gatherTargetCatalogDevices = () => {
        const map = new Map()
        state.target.devices.forEach((id) => {
            const device = devicesById.value.get(id)
            if (device) map.set(id, device)
        })
        state.target.groups.forEach((groupId) => {
            const group = groupEntries.value.find((item) => item.id === groupId)
            group?.devices.forEach((summary) => {
                const device = devicesById.value.get(summary.id)
                if (device) map.set(summary.id, device)
            })
        })
        return Array.from(map.values())
    }

    const catalogDevices = gatherTargetCatalogDevices()
    if (catalogDevices.length) {
        const catalogTemps = []
        const catalogHsv = []
        const catalogRgb = []
        catalogDevices.forEach((device) => {
            const caps = Array.isArray(device.capabilities) ? device.capabilities : []
            caps.forEach((cap) => {
                if (!cap || cap.type !== 'devices.capabilities.color_setting') return
                const st = cap.state
                if (!st) return
                const instance = st.instance
                const value = st.value
                if (instance === 'temperature_k' || instance === 'temperature') {
                    let candidate = value
                    if (!Number.isFinite(candidate)) {
                        if (value && typeof value === 'object') {
                            candidate = toNumber(value.temperature_k ?? value.k ?? value.value)
                        } else if (typeof st.temperature_k === 'number') {
                            candidate = st.temperature_k
                        }
                    }
                    if (Number.isFinite(candidate)) {
                        catalogTemps.push(candidate)
                        return
                    }
                }
                if (instance === 'hsv') {
                    const source = value && typeof value === 'object' ? value : st.hsv
                    if (source) {
                        const safe = {
                            h: toNumber(source.h),
                            s: toNumber(source.s),
                            v: toNumber(source.v)
                        }
                        if (Number.isFinite(safe.h) && Number.isFinite(safe.s) && Number.isFinite(safe.v)) {
                            catalogHsv.push({
                                h: clamp(Math.round(safe.h), 0, 360),
                                s: clamp(Math.round(safe.s), 0, 100),
                                v: clamp(Math.round(safe.v), 0, 100)
                            })
                            return
                        }
                    }
                }
                if (instance === 'rgb' && Number.isFinite(value)) {
                    const rgb = rgbIntToRgb(value)
                    if (rgb) catalogRgb.push(rgb)
                    return
                }
                if (instance === 'rgb' && value && typeof value === 'object') {
                    const rgb = {
                        r: toNumber(value.r),
                        g: toNumber(value.g),
                        b: toNumber(value.b)
                    }
                    if (Number.isFinite(rgb.r) && Number.isFinite(rgb.g) && Number.isFinite(rgb.b)) {
                        catalogRgb.push(rgb)
                        return
                    }
                }
                if (!instance) {
                    if (typeof st.temperature_k === 'number') {
                        catalogTemps.push(st.temperature_k)
                        return
                    }
                    if (st.value && typeof st.value === 'object') {
                        const tempCandidate = toNumber(st.value.temperature_k ?? st.value.k)
                        if (Number.isFinite(tempCandidate)) {
                            catalogTemps.push(tempCandidate)
                            return
                        }
                        if (Number.isFinite(st.value)) {
                            catalogTemps.push(st.value)
                            return
                        }
                        if ('h' in st.value && 's' in st.value && 'v' in st.value) {
                            catalogHsv.push({
                                h: clamp(Math.round(toNumber(st.value.h) ?? 0), 0, 360),
                                s: clamp(Math.round(toNumber(st.value.s) ?? 0), 0, 100),
                                v: clamp(Math.round(toNumber(st.value.v) ?? 0), 0, 100)
                            })
                            return
                        }
                    }
                }
                if (st.hsv && typeof st.hsv === 'object') {
                    catalogHsv.push({
                        h: clamp(Math.round(toNumber(st.hsv.h) ?? 0), 0, 360),
                        s: clamp(Math.round(toNumber(st.hsv.s) ?? 0), 0, 100),
                        v: clamp(Math.round(toNumber(st.hsv.v) ?? 0), 0, 100)
                    })
                    return
                }
                if (typeof st.value === 'number' && (instance === 'temperature_k' || instance === 'temperature')) {
                    catalogTemps.push(st.value)
                }
            })
        })
        const average = (values) => {
            if (!values.length) return null
            return values.reduce((sum, item) => sum + item, 0) / values.length
        }
        if (temperature == null && catalogTemps.length) {
            const avgTemp = clamp(Math.round(average(catalogTemps)), 2000, 7000)
            temperature = avgTemp
            if (source === 'none' || source === 'config') source = 'catalog'
        }
        if (!hsv && catalogHsv.length) {
            hsv = catalogHsv[0]
            if (source === 'none' || source === 'config') source = 'catalog'
        }
        if (!colorHex) {
            if (hsv) colorHex = hsvToHex(hsv)
            else if (catalogRgb.length) {
                colorHex = rgbToHex(catalogRgb[0])
                if (source === 'none' || source === 'config') source = 'catalog'
            }
        }
    }

    if (mode === 'temperature' && progress === null && temperature != null) {
        const fromK = toNumber(state.color.temperature.fromK)
        const toK = toNumber(state.color.temperature.toK)
        if (Number.isFinite(fromK) && Number.isFinite(toK) && fromK !== toK) {
            const ratio = (temperature - fromK) / (toK - fromK)
            progress = clamp(ratio, 0, 1)
        }
    }

    if (mode === 'colors' && (!colorHex || !hsv)) {
        const fromConfig = state.color.colors.from
        const toConfig = state.color.colors.to
        const ratio = typeof progress === 'number' ? progress : 0
        setHsv(interpolateHsv(fromConfig, toConfig, ratio), progress != null ? 'calculated' : 'config')
        if (progress == null) progress = ratio
    }

    if (temperature == null && mode === 'temperature') {
        const fromK = state.color.temperature.fromK
        const toK = state.color.temperature.toK
        const ratio = typeof progress === 'number' ? progress : 0
        const interpolated = interpolateValue(fromK, toK, ratio)
        setTemperature(interpolated, progress != null ? 'calculated' : 'config')
    }

    const hasLiveState = temperature != null || colorHex || hsv
    const active = runtimeActive || !!debugActive || localWindow.active || hasLiveState
    if (!active) {
        progress = null
        if (mode === 'temperature') {
            temperature = null
        } else {
            colorHex = null
            hsv = null
        }
    } else {
        if (mode === 'temperature') {
            colorHex = null
            hsv = null
        } else {
            temperature = null
            if (!colorHex && hsv) {
                colorHex = hsvToHex(hsv)
            }
        }
    }

    const result = {
        active,
        mode,
        temperature,
        colorHex,
        hsv,
        progress,
        source
    }

    return result
})

const snapshot = computed(() => JSON.stringify(buildScenarioPayload()))
const isDirty = computed(() => snapshot.value !== lastSnapshot.value)
const isPaused = computed(() => !!pauseInfo.value)
const debugPreview = computed(() => {
    const logs = statusInfo.value?.result?.debug
    if (!Array.isArray(logs) || !logs.length) return ''
    const slice = logs.slice(-8)
    return JSON.stringify(slice, null, 2)
})

let programmaticIdUpdate = false

function setScenarioId(value) {
    programmaticIdUpdate = true
    state.id = value
    programmaticIdUpdate = false
}

watch(
    () => state.name,
    (name) => {
        if (!ready.value) return
        if (props.scenarioId) return
        if (idTouched.value) return
        const slug = slugify(name)
        setScenarioId(slug ? (slug.startsWith('scn_') ? slug : `scn_${slug}`) : fallbackId.value)
    }
)

watch(
    () => state.id,
    () => {
        if (!ready.value) return
        if (programmaticIdUpdate) return
        idTouched.value = true
    }
)

watch(
    () => props.scenarioId,
    async (id, prev) => {
        if (!ready.value) return
        if (id === prev) return
        if (id) {
            await loadScenario(id)
        } else {
            resetState()
            markSnapshot()
        }
    }
)

function markSnapshot() {
    lastSnapshot.value = snapshot.value
}

function resetState() {
    setScenarioId('')
    state.name = ''
    state.disabled = false
    state.target.groups = []
    state.target.devices = []
    state.time = {
        tz: 'Europe/Moscow',
        lat: 55.751,
        lon: 37.617,
        start: { type: 'clock', time: '18:00' },
        end: { type: 'clock', time: '23:00' },
        days: [1, 2, 3, 4, 5, 6, 7]
    }
    state.brightness = {
        enabled: true,
        mode: 'manual',
        manual: { from: 80, to: 20 },
        sensor: {
            sensorId: '',
            sensorMin: 0,
            sensorMax: 2000,
            outputMin: 10,
            outputMax: 100
        }
    }
    state.color = {
        enabled: false,
        mode: 'temperature',
        temperature: { fromK: 4000, toK: 2700 },
        colors: {
            from: { h: 35, s: 70, v: 90 },
            to: { h: 210, s: 40, v: 60 }
        }
    }
    state.presence.mode = 'always'
    state.runtimeExtras = {}
    scenarioVersion.value = 1
    warnings.value = []
    validationErrors.value = []
    conflict.value = null
    message.value = ''
    idTouched.value = false
    pauseInfo.value = null
    statusInfo.value = null
    loadError.value = null
}

function normalizeScenarioTimeBlock(block, fallbackTime = '18:00') {
    if (block?.type === 'sun' || block?.type === 'sunrise' || block?.type === 'sunset') {
        const anchor = block.anchor === 'sunset' || block.type === 'sunset' ? 'sunset' : 'sunrise'
        const offsetSource = block.offsetMin ?? block.offset ?? 0
        return {
            type: 'sun',
            anchor,
            offsetMin: Number.isFinite(offsetSource) ? Number(offsetSource) : 0
        }
    }
    return {
        type: 'clock',
        time: block?.time || fallbackTime
    }
}

async function loadConfig() {
    try {
        const data = await getConfig()
        const apiBase =
            data.api ||
            data.apiBase ||
            data.scenariosUrl ||
            data.scenariosURL ||
            data.scenarioUrl ||
            data.scenariosBase ||
            ''
        config.scenariosBase = normalizeBase(apiBase)
        config.apiKey = data.apiKey || data['x-api-key'] || data.api_key || ''
    } catch (err) {
        console.warn('Config load failed', err)
        config.scenariosBase = ''
        config.apiKey = ''
    }
}

async function scenariosFetch(path, options = {}) {
    if (!config.scenariosBase) throw new Error('scenariosURL не задан в config.json')
    const headers = { ...(options.headers || {}) }
    if (config.apiKey) headers['x-api-key'] = config.apiKey
    if (options.body !== undefined) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    }
    trackFunctionCall()
    const res = await fetch(config.scenariosBase + path, {
        ...options,
        headers,
        credentials: options.credentials ?? 'include',
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    })
    const text = await res.text()
    let json = null
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        json = { raw: text }
    }
    if (!res.ok) {
        const error = new Error(json?.error || text || res.statusText || 'Request failed')
        error.status = res.status
        error.data = json
        error.raw = text
        throw error
    }
    return json
}

async function loadCatalog(force = false) {
    if (catalogLoading.value && !force) return
    if (!config.scenariosBase) return
    catalogLoading.value = true
    catalogError.value = null
    try {
        const data = await scenariosFetch('/catalog')
        catalog.devices = Array.isArray(data?.devices) ? data.devices : []
        catalog.groups = Array.isArray(data?.groups) ? data.groups : []
        catalog.rooms = Array.isArray(data?.rooms) ? data.rooms : []
    } catch (err) {
        catalogError.value = err
    } finally {
        catalogLoading.value = false
    }
}

function applyScenarioPayload(payload, pause = null, status = null) {
    resetState()
    if (!payload) {
        markSnapshot()
        return
    }
    setScenarioId(payload.id || props.scenarioId || fallbackId.value)
    state.name = payload.name || ''
    state.disabled = payload.disabled === true
    scenarioVersion.value = Number(payload.version) || 1
    state.target.groups = sanitizeIdList(payload.target?.groups)
    state.target.devices = sanitizeIdList(payload.target?.devices)

    const timePayload = payload.time || {}
    const parsedDays = Array.isArray(timePayload.days)
        ? timePayload.days
            .map((d) => Number(d))
            .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
            .sort((a, b) => a - b)
        : [1, 2, 3, 4, 5, 6, 7]
    state.time = {
        tz: timePayload.tz || state.time.tz,
        lat: Number.isFinite(Number(timePayload.lat)) ? Number(timePayload.lat) : state.time.lat,
        lon: Number.isFinite(Number(timePayload.lon)) ? Number(timePayload.lon) : state.time.lon,
        days: parsedDays.length ? parsedDays : [1, 2, 3, 4, 5, 6, 7],
        start: normalizeScenarioTimeBlock(timePayload.start, '18:00'),
        end: normalizeScenarioTimeBlock(timePayload.end, '23:00')
    }

    const runtimePayload = (payload.runtime && typeof payload.runtime === 'object') ? { ...payload.runtime } : {}
    const presenceMode = typeof runtimePayload.presence === 'string' ? runtimePayload.presence : 'always'
    if (presenceMode === 'onlyWhenHome' || presenceMode === 'onlyWhenAway') {
        state.presence.mode = presenceMode
    } else {
        state.presence.mode = 'always'
    }
    if (runtimePayload.presence !== undefined) {
        delete runtimePayload.presence
    }
    state.runtimeExtras = runtimePayload

    const actions = Array.isArray(payload.actions) ? payload.actions : []

    const brightnessAction = actions.find((action) => action?.type === 'light.brightness')
    if (brightnessAction) {
        state.brightness.enabled = true
        if (brightnessAction.source?.type === 'sensorMap') {
            state.brightness.mode = 'sensor'
            state.brightness.sensor = {
                sensorId: brightnessAction.source.sensorId || '',
                sensorMin: toNumber(brightnessAction.source.sensorMin) ?? 0,
                sensorMax: toNumber(brightnessAction.source.sensorMax) ?? 0,
                outputMin: clamp(Math.round(toNumber(brightnessAction.source.outputMin) ?? 10), 1, 100),
                outputMax: clamp(Math.round(toNumber(brightnessAction.source.outputMax) ?? 100), 1, 100)
            }
        } else {
            state.brightness.mode = 'manual'
            state.brightness.manual = {
                from: clamp(Math.round(toNumber(brightnessAction.source?.from) ?? 80), 1, 100),
                to: clamp(Math.round(toNumber(brightnessAction.source?.to) ?? 20), 1, 100)
            }
        }
    } else {
        state.brightness.enabled = false
    }

    const colorAction = actions.find((action) => action?.type?.startsWith('light.color'))
    if (colorAction) {
        state.color.enabled = true
        if (colorAction.type === 'light.color.hsv') {
            state.color.mode = 'colors'
            state.color.colors = {
                from: {
                    h: clamp(Math.round(toNumber(colorAction.source?.from?.h) ?? 0), 0, 360),
                    s: clamp(Math.round(toNumber(colorAction.source?.from?.s) ?? 0), 0, 100),
                    v: clamp(Math.round(toNumber(colorAction.source?.from?.v) ?? 0), 0, 100)
                },
                to: {
                    h: clamp(Math.round(toNumber(colorAction.source?.to?.h) ?? 0), 0, 360),
                    s: clamp(Math.round(toNumber(colorAction.source?.to?.s) ?? 0), 0, 100),
                    v: clamp(Math.round(toNumber(colorAction.source?.to?.v) ?? 0), 0, 100)
                }
            }
        } else if (colorAction.type === 'light.color.cct') {
            state.color.mode = 'temperature'
            state.color.temperature = {
                fromK: clamp(Math.round(toNumber(colorAction.source?.fromK) ?? 4000), 1000, 10000),
                toK: clamp(Math.round(toNumber(colorAction.source?.toK) ?? 2700), 1000, 10000)
            }
        }
    } else {
        state.color.enabled = false
    }

    idTouched.value = true

    warnings.value = []
    validationErrors.value = []
    conflict.value = null
    message.value = ''
    pauseInfo.value = pause
    statusInfo.value = status
    markSnapshot()
}

async function loadScenario(id) {
    loadError.value = null
    if (!id) {
        resetState()
        markSnapshot()
        return
    }
    loadingScenario.value = true
    try {
        const data = await scenariosFetch(`/scenario?id=${encodeURIComponent(id)}`)
        applyScenarioPayload(data?.scenario, data?.pause || null, data?.status || null)
    } catch (err) {
        if (err?.status === 404) {
            resetState()
            markSnapshot()
            message.value = ''
            loadError.value = {
                type: 'not-found',
                id,
                message: 'Сценарий не найден'
            }
            return
        }
        message.value = err?.message || 'Ошибка загрузки сценария'
    } finally {
        loadingScenario.value = false
    }
}


function kelvinToRgb(kelvin) {
    const temp = clamp(kelvin, 1000, 8000) / 100
    let r, g, b
    if (temp <= 66) {
        r = 255
        g = clamp(99.4708025861 * Math.log(temp) - 161.1195681661, 0, 255)
        b = temp <= 19 ? 0 : clamp(138.5177312231 * Math.log(temp - 10) - 305.0447927307, 0, 255)
    } else {
        r = clamp(329.698727446 * Math.pow(temp - 60, -0.1332047592), 0, 255)
        g = clamp(288.1221695283 * Math.pow(temp - 60, -0.0755148492), 0, 255)
        b = 255
    }
    return { r, g, b }
}

function rgbToHsv({ r, g, b }) {
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
        switch (max) {
            case rn:
                h = ((gn - bn) / delta) % 6
                break
            case gn:
                h = (bn - rn) / delta + 2
                break
            default:
                h = (rn - gn) / delta + 4
                break
        }
        h *= 60
        if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : delta / max
    const v = max
    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        v: Math.round(v * 100)
    }
}

function serializeTimeBoundary(point, fallback = '18:00') {
    if (point?.type === 'sun') {
        return {
            type: 'sun',
            anchor: point.anchor === 'sunset' ? 'sunset' : 'sunrise',
            offsetMin: Number.isFinite(point.offsetMin) ? Math.round(point.offsetMin) : 0
        }
    }
    const clean = String(point?.time || fallback).trim() || fallback
    return {
        type: 'clock',
        time: clean
    }
}

function buildScenarioPayload() {
    const groups = sanitizeIdList(state.target.groups)
    const devices = sanitizeIdList(state.target.devices)

    const start = serializeTimeBoundary(state.time.start, '18:00')
    const end = serializeTimeBoundary(state.time.end, '23:00')
    const days = Array.isArray(state.time.days)
        ? state.time.days
            .map((d) => Number(d))
            .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
            .sort((a, b) => a - b)
        : [1, 2, 3, 4, 5, 6, 7]

    const time = {
        days: days.length ? days : [1, 2, 3, 4, 5, 6, 7],
        start,
        end
    }
    if (state.time.tz) time.tz = state.time.tz
    if (Number.isFinite(Number(state.time.lat))) time.lat = Number(state.time.lat)
    if (Number.isFinite(Number(state.time.lon))) time.lon = Number(state.time.lon)

    const actions = []

    if (state.brightness.enabled) {
        if (state.brightness.mode === 'sensor') {
            const sensor = state.brightness.sensor
            actions.push({
                type: 'light.brightness',
                source: {
                    type: 'sensorMap',
                    sensorId: sensor.sensorId || '',
                    sensorMin: toNumber(sensor.sensorMin) ?? 0,
                    sensorMax: toNumber(sensor.sensorMax) ?? 0,
                    outputMin: clamp(Math.round(toNumber(sensor.outputMin) ?? 10), 1, 100),
                    outputMax: clamp(Math.round(toNumber(sensor.outputMax) ?? 100), 1, 100)
                }
            })
        } else {
            const manual = state.brightness.manual
            actions.push({
                type: 'light.brightness',
                source: {
                    type: 'manualRamp',
                    from: clamp(Math.round(toNumber(manual.from) ?? 80), 1, 100),
                    to: clamp(Math.round(toNumber(manual.to) ?? 20), 1, 100)
                }
            })
        }
    }

    if (state.color.enabled) {
        if (state.color.mode === 'temperature') {
            const fromK = clamp(Math.round(toNumber(state.color.temperature.fromK) ?? 4000), 1000, 10000)
            const toK = clamp(Math.round(toNumber(state.color.temperature.toK) ?? 2700), 1000, 10000)
            actions.push({
                type: 'light.color.cct',
                applyOnlyIfOn: true,
                source: {
                    type: 'manualRamp',
                    fromK,
                    toK
                }
            })
        } else {
            const from = state.color.colors.from
            const to = state.color.colors.to
            const fromHsv = {
                h: clamp(Math.round(toNumber(from.h) ?? 0), 0, 360),
                s: clamp(Math.round(toNumber(from.s) ?? 0), 0, 100),
                v: clamp(Math.round(toNumber(from.v) ?? 0), 0, 100)
            }
            const toHsv = {
                h: clamp(Math.round(toNumber(to.h) ?? 0), 0, 360),
                s: clamp(Math.round(toNumber(to.s) ?? 0), 0, 100),
                v: clamp(Math.round(toNumber(to.v) ?? 0), 0, 100)
            }
            actions.push({
                type: 'light.color.hsv',
                applyOnlyIfOn: true,
                source: {
                    type: 'manualRamp',
                    from: fromHsv,
                    to: toHsv
                }
            })
        }
    }

    const runtime = { ...(state.runtimeExtras || {}) }
    const presenceMode = state.presence?.mode || 'always'
    if (presenceMode === 'onlyWhenHome' || presenceMode === 'onlyWhenAway') {
        runtime.presence = presenceMode
    } else {
        delete runtime.presence
    }

    const payload = {
        id: state.id || fallbackId.value,
        version: scenarioVersion.value || 1,
        type: 'scenario-v1',
        name: state.name?.trim() || 'Новый сценарий',
        disabled: !!state.disabled,
        target: { groups, devices },
        time,
        actions
    }

    if (Object.keys(runtime).length) {
        payload.runtime = runtime
    }

    return payload
}

function validateLocal() {
    if (!state.name.trim()) return 'Укажите имя сценария'
    if (!state.target.groups.length && !state.target.devices.length) return 'Выберите хотя бы одно устройство'
    const start = state.time.start
    const end = state.time.end
    if (start.type === 'clock' && !/^\d{2}:\d{2}$/.test(start.time || '')) return 'Старт: неверный формат времени'
    if (end.type === 'clock' && !/^\d{2}:\d{2}$/.test(end.time || '')) return 'Финиш: неверный формат времени'
    if (start.type === 'sun' && !(start.anchor === 'sunrise' || start.anchor === 'sunset')) return 'Старт: выберите рассвет или закат'
    if (end.type === 'sun' && !(end.anchor === 'sunrise' || end.anchor === 'sunset')) return 'Финиш: выберите рассвет или закат'
    if (start.type === 'clock' && end.type === 'clock') {
        const [sh, sm] = (start.time || '00:00').split(':').map(Number)
        const [eh, em] = (end.time || '00:00').split(':').map(Number)
        if (Number.isFinite(sh) && Number.isFinite(sm) && Number.isFinite(eh) && Number.isFinite(em)) {
            const startMinutes = sh * 60 + sm
            const endMinutes = eh * 60 + em
            if (startMinutes === endMinutes) return 'Время окончания не должно совпадать со временем старта'
        }
    }
    if (state.color.enabled && !colorSupport.value.available) {
        return 'Выбранные устройства не поддерживают изменение цвета'
    }
    if (state.brightness.enabled && !brightnessSupport.value.available) {
        return 'Выбранные устройства не поддерживают изменение яркости'
    }
    return null
}

async function handleSave() {
    warnings.value = []
    validationErrors.value = []
    conflict.value = null
    message.value = ''

    const localError = validateLocal()
    if (localError) {
        message.value = localError
        return
    }

    saving.value = true
    try {
        const payload = buildScenarioPayload()
        console.log('Saving scenario payload:', payload)
        const res = await scenariosFetch('/scenario/save', { method: 'POST', body: { scenario: payload } })
        if (res?.scenario) {
            const nextPause = res?.trigger?.result?.pause || res?.status?.pause || null
            const nextStatus = res?.status || null
            applyScenarioPayload(res.scenario, nextPause, nextStatus)
            pauseInfo.value = nextPause
            statusInfo.value = nextStatus
            if (res?.status?.result?.reason === 'manual_pause' || res?.trigger?.result?.reason === 'manual_pause') {
                message.value = 'Сценарий сохранён, но находится на паузе'
            }
        } else {
            markSnapshot()
        }
        warnings.value = Array.isArray(res?.warnings) ? res.warnings : []
        if (!message.value) message.value = 'Сценарий сохранён'
        emit('saved', state.id)
    } catch (err) {
        if (err.status === 400 && Array.isArray(err.data?.errors)) {
            validationErrors.value = err.data.errors
        } else if (err.status === 409) {
            conflict.value = err.data || { message: 'Конфликт сценариев' }
        } else {
            message.value = err.message || 'Ошибка сохранения'
        }
    } finally {
        saving.value = false
    }
}

async function handleRun() {
    if (!state.id) {
        message.value = 'Сценарий ещё не сохранён'
        return
    }
    if (state.disabled) {
        message.value = 'Сценарий отключен'
        return
    }
    running.value = true
    try {
        const res = await scenariosFetch('/scenario/run', { method: 'POST', body: { id: state.id } })
        if (res?.result) {
            const { active, actionsSent, reason, pause } = res.result
            if (pause) pauseInfo.value = pause
            if (res?.status) statusInfo.value = res.status
            else statusInfo.value = {
                ts: Date.now(),
                origin: 'manual',
                result: res.result
            }
            if (reason === 'manual_pause') {
                message.value = 'Сценарий на паузе'
            } else if (reason === 'presence_guard') {
                message.value = 'Сценарий заблокирован по присутствию'
            } else if (!active) {
                message.value = 'Сценарий сейчас вне временного окна'
            } else {
                pauseInfo.value = null
                message.value = `Команды отправлены: ${actionsSent || 0}`
            }
        } else {
            message.value = 'Запуск выполнен'
        }
    } catch (err) {
        message.value = err.message || 'Ошибка запуска'
    } finally {
        running.value = false
    }
}

async function handleDelete() {
    if (!props.scenarioId) {
        message.value = 'Сценарий ещё не сохранён'
        return
    }
    if (deleting.value) return
    const confirmed = typeof window !== 'undefined'
        ? window.confirm('Удалить сценарий? Действие нельзя отменить.')
        : true
    if (!confirmed) return
    const scenarioId = props.scenarioId
    deleting.value = true
    message.value = ''
    warnings.value = []
    validationErrors.value = []
    conflict.value = null
    try {
        await scenariosFetch('/scenario/delete', { method: 'POST', body: { id: scenarioId } })
        resetState()
        markSnapshot()
        message.value = 'Сценарий удалён'
        emit('deleted', scenarioId)
    } catch (err) {
        message.value = err.message || 'Не удалось удалить сценарий'
    } finally {
        deleting.value = false
    }
}

function handleTargetUpdate(next) {
    const groups = sanitizeIdList(next?.groups)
    const devices = sanitizeIdList(next?.devices)
    state.target.groups = groups
    state.target.devices = devices
}

function handleBrightnessUpdate(next) {
    if (!next || typeof next !== 'object') return
    state.brightness = {
        ...state.brightness,
        ...next,
        manual: { ...state.brightness.manual, ...(next.manual || {}) },
        sensor: { ...state.brightness.sensor, ...(next.sensor || {}) }
    }
}

function handleColorUpdate(next) {
    if (!next || typeof next !== 'object') return
    state.color = {
        ...state.color,
        ...next,
        temperature: { ...state.color.temperature, ...(next.temperature || {}) },
        colors: {
            from: { ...state.color.colors.from, ...(next.colors?.from || {}) },
            to: { ...state.color.colors.to, ...(next.colors?.to || {}) }
        }
    }
}

async function handleTogglePause() {
    if (!state.id) return
    if (state.disabled) {
        message.value = 'Сценарий отключен'
        return
    }
    try {
        const path = isPaused.value ? '/scenario/resume' : '/scenario/pause'
        const res = await scenariosFetch(path, { method: 'POST', body: { id: state.id } })
        if (path === '/scenario/pause') {
            pauseInfo.value = res?.pause || { setAt: Date.now(), reason: { source: 'manual' } }
            if (res?.status && !statusInfo.value) statusInfo.value = res.status
            message.value = 'Сценарий поставлен на паузу'
        } else {
            pauseInfo.value = res?.result?.pause || null
            statusInfo.value = res?.status || (res?.result ? { ts: Date.now(), origin: 'resume', result: res.result } : null)
            if (res?.result?.reason === 'manual_pause') {
                message.value = 'Сценарий по-прежнему на паузе'
            } else if (res?.result?.reason === 'presence_guard') {
                message.value = 'Сценарий заблокирован по присутствию'
            } else if (res?.result?.active) {
                message.value = `Команды отправлены: ${res.result.actionsSent || 0}`
            } else if (res?.result) {
                message.value = 'Сценарий сейчас вне временного окна'
            } else {
                message.value = 'Пауза снята'
            }
        }
    } catch (err) {
        message.value = err?.message || 'Не удалось изменить паузу'
    }
}

function toggleDisabled() {
    state.disabled = !state.disabled
    if (state.disabled) {
        pauseInfo.value = null
        message.value = 'Сценарий выключен'
    } else {
        message.value = 'Сценарий включен'
    }
}

function handleTimeUpdate(next) {
    if (!next || typeof next !== 'object') return
    const mergedDays = Array.isArray(next.days) ? next.days : state.time.days
    const days = Array.isArray(mergedDays)
        ? mergedDays
            .map((d) => Number(d))
            .filter((d) => Number.isFinite(d) && d >= 1 && d <= 7)
            .sort((a, b) => a - b)
        : state.time.days
    state.time = {
        tz: next.tz ?? state.time.tz,
        lat: next.lat ?? state.time.lat,
        lon: next.lon ?? state.time.lon,
        start: next.start ? normalizeScenarioTimeBlock(next.start, state.time.start?.time || '18:00') : state.time.start,
        end: next.end ? normalizeScenarioTimeBlock(next.end, state.time.end?.time || '23:00') : state.time.end,
        days: days.length ? days : state.time.days
    }
}

onMounted(async () => {
    await loadConfig()
    await loadCatalog(true)
    ready.value = true
    if (props.scenarioId) {
        await loadScenario(props.scenarioId)
    } else {
        resetState()
        const defaultSlug = slugify(state.name)
        setScenarioId(defaultSlug ? (defaultSlug.startsWith('scn_') ? defaultSlug : `scn_${defaultSlug}`) : fallbackId.value)
        markSnapshot()
    }
})
</script>

<template>
    <main class="editor">
        <section v-if="loadError" class="alert alert--error alert--standalone">
            <h1>Сценарий не найден</h1>
            <p>Запрошенный сценарий с идентификатором <code>{{ loadError.id }}</code> не существует.</p>
            <div class="actions actions--inline">
                <RouterLink class="btn secondary" :to="{ name: 'scenarios-list' }">К списку сценариев</RouterLink>
                <RouterLink class="btn primary" :to="{ name: 'scenario-create' }">Создать новый</RouterLink>
            </div>
        </section>
        <template v-else>
            <header class="editor__header">
                <div class="editor__head">
                    <div>
                        <h1>Сценарий</h1>
                        <p class="editor__meta">
                            <span>{{ state.id }}</span>
                            <span v-if="isDirty" class="badge badge--dirty">Черновик</span>
                            <span v-if="loadingScenario" class="badge badge--loading">Загрузка…</span>
                            <span v-if="isDisabled" class="badge badge--disabled">Отключен</span>
                        </p>
                    </div>
                    <div v-if="state.id" class="editor__head-actions">
                        <button type="button" class="btn secondary" @click="toggleDisabled">
                            <span v-if="isDisabled">Включить</span>
                            <span v-else>Выключить</span>
                        </button>
                        <button type="button" class="btn pause" @click="handleTogglePause" :disabled="isDisabled">
                            <span v-if="isPaused">▶ Возобновить</span>
                            <span v-else>⏸ Пауза</span>
                        </button>
                    </div>
                </div>
                <div class="editor__summary">
                    <input v-model="state.name" placeholder="Название сценария" />
                </div>
                <p v-if="isPaused && pauseInfo" class="pause-info">
                    {{ pauseInfo.until ? `На паузе до ${new Date(pauseInfo.until).toLocaleTimeString('ru-RU', {
                        hour:
                            '2-digit', minute: '2-digit'
                    })}` : 'На паузе' }}
                </p>
            </header>

            <section v-if="statusInfo" class="status-block">
                <header class="status-block__header">
                    <h2>Статус сценария</h2>
                    <small>{{ formatTimestamp(statusInfo.ts) }}<span v-if="statusInfo.origin"> · {{ statusInfo.origin
                    }}</span></small>
                </header>
                <p v-if="statusInfo.result">
                    <strong>{{ statusReasonText(statusInfo.result) }}</strong>
                    <span v-if="statusInfo.result.active"> · Команды: {{ statusInfo.result.actionsSent || 0 }}</span>
                </p>
                <p v-else-if="statusInfo.error"><strong>Ошибка:</strong> {{ statusInfo.error.message || statusInfo.error
                }}
                </p>
                <p v-if="statusInfo.result?.pause"><strong>Пауза до:</strong> {{
                    formatTimestamp(statusInfo.result.pause.until) }}</p>
                <p v-if="statusInfo.result?.presence"><strong>Presence:</strong> {{
                    formatPresenceState(statusInfo.result.presence) }}</p>
                <details v-if="debugPreview">
                    <summary>Журнал ({{ statusInfo.result?.debug?.length || 0 }})</summary>
                    <pre>{{ debugPreview }}</pre>
                </details>
            </section>

            <section class="stack">
                <ScenarioDevicesSection :model-value="state.target" :sections="targetSections"
                    :loading="catalogLoading" :error="catalogError"
                    :show-selected-only="Boolean((state.id || props.scenarioId) && (state.target.groups.length || state.target.devices.length))"
                    @update:model-value="handleTargetUpdate" />

                <ScenarioMappingSection :model-value="state.brightness" :sensor-options="sensorOptions"
                    :support="brightnessSupport" :runtime="brightnessRuntime"
                    @update:model-value="handleBrightnessUpdate" />

                <ColorRamp :model-value="state.color" :support="colorSupport" :runtime="colorRuntime"
                    @update:model-value="handleColorUpdate" />

                <section class="presence-block">
                    <header class="presence-block__header">
                        <div>
                            <h2>Присутствие</h2>
                            <p class="presence-block__hint">Ограничьте выполнение сценария состоянием «кто-то дома» из
                                Wi‑Fi мониторинга.</p>
                        </div>
                    </header>
                    <PresenceOptions
                        v-model="state.presence.mode"
                        :choices="presenceChoices"
                        name="presence-mode"
                    />
                </section>

                <ScenarioTimeSection :model-value="state.time" @update:model-value="handleTimeUpdate" />
            </section>

            <footer class="actions">
                <button type="button" class="btn primary" :disabled="saving || loadingScenario"
                    @click="handleSave">
                    <span v-if="saving">Сохранение…</span>
                    <span v-else>Сохранить</span>
                </button>
                <button type="button" class="btn secondary" :disabled="running || !state.id || isDisabled"
                    @click="handleRun">
                    <span v-if="running">Применение…</span>
                    <span v-else>Применить сейчас</span>
                </button>
                <button type="button" class="btn danger" :disabled="deleting || !props.scenarioId || loadingScenario"
                    @click="handleDelete">
                    <span v-if="deleting">Удаление…</span>
                    <span v-else>Удалить</span>
                </button>
            </footer>

            <section class="log">
                <div v-if="validationErrors.length" class="alert alert--error">
                    <strong>Ошибки:</strong>
                    <ul>
                        <li v-for="err in validationErrors" :key="err">{{ err }}</li>
                    </ul>
                </div>
                <div v-if="conflict" class="alert alert--warn">
                    <strong>Конфликт сценариев</strong>
                    <p>{{ conflict.message || conflict.error || 'Сценарий пересекается с другим' }}</p>
                    <p v-if="conflict.details?.scenarioId">ID: {{ conflict.details.scenarioId }}</p>
                    <p v-if="Array.isArray(conflict.details?.types)">Типы: {{ conflict.details.types.join(', ') }}</p>
                </div>
                <div v-if="warnings.length" class="alert alert--info">
                    <strong>Предупреждения:</strong>
                    <ul>
                        <li v-for="warn in warnings" :key="warn">{{ warn }}</li>
                    </ul>
                </div>
                <p v-if="message" class="muted">{{ message }}</p>
            </section>
        </template>
    </main>
</template>

<style scoped>
.editor {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 0 24px 40px;
    color: #f9fafb;
}

.editor__header {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.editor__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.editor__head-actions {
    display: flex;
    gap: 10px;
}

.editor__header h1 {
    margin: 0;
    font-size: 24px;
}

.editor__meta {
    display: flex;
    gap: 10px;
    align-items: center;
    font-size: 13px;
    color: #cbd5f5;
    margin: 0;
}

.badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
}

.badge--dirty {
    background: rgba(251, 191, 36, 0.18);
    color: #fbbf24;
}

.badge--loading {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
}

.badge--disabled {
    background: rgba(148, 163, 184, 0.25);
    color: #cbd5f5;
}

.btn.pause {
    background: rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 12px;
    padding: 8px 14px;
    font-size: 13px;
    color: #e2e8f0;
    cursor: pointer;
    transition: background .15s, transform .1s;
}

.btn.pause:hover {
    background: rgba(59, 130, 246, 0.35);
    transform: translateY(-1px);
}

.pause-info {
    margin: 0;
    font-size: 13px;
    color: #fbbf24;
}

.status-block {
    background: rgba(15, 23, 42, 0.35);
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.status-block__header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
}

.status-block__header h2 {
    margin: 0;
    font-size: 18px;
}

.status-block__header small {
    color: #cbd5f5;
}

.status-block details {
    background: rgba(30, 41, 59, 0.4);
    border-radius: 12px;
    padding: 8px 12px;
}

.status-block pre {
    max-height: 220px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.45;
}

.editor__summary input {
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid #4b5563;
    background: rgba(17, 24, 39, 0.75);
    color: #f9fafb;
    font-size: 16px;
    transition: border-color 0.15s, box-shadow 0.15s;
}

.editor__summary input:focus {
    outline: none;
    border-color: #60a5fa;
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
}

.stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.presence-block {
    background: rgba(17, 24, 39, 0.7);
    border-radius: 16px;
    border: 1px solid rgba(55, 65, 81, 0.6);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.presence-block__header h2 {
    margin: 0;
    font-size: 18px;
    color: #e5e7eb;
}

.presence-block__hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: #94a3b8;
}

.presence-block :deep(.presence-options) {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.presence-block :deep(.presence-option) {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(59, 130, 246, 0.14);
    background: rgba(17, 24, 39, 0.55);
    color: #e2e8f0;
    cursor: pointer;
}

.presence-block :deep(.presence-option.active) {
    border-color: rgba(96, 165, 250, 0.5);
    background: rgba(37, 99, 235, 0.35);
    box-shadow: 0 8px 18px rgba(37, 99, 235, 0.26);
}

.presence-block :deep(.presence-option input) {
    margin: 0;
}

.presence-block :deep(.presence-option span) {
    font-size: 14px;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.btn {
    padding: 10px 20px;
    border-radius: 12px;
    border: 1px solid transparent;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}

.btn.primary {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(124, 58, 237, 0.9));
    border-color: rgba(59, 130, 246, 0.6);
    color: #fff;
}

.btn.secondary {
    background: rgba(55, 65, 81, 0.8);
    border-color: rgba(96, 165, 250, 0.4);
    color: #e5e7eb;
}

.btn.danger {
    background: rgba(239, 68, 68, 0.85);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fee2e2;
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.log {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.alert {
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid transparent;
    font-size: 13px;
    line-height: 1.4;
}

.alert--standalone {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px;
}

.alert--standalone h1 {
    margin: 0;
    font-size: 26px;
}

.alert--standalone code {
    background: rgba(15, 23, 42, 0.65);
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 14px;
    color: #bae6fd;
}

.actions--inline {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.alert--error {
    background: rgba(248, 113, 113, 0.12);
    border-color: rgba(248, 113, 113, 0.4);
    color: #fecaca;
}

.alert--warn {
    background: rgba(251, 191, 36, 0.12);
    border-color: rgba(251, 191, 36, 0.4);
    color: #fcd34d;
}

.alert--info {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.4);
    color: #bfdbfe;
}

.muted {
    font-size: 13px;
    color: #94a3b8;
}

@media (max-width: 680px) {
    .editor {
        padding: 0 16px 32px;
    }

    .presence-block__options {
        flex-direction: column;
    }

    .presence-option {
        flex: 1 1 auto;
    }
}
</style>
