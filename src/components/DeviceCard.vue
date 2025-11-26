<script setup>
import { computed, ref, watch } from 'vue'
import { trackYandexCall } from '../lib/requestMetrics'
import { ensureApiBase } from '../utils/apiBase'
import { getConfig } from '../lib/api'

const props = defineProps({
    device: { type: Object, required: true },
    entityType: { type: String, default: 'device' }
})

const entityType = computed(() => props.entityType || props.device?.entityType || 'device')
const isGroup = computed(() => entityType.value === 'group')

const entityKind = computed(() => {
    const typeHint = String(props.device?.type || props.device?.deviceType || props.device?.kind || props.device?.icon || '')
        .toLowerCase()
    if (typeHint.includes('sensor') || typeHint.includes('illumination')) return 'sensor'
    if (typeHint.includes('speaker') || typeHint.includes('media_device')) return 'speaker'
    if (typeHint.includes('switch')) return 'switch'
    if (typeHint.includes('humidifier')) return 'humidifier'
    if (typeHint.includes('light') || typeHint.includes('lamp') || typeHint.includes('bulb')) return 'light'
    return 'default'
})

const hasMotionProperty = computed(() => {
    const propsArr = props.device?.properties || []
    return propsArr.some(prop => prop?.parameters?.instance === 'motion')
})

const sensorEmoji = computed(() => (hasMotionProperty.value ? '🚶' : '📟'))

const capType = (cap) => (cap ? (typeof cap === 'string' ? cap : cap.type || '') : '')

const instanceLabelMap = {
    battery_level: 'Battery',
    brightness: 'Brightness',
    co2: 'CO2',
    color_temperature: 'Color Temp',
    humidity: 'Humidity',
    illumination: 'Illumination',
    motion: 'Motion',
    pm10: 'PM10',
    pm2_5: 'PM2.5',
    pressure: 'Pressure',
    temperature: 'Temperature',
    temperature_k: 'Color Temp',
    voltage: 'Voltage',
    volume: 'Volume',
    water_level: 'Water Level'
}

const toTitle = (value) => value
    ? value.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : ''

const labelForInstance = (instance) => {
    if (!instance) return ''
    return instanceLabelMap[instance] || toTitle(instance)
}

const normalizeUnit = (unit) => (unit || '')
    .replace(/^unit[._]/, '')
    .toLowerCase()

const clamp255 = (value) => Math.max(0, Math.min(255, Math.round(value ?? 0)))

const rgbToHex = (r, g, b) => {
    const convert = (num) => clamp255(num).toString(16).padStart(2, '0').toUpperCase()
    return `#${convert(r)}${convert(g)}${convert(b)}`
}

const hsvToHex = (h, s, v) => {
    if (typeof h !== 'number' || typeof s !== 'number' || typeof v !== 'number') return ''
    const hue = ((h % 360) + 360) % 360
    const sat = s > 1 ? s / 100 : s
    const val = v > 1 ? v / 100 : v
    const c = val * sat
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1))
    const m = val - c
    let rp = 0
    let gp = 0
    let bp = 0

    if (hue < 60) {
        rp = c; gp = x; bp = 0
    } else if (hue < 120) {
        rp = x; gp = c; bp = 0
    } else if (hue < 180) {
        rp = 0; gp = c; bp = x
    } else if (hue < 240) {
        rp = 0; gp = x; bp = c
    } else if (hue < 300) {
        rp = x; gp = 0; bp = c
    } else {
        rp = c; gp = 0; bp = x
    }

    const r = (rp + m) * 255
    const g = (gp + m) * 255
    const b = (bp + m) * 255
    return rgbToHex(r, g, b)
}

