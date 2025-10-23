<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
    device: { type: Object, required: true },
    roomsById: { type: Object, default: () => ({}) },
    entityType: { type: String, default: 'device' }
})

const entityType = computed(() => props.entityType || props.device?.entityType || 'device')
const isGroup = computed(() => entityType.value === 'group')

const roomName = computed(() => {
    if (isGroup.value) return 'Группа'
    return props.roomsById[props.device.room]?.name || '—'
})

const emoji = computed(() => {
    if (isGroup.value) return '👥'
    const t = props.device?.type || ''
    if (!t) return '❓'
    if (t.includes('light')) return '💡'
    if (t.includes('speaker') || t.includes('media_device')) return '🔊'
    if (t.includes('sensor')) return '📟'
    if (t.includes('switch')) return '🔌'
    if (t.includes('humidifier')) return '💧'
    return '📦'
})

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

const statusText = computed(() => {
    const caps = props.device?.capabilities || []
    const propsArr = props.device?.properties || []

    const onCap = caps.find(c => capType(c).includes('on_off'))
    if (onCap && onCap.state) {
        const on = onCap.state.value
        let text = on === true ? 'On' : on === false ? 'Off' : 'Unknown'
        const rangeCap = caps.find(c =>
            capType(c).includes('range') &&
            (c.state?.instance === 'brightness' || c.parameters?.instance === 'brightness')
        )
        const brightness = rangeCap?.state?.value
        if (typeof brightness === 'number') text += ` • ${brightness}%`
        return text
    }

    const motionProp = propsArr.find(p => p.parameters?.instance === 'motion' && p.state?.value)
    if (motionProp) return String(motionProp.state.value)

    const battery = propsArr.find(p => p.parameters?.instance === 'battery_level' && p.state?.value != null)
    if (battery) return `${battery.state.value}%`

    const illum = propsArr.find(p => p.parameters?.instance === 'illumination' && p.state?.value != null)
    if (illum) return `${illum.state.value} lx`

    const temp = propsArr.find(p => p.parameters?.instance === 'temperature' && p.state?.value != null)
    if (temp) return `${temp.state.value}°C`

    return '—'
})

const statusClass = computed(() => {
    const t = statusText.value
    if (t === 'On' || (t.startsWith('On') && t.includes('•'))) return 'status-on'
    if (t === 'Off') return 'status-off'
    if (t === '—' || t === 'Unknown') return 'status-unknown'
    return 'status-neutral'
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
                const label = labelForInstance(instance)
                items.push(label ? `${label}: ${formatted}` : formatted)
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

    if (!items.length && statusText.value && statusText.value !== '—') {
        items.push(statusText.value)
    }

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
async function ensureApi() {
    if (apiBase.value) return { api: apiBase.value, key: apiKey.value }
    const r = await fetch('/config.json')
    const cfg = await r.json()
    apiBase.value = cfg.api || ''
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
                on: desired
            }

        const res = await fetch(api, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(key ? { 'x-api-key': key } : {})
            },
            body: JSON.stringify(payload)
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.ok !== true) throw new Error(data.error || `HTTP ${res.status}`)
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
        <div class="row">
            <div class="emoji" aria-hidden="true">{{ emoji }}</div>
            <div class="main">
                <div class="title-row">
                    <div class="title">{{ device.name || 'Unnamed device' }}</div>
                    <div v-if="roomName && roomName !== '—'" class="room-tag">{{ roomName }}</div>
                </div>
                <div class="details" :class="{ empty: !detailLine }">
                    {{ detailLine || '—' }}
                </div>
            </div>

            <!-- SHOW ON/OFF BUTTON WHEN CAPABLE -->
            <div v-if="hasOnOffCap" class="side-control">
                <button class="toggle" :class="{ on: localOn, loading: loading }" @click="toggleOnOff"
                    :disabled="loading">
                    <span class="dot" aria-hidden="true"></span>
                    <span class="label">{{ localOn ? 'On' : 'Off' }}</span>
                </button>
            </div>

            <!-- status text (kept for other sensors) -->
            <div v-else class="status side-status" :class="statusClass">
                <span class="dot" aria-hidden="true"></span>
                <span class="status-text">{{ statusText }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.card {
    background: #fff;
    border: 1px solid #e6e8eb;
    border-radius: 12px;
    padding: 14px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .04);
}

.card.compact {
    padding: 10px 12px;
    display: flex;
    align-items: stretch;
}

.row {
    display: flex;
    align-items: stretch;
    gap: 12px;
    width: 100%;
}

.emoji {
    font-size: 28px;
    line-height: 1;
    width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
}

.title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.title {
    font-weight: 600;
    margin: 0;
    font-size: 14px;
    color: #111;
}

.room-tag {
    font-size: 11px;
    color: #4b5563;
    background: #f3f4f6;
    border-radius: 999px;
    padding: 2px 8px;
    line-height: 1.4;
}

.details {
    font-size: 12px;
    color: #4b5563;
    line-height: 1.4;
    min-height: 16px;
    word-break: break-word;
}

.details.empty {
    color: #9ca3af;
}

.status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #444;
}

.status .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    background: #ccc;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.03) inset;
}

.status-on .dot {
    background: #16a34a;
}

.status-off .dot {
    background: #9ca3af;
}

.status-unknown .dot {
    background: #f59e0b;
}

.status-neutral .dot {
    background: #6b7280;
}

.side-control,
.side-status {
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
}

.side-control {
    padding-left: 4px;
}

.side-status {
    padding: 0 10px;
}

.toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid #e5e7eb;
    background: #fff;
    cursor: pointer;
    font-size: 13px;
    color: #111;
    transition: background .15s, border-color .15s, opacity .15s, box-shadow .15s;
    height: 100%;
    box-sizing: border-box;
    min-width: 74px;
}

.toggle .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #9ca3af;
    display: inline-block;
}

.toggle.on {
    background: #ecfdf5;
    border-color: #bbf7d0;
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.15);
}

.toggle.on .dot {
    background: #16a34a;
}

.toggle.loading {
    opacity: .7;
    cursor: progress;
}

.toggle:disabled {
    opacity: .7;
    pointer-events: none;
}
</style>