const kelvinToHex = (kelvin) => {
    if (typeof kelvin !== 'number' || !Number.isFinite(kelvin)) return ''
    const temp = Math.max(1000, Math.min(40000, kelvin)) / 100
    let red = 0
    let green = 0
    let blue = 0
    if (temp <= 66) {
        red = 255
        green = clamp255(99.4708025861 * Math.log(temp) - 161.1195681661)
        blue = temp <= 19 ? 0 : clamp255(138.5177312231 * Math.log(temp - 10) - 305.0447927307)
    } else {
        red = clamp255(329.698727446 * Math.pow(temp - 60, -0.1332047592))
        green = clamp255(288.1221695283 * Math.pow(temp - 60, -0.0755148492))
        blue = 255
    }
    return rgbToHex(red, green, blue)
}

const getBrightnessFromCaps = (caps = []) => {
    for (const cap of caps) {
        const type = capType(cap)
        if (!type.includes('range')) continue
        const instance = cap?.state?.instance || cap?.parameters?.instance
        if (instance !== 'brightness') continue
        const value = cap?.state?.value
        if (typeof value === 'number') {
            return Math.round(Math.max(0, Math.min(100, value)))
        }
    }
    return null
}

const formatNumericValue = (value, instance, unit) => {
    if (typeof value !== 'number') return ''
    const rounded = Math.round(value)
    const normUnit = normalizeUnit(unit)
    if (normUnit === 'celsius') return `${rounded}°C`
    if (normUnit === 'fahrenheit') return `${rounded}°F`
    if (normUnit === 'kelvin') return `${rounded}K`
    if (normUnit === 'percent' || instance === 'battery_level' || instance === 'humidity' || instance === 'brightness') {
        return `${rounded}%`
    }
    if (normUnit === 'ppm') return `${rounded} ppm`
    if (normUnit === 'lux' || normUnit === 'lx' || instance === 'illumination') return `${rounded} lx`
    if (normUnit === 'watt' || normUnit === 'w') return `${rounded} W`
    if (normUnit === 'watt_hour' || normUnit === 'wh') return `${rounded} Wh`
    if (normUnit === 'volt' || normUnit === 'v' || instance === 'voltage') return `${rounded} V`
    if (normUnit === 'ampere' || normUnit === 'a') return `${rounded} A`
    if (normUnit === 'metre' || normUnit === 'meter' || normUnit === 'm') return `${rounded} m`
    if (instance === 'temperature_k') return `${rounded}K`
    if (instance === 'pressure') return `${rounded} hPa`
    if (instance === 'co2') return `${rounded} ppm`
    if (instance === 'water_level') return `${rounded}%`
    return String(rounded)
}

const formatPropertyValue = (value, { instance, unit } = {}) => {
    if (value == null) return ''
    if (typeof value === 'number') return formatNumericValue(value, instance, unit)
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    return String(value)
}

const formatColorCapability = (cap) => {
    const state = cap?.state || {}
    const instance = state.instance || cap?.parameters?.instance
    const value = state.value

    if (value == null) return ''

    if (typeof value === 'string') {
        return instance === 'scene'
            ? `Scene: ${toTitle(value)}`
            : `Color: ${toTitle(value)}`
    }

    if (typeof value === 'number') {
        if (instance === 'temperature_k' || instance === 'temperature') {
            return `Color Temp: ${Math.round(value)}K`
        }
        return `Color: ${Math.round(value)}`
    }

    if (typeof value === 'object') {
        if ('temperature_k' in value) {
            return `Color Temp: ${Math.round(value.temperature_k)}K`
        }
        if ('temperature' in value) {
            return `Color Temp: ${Math.round(value.temperature)}K`
        }
        if ('r' in value && 'g' in value && 'b' in value) {
            return `Color: ${rgbToHex(value.r, value.g, value.b)}`
        }
        if ('h' in value && 's' in value && 'v' in value) {
            const hex = hsvToHex(value.h, value.s, value.v)
            return hex ? `Color: ${hex}` : ''
        }
    }

    if (instance === 'scene' && state.value) {
        return `Scene: ${toTitle(String(state.value))}`
    }

    return ''
}

const normalizeHex = (color) => {
    if (!color) return null
    const clean = String(color).trim()
    const normalized = clean.startsWith('#') ? clean.slice(1) : clean
    if (!/^([0-9A-Fa-f]{6})$/.test(normalized)) return null
    return `#${normalized.toUpperCase()}`
}

const extractColorInfo = (caps = []) => {
    const cap = caps.find(c => capType(c).includes('color_setting'))
    if (!cap) return null
    const state = cap.state || {}
    const value = state.value
    if (value == null) return null

    if (typeof value === 'object') {
        if (Number.isFinite(value.temperature_k)) {
            return { type: 'kelvin', value: Math.round(value.temperature_k) }
        }
        if (Number.isFinite(value.temperature)) {
            return { type: 'kelvin', value: Math.round(value.temperature) }
        }
        if (typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number') {
            return { type: 'hex', value: rgbToHex(value.r, value.g, value.b) }
        }
        if (typeof value.h === 'number' && typeof value.s === 'number' && typeof value.v === 'number') {
            const hex = hsvToHex(value.h, value.s, value.v)
            return hex ? { type: 'hex', value: hex } : null
        }
        if (typeof value.int === 'number') {
            const int = value.int
            const r = (int >> 16) & 0xff
            const g = (int >> 8) & 0xff
            const b = int & 0xff
            return { type: 'hex', value: rgbToHex(r, g, b) }
        }
    }
    if (typeof value === 'number') {
        const instance = state.instance || cap.parameters?.instance
        if (instance === 'temperature_k' || instance === 'temperature') {
            return { type: 'kelvin', value: Math.round(value) }
        }
        if (instance === 'rgb' || instance === 'color') {
            const int = Math.round(value)
            const r = (int >> 16) & 0xff
            const g = (int >> 8) & 0xff
            const b = int & 0xff
            return { type: 'hex', value: rgbToHex(r, g, b) }
        }
    }
    if (typeof value === 'string') {
        const hex = normalizeHex(value)
        return hex ? { type: 'hex', value: hex } : null
    }
    return null
}

const sensorIllumination = computed(() => {
    const propsArr = props.device?.properties || []
    const illum = propsArr.find(p => p.parameters?.instance === 'illumination')
    if (illum && typeof illum.state?.value === 'number') {
        return Math.round(illum.state.value)
    }
    return null
})

const illuminationText = computed(() => {
    if (sensorIllumination.value == null) return ''
    return `${sensorIllumination.value} лк`
})

const isSensorDevice = computed(() => entityKind.value === 'sensor' || sensorIllumination.value != null)

const consistentValue = (values) => {
    if (!values.length) return null
    const first = values[0]
    return values.every(value => value === first) ? first : null
}

const memberDevices = computed(() => {
    return Array.isArray(props.device?.memberDevices) ? props.device.memberDevices : []
})

const groupColorInfo = computed(() => {
    if (!isGroup.value) return null
    const colors = memberDevices.value
        .map(member => extractColorInfo(member?.capabilities || []))
        .filter(Boolean)
    if (!colors.length) return null
    const first = colors[0]
    const consistent = colors.every(info => info.type === first.type && info.value === first.value)
    return consistent ? first : null
})

const groupBrightness = computed(() => {
    if (!isGroup.value) return null
    const values = memberDevices.value
        .map(member => getBrightnessFromCaps(member?.capabilities || []))
        .filter(value => typeof value === 'number')
    return consistentValue(values)
})

const groupStatus = computed(() => {
    if (!isGroup.value) return null
    const color = groupColorInfo.value
    const brightness = groupBrightness.value
    if (color?.type === 'kelvin') {
        return brightness != null ? `${color.value}К - ${brightness}%` : `${color.value}К`
    }
    if (color?.type === 'hex') {
        return brightness != null ? `${brightness}%` : ''
    }
    if (brightness != null) {
        return `${brightness}%`
    }
    return null
})

const statusRowText = computed(() => {
    if (isGroup.value) {
        return groupStatus.value || ''
    }
    if (!hasOnOffCap.value && illuminationText.value) {
        return illuminationText.value
    }
    return ''
})

const statusDotColor = computed(() => {
    if (!isGroup.value) return ''
    const color = groupColorInfo.value
    if (!color) return ''
    if (color.type === 'hex') return color.value
    return kelvinToHex(color.value)
})

const showStatusRow = computed(() => {
    if (isGroup.value) {
        return Boolean(groupStatus.value)
    }
    return !hasOnOffCap.value && Boolean(illuminationText.value)
})

const detailItems = computed(() => {
    const items = []
    const seen = new Set()
    const propsArr = props.device?.properties || []
    propsArr.forEach(prop => {
        const instance = prop?.parameters?.instance || prop?.state?.instance
        const value = prop?.state?.value
        const formatted = formatPropertyValue(value, { instance, unit: prop?.parameters?.unit })
        if (formatted) {
            if (
                isSensorDevice.value &&
                (instance === 'battery_level' || instance === 'illumination' || instance === 'motion')
            ) {
                return
            }
            const label = labelForInstance(instance)
            items.push(label ? `${label}: ${formatted}` : formatted)
            if (instance) seen.add(instance)
        }
    })

    const caps = props.device?.capabilities || []
    caps.forEach(cap => {
        const type = capType(cap)
        if (type.includes('on_off')) return

        if (type.includes('range')) {
            const instance = cap?.state?.instance || cap?.parameters?.instance
            const formatted = formatPropertyValue(cap?.state?.value, { instance, unit: cap?.parameters?.unit })
        if (formatted && (!instance || !seen.has(instance))) {
            if (instance === 'brightness') {
                items.push(formatted)
            } else {
                const label = labelForInstance(instance)
                items.push(label ? `${label}: ${formatted}` : formatted)
            }
            if (instance) seen.add(instance)
        }
            return
        }

        if (type.includes('color_setting')) {
            const formatted = formatColorCapability(cap)
            if (formatted) items.push(formatted)
            return
        }

        if (type.includes('mode')) {
            const instance = cap?.state?.instance || cap?.parameters?.instance
            const value = cap?.state?.value
            if (value != null) {
                const label = labelForInstance(instance || 'mode') || 'Mode'
                items.push(`${label}: ${toTitle(String(value))}`)
            }
        }
    })

    return items
})

const detailLine = computed(() => detailItems.value.join(' • '))

const hasOnOffCap = computed(() => (props.device?.capabilities || [])
    .some(c => capType(c).includes('on_off')))

const onCapState = computed(() => {
    const caps = props.device?.capabilities || []
    const onCap = caps.find(c => capType(c).includes('on_off'))
    return onCap?.state?.value === true
})

const localOn = ref(onCapState.value)
const loading = ref(false)
watch(onCapState, v => { localOn.value = v })

// загрузим api (и опционально apiKey) из /config.json
const apiBase = ref('')
const apiKey = ref('')

const looksAbsoluteUrl = (value) => /^https?:\/\//i.test(value || '') || String(value || '').startsWith('//')
const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '')

async function ensureApi() {
    if (apiBase.value) return { api: apiBase.value, key: apiKey.value }
    const cfg = await getConfig()
    let fallbackBase = ''
    try {
        fallbackBase = await ensureApiBase()
    } catch (err) {
        console.warn('[device-card] ensureApiBase failed', err)
    }
    const directApi = typeof cfg.api === 'string' ? cfg.api.trim() : ''
    if (looksAbsoluteUrl(directApi)) {
        apiBase.value = trimTrailingSlash(directApi)
    } else if (fallbackBase) {
        apiBase.value = trimTrailingSlash(fallbackBase)
    } else if (directApi) {
        apiBase.value = trimTrailingSlash(directApi)
    } else {
        apiBase.value = '/api'
    }
    apiKey.value = cfg.apiKey || ''
    return { api: apiBase.value, key: apiKey.value }
}

async function toggleOnOff() {
    if (!hasOnOffCap.value || loading.value) return
    const desired = !localOn.value
    localOn.value = desired
    loading.value = true
    try {
        const { api, key } = await ensureApi()
        const caps = props.device?.capabilities || []
        const onCap = caps.find(c => capType(c).includes('on_off'))
        const onCapType = onCap?.type || 'devices.capabilities.on_off'

        const payload = isGroup.value
            ? {
                op: 'group_actions',
                groupId: props.device.id,
                actions: [
                    {
                        type: onCapType,
                        state: { instance: 'on', value: desired }
                    }
                ]
            }
            : {
                op: 'set_device',
                id: props.device.id,
                on: desired,
                capabilityType: onCapType
            }

        trackYandexCall()
        const res = await fetch(api, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(key ? { 'x-api-key': key } : {})
            },
            body: JSON.stringify(payload)
        })
        const text = await res.text()
        let data = null
        try {
            data = text ? JSON.parse(text) : null
        } catch {
            data = null
        }
        if (!res.ok || (data && data.ok === false)) {
            throw new Error(data?.error || text || `HTTP ${res.status}`)
        }
    } catch (err) {
        console.error('toggle failed', err)
        // откат UI
        localOn.value = !desired
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="card compact">
        <div class="top-row">
            <div v-if="isSensorDevice" class="sensor-emoji" aria-hidden="true">{{ sensorEmoji }}</div>
            <div v-else class="icon" :class="{ 'icon-group': isGroup }" aria-hidden="true">
                <span class="lamp-emoji">💡</span>
                <span v-if="isGroup" class="lamp-emoji lamp-overlay">💡</span>
            </div>
            <div v-if="hasOnOffCap" class="side-control">
                <button class="toggle card-toggle" :class="{ on: localOn, loading: loading }" @click="toggleOnOff"
                    :disabled="loading">
                    <span class="power-symbol" aria-hidden="true">⏻</span>
                </button>
            </div>
        </div>
        <div class="info">
            <div class="title-row">
                <div class="title">{{ device.name || 'Unnamed device' }}</div>
            </div>
            <div v-if="showStatusRow" class="status-row" :class="{ 'has-dot': statusDotColor }">
                <span v-if="statusDotColor" class="status-dot" :style="{ background: statusDotColor }"></span>
                <span class="status-text">{{ statusRowText }}</span>
            </div>
            <div v-if="detailLine" class="details">{{ detailLine }}</div>
        </div>
    </div>
</template>

<style scoped>
.card {
    background: var(--surface-card);
    color: var(--text-primary);
    border: 1px solid rgba(14, 16, 33, 0.8);
    border-radius: 12px;
    padding: 8px 10px;
    min-height: 110px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.card.compact {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.top-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}

.icon {
    width: 48px;
    height: 48px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.sensor-emoji {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    border-radius: 12px;
    border: 1px solid rgba(14, 16, 33, 0.8);
    background: rgba(255, 255, 255, 0.02);
    color: var(--text-primary);
}

.icon-group .lamp-emoji {
    transform: translateX(-6px);
}

.lamp-emoji {
    font-size: 30px;
    line-height: 1;
}

.lamp-overlay {
    position: absolute;
    top: 0;
    left: 0;
    transform: translateX(18px);
}

.main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    min-width: 0;
}

.info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.title-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.title {
    font-weight: 600;
    margin: 0;
    font-size: 13px;
    color: var(--text-primary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.status-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(226, 232, 240, 0.35);
    display: inline-block;
}

.details {
    font-size: 11px;
    color: var(--text-subtle);
    line-height: 1.2;
    min-height: 14px;
    word-break: break-word;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.side-control {
    display: flex;
    align-items: center;
    justify-content: center;
}

.card .card-toggle,
.card-toggle {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: #14243d;
    color: #e2e8f0;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background .15s, border-color .15s, opacity .15s, box-shadow .15s;
    padding: 0;
}

.power-symbol {
    font-size: 14px;
    color: #94a3b8;
    transition: color .15s;
}

.card-toggle.on {
    background: #0f172a;
    border-color: #a855f7;
    box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.25);
}

.card-toggle.on .power-symbol {
    color: #a855f7;
}

.card-toggle.loading {
    opacity: .7;
    cursor: progress;
}

.card-toggle:disabled {
    opacity: .7;
    pointer-events: none;
}
</style>
