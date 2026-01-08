<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { trackFunctionCall } from '../lib/requestMetrics'
import { getConfig } from '../lib/api'
import { computeEnvironment } from '../utils/scenarioUtils'
import { hsvToHex, temperatureToHex } from '../utils/colorUtils'
import { cacheScenarioUpdate, seedScenarioCacheFromList } from '../lib/scenarioCache'
import { summarizeStatusRecord, deriveScenarioListStatus } from '../utils/scenarioStatusDisplay'
import { setDocumentDescription, setDocumentTitle, SCENARIOS_TITLE } from '../utils/pageTitle'
import DialFace from '../components/dial/DialFace.vue'

const router = useRouter()
const cfg = ref({ base: '', keyHeader: 'x-api-key', keyValue: '' })
const loading = ref(true)
const error = ref('')
const scenarios = ref([])
const toggling = ref({})
const catalogGroups = ref([])
const nowTick = ref(Date.now())
let nowTimer = null
const hoveredScenarioId = ref(null)
const pinnedScenarioId = ref(null)
const orbitDialEl = ref(null)
const conflictPopupEl = ref(null)
const MINUTES_PER_DAY = 1440
const FULL_CIRCLE_DEG = 360
const DIAL_CENTER = 100
const DIAL_VIEWBOX_RADIUS = DIAL_CENTER
const DIAL_FACE_BASE_RADIUS = DIAL_VIEWBOX_RADIUS
const DIAL_FACE_SCALE = 0.66
const DIAL_FACE_RADIUS = DIAL_FACE_BASE_RADIUS * DIAL_FACE_SCALE
const DIAL_OUTER_RADIUS = DIAL_VIEWBOX_RADIUS
const DIAL_NEEDLE_INNER = DIAL_FACE_RADIUS
const RING_DEFAULT_WIDTH = 14
const RING_DEFAULT_GAP = 8
const RING_MIN_WIDTH = 6
const RING_MIN_GAP = 3
const RING_MIN_AVAILABLE = RING_MIN_WIDTH
const RING_INNER_GAP = 4
const RING_OUTER_PADDING = 4
const GROUP_LABEL_MIN_DEG = 18
const GROUP_LABEL_MAX_DEG = 70
const GROUP_LABEL_DEG_PER_CHAR = 4.2
const GROUP_LABEL_OFFSET_PX = 8
const UNGROUPED_ID = 'ungrouped'
const CONFLICT_POPUP_MARGIN = 8
const CONFLICT_POPUP_OFFSET = 12

setDocumentTitle(SCENARIOS_TITLE)
setDocumentDescription('Список сценариев ExtraHub: создавайте, редактируйте, ставьте на паузу и отслеживайте статус умного света.')

function normalizeBase(raw = '') {
    return raw.replace(/\/+$/, '')
}

async function loadConfig() {
    try {
        const raw = await getConfig()
        const apiBase =
            raw.api ||
            raw.apiBase ||
            raw.scenariosUrl ||
            raw.scenariosURL ||
            raw.scenarioUrl ||
            raw.scenariosBase ||
            ''
        cfg.value.base = normalizeBase(apiBase)
        cfg.value.keyHeader = raw.keyHeader || raw['x-api-key-header'] || 'x-api-key'
        cfg.value.keyValue = raw.keyValue || raw.apiKey || raw['x-api-key'] || ''
    } catch (err) {
        error.value = `Не удалось загрузить config: ${err}`
    }
}

async function scenariosRequest(path, options = {}) {
    if (!cfg.value.base) throw new Error('scenarios URL not configured')
    const headers = { ...(options.headers || {}) }
    if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json'
    if (cfg.value.keyValue) headers[cfg.value.keyHeader || 'x-api-key'] = cfg.value.keyValue
    trackFunctionCall()
    const res = await fetch(`${cfg.value.base}${path}`, {
        ...options,
        headers,
        credentials: options.credentials ?? 'include',
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
    const text = await res.text()
    let json
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    if (!res.ok) {
        throw new Error(json?.error || text || res.statusText || 'Request failed')
    }
    return json
}

async function loadScenarios() {
    if (!cfg.value.base) {
        scenarios.value = []
        loading.value = false
        return
    }
    loading.value = true
    error.value = ''
    try {
        const data = await scenariosRequest('/list?full=1')
        if (Array.isArray(data?.scenarios)) {
            seedScenarioCacheFromList(data.scenarios)
            scenarios.value = data.scenarios.map((entry) => {
                const key = String(entry?.key || '').trim()
                const cleanedId = key.replace(/^scenarios\//, '').replace(/\.json$/i, '')
                const id = String(entry?.id || cleanedId || '').trim()
                const name = String(entry?.name || cleanedId || id || '').trim() || 'Без имени'
                if (entry?.scenario) {
                    const meta = entry?.lastModified != null || entry?.etag
                        ? { lastModified: entry.lastModified, etag: entry?.etag || null }
                        : null
                    cacheScenarioUpdate(entry.scenario, meta)
                }
                return {
                    id,
                    name,
                    key,
                    size: Number(entry?.size) || 0,
                    lastModified: entry?.lastModified || '',
                    etag: entry?.etag || '',
                    pause: entry?.pause || null,
                    status: summarizeStatusRecord(entry?.status || null),
                    type: entry?.type || null,
                    disabled: entry?.disabled === true,
                    time: entry?.time || entry?.scenario?.time || null,
                    actions: Array.isArray(entry?.actions)
                        ? entry.actions
                        : Array.isArray(entry?.scenario?.actions)
                            ? entry.scenario.actions
                            : [],
                    overlaps: Array.isArray(entry?.overlaps) ? entry.overlaps : [],
                    targetGroups: Array.isArray(entry?.scenario?.target?.groups)
                        ? entry.scenario.target.groups.map((groupId) => String(groupId))
                        : []
                }
            })
        } else if (data?.ok === false && data?.error) {
            scenarios.value = []
            error.value = data.error
        } else {
            scenarios.value = []
            error.value = 'Не удалось получить список сценариев'
        }
    } catch (err) {
        error.value = `Не удалось загрузить сценарии: ${err}`
        scenarios.value = []
    } finally {
        loading.value = false
    }
}

async function loadCatalogGroups() {
    if (!cfg.value.base) return
    try {
        const data = await scenariosRequest('/catalog')
        catalogGroups.value = Array.isArray(data?.groups) ? data.groups : []
    } catch (err) {
        catalogGroups.value = []
    }
}

const sortedScenarios = computed(() => {
    return [...scenarios.value].sort((a, b) => {
        if (a.disabled !== b.disabled) return a.disabled ? 1 : -1
        return a.name.localeCompare(b.name)
    })
})

const hasScenarios = computed(() => sortedScenarios.value.length > 0)

const currentDialMinute = computed(() => {
    const date = new Date(nowTick.value)
    return date.getHours() * 60 + date.getMinutes()
})

const environment = computed(() => {
    const baseTime = sortedScenarios.value.find((item) => item?.time)?.time || {}
    return computeEnvironment({ time: baseTime })
})

const activeScenarioId = computed(() => pinnedScenarioId.value || hoveredScenarioId.value)
const scenarioNameById = computed(() => {
    const map = new Map()
    sortedScenarios.value.forEach((item) => {
        if (item?.id) map.set(String(item.id), item.name || item.id)
    })
    return map
})
const activeScenario = computed(() =>
    sortedScenarios.value.find((item) => scenarioKey(item) === activeScenarioId.value) || null
)
const activeGroupId = computed(() => {
    if (!activeScenarioId.value) return null
    for (const group of groupRings.value) {
        if (group.scenarios.some((entry) => entry.scenarioId === activeScenarioId.value)) {
            return group.id
        }
    }
    return null
})
const conflictStroke = '#00000022'
const conflictPopup = ref(null)
const conflictPopupStyle = ref({})
const groupNameById = computed(() => {
    const map = new Map()
    catalogGroups.value.forEach((group) => {
        if (!group?.id) return
        const name = String(group?.name || group?.title || group?.label || group?.id || '').trim()
        map.set(String(group.id), name || String(group.id))
    })
    return map
})

function scenarioKey(item) {
    return String(item?.id || item?.key || item?.name || 'unknown')
}

function scenarioLinkLocation(item) {
    if (!item || !item.id) return null
    if (item.type === 'auto-light-v1') {
        return { name: 'auto-light-edit', params: { id: item.id } }
    }
    return { name: 'scenario-edit', params: { id: item.id } }
}

function scenarioLinkHref(item) {
    const location = scenarioLinkLocation(item)
    if (!location) return '#'
    const resolved = router.resolve(location)
    if (resolved?.href) return resolved.href
    return resolved?.fullPath || '#'
}

function openScenario(item) {
    const location = scenarioLinkLocation(item)
    if (!location) return
    router.push(location)
}

function openScenarioInNewTab(item) {
    const href = scenarioLinkHref(item)
    if (!href || href === '#') return
    window.open(href, '_blank', 'noopener')
}

function handleCardClick(item, event) {
    if (!event || event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    openScenario(item)
}

function handleCardAuxClick(item, event) {
    if (event?.button === 1) {
        event.preventDefault()
        openScenarioInNewTab(item)
    }
}

function handleCardEnter(item) {
    openScenario(item)
}

function createScenario() {
    router.push({ name: 'scenario-create' })
}

function isPaused(item) {
    return !!item?.pause
}

function canTogglePause(item) {
    const kind = scenarioStatusDisplay(item).kind
    return kind === 'running' || kind === 'paused'
}

async function togglePause(item) {
    if (!item?.id || toggling.value[item.id]) return
    if (item?.disabled) {
        error.value = 'Сценарий отключен — включите его, чтобы управлять паузой'
        return
    }
    if (item?.disabled) return
    toggling.value = { ...toggling.value, [item.id]: true }
    try {
        if (isPaused(item)) {
            const res = await scenariosRequest('/scenario/resume', { method: 'POST', body: { id: item.id } })
            item.pause = res?.result?.pause || null
            if (res?.status) item.status = summarizeStatusRecord(res.status)
        } else {
            const res = await scenariosRequest('/scenario/pause', { method: 'POST', body: { id: item.id } })
            item.pause = res?.pause || { setAt: Date.now(), reason: { source: 'manual' } }
            if (res?.status) item.status = summarizeStatusRecord(res.status)
        }
    } catch (err) {
        error.value = String(err)
    } finally {
        toggling.value = { ...toggling.value, [item.id]: false }
    }
}

onMounted(async () => {
    await loadConfig()
    await Promise.all([loadScenarios(), loadCatalogGroups()])
    if (typeof window !== 'undefined') {
        nowTimer = window.setInterval(() => {
            nowTick.value = Date.now()
        }, 30000)
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('pointerdown', handleGlobalPointerDown)
    }
})

onUnmounted(() => {
    if (nowTimer) {
        clearInterval(nowTimer)
        nowTimer = null
    }
    if (typeof document !== 'undefined') {
        document.removeEventListener('pointerdown', handleGlobalPointerDown)
    }
})

function scenarioStatusDisplay(item) {
    return deriveScenarioListStatus(item, nowTick.value)
}

const TYPE_LABELS = {
    'light.brightness': 'Наложение по яркости',
    'light.color.cct': 'Наложение по цвету',
    'light.color.hsv': 'Наложение по цвету'
}

const timeFormatterCache = new Map()

function getTimeFormatter(tz) {
    const key = tz || 'local'
    if (timeFormatterCache.has(key)) return timeFormatterCache.get(key)
    const opts = {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }
    if (tz) opts.timeZone = tz
    const fmt = new Intl.DateTimeFormat('ru-RU', opts)
    timeFormatterCache.set(key, fmt)
    return fmt
}

function minutesFromTimestamp(ts, tz) {
    const date = ts != null ? new Date(ts) : null
    if (!date || Number.isNaN(date.getTime())) return null
    const parts = getTimeFormatter(tz).formatToParts(date)
    const hours = Number(parts.find((p) => p.type === 'hour')?.value)
    const minutes = Number(parts.find((p) => p.type === 'minute')?.value)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
    return ((hours * 60 + minutes) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

function formatOverlapWindow(window, tz) {
    if (!window?.start || !window?.end) return ''
    const fmt = getTimeFormatter(tz)
    return `${fmt.format(new Date(window.start))}–${fmt.format(new Date(window.end))}`
}

function formatOverlapTypes(overlap) {
    const list = Array.isArray(overlap?.types) ? overlap.types : []
    return list.map((type) => TYPE_LABELS[type] || 'Наложение').filter(Boolean).join(', ')
}

function formatConflictLabel(overlap) {
    const types = Array.isArray(overlap?.types) ? overlap.types : []
    if (types.includes('light.brightness')) return 'Наложение по яркости'
    if (types.includes('light.color.cct')) return 'Наложение по температуре'
    if (types.includes('light.color.hsv')) return 'Наложение по цвету'
    return 'Наложение'
}

function formatOverlapTitle(overlap) {
    const name = scenarioNameById.value.get(String(overlap?.scenarioId || '')) || overlap?.scenarioId || 'Сценарий'
    return name
}

function scenarioStartMinutes(item) {
    const env = computeEnvironment(item?.time || {})
    return boundaryToMinutes(item?.time?.start, env, 18 * 60)
}

function parseClockMinutes(value) {
    if (typeof value !== 'string') return null
    const [hh, mm] = value.split(':').map((part) => Number(part))
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
    return ((hh * 60 + mm) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

function boundaryToMinutes(boundary, env, fallbackMinutes) {
    if (!boundary || typeof boundary !== 'object') return fallbackMinutes
    if (boundary.type === 'clock' || boundary.time) {
        const parsed = parseClockMinutes(boundary.time)
        return parsed != null ? parsed : fallbackMinutes
    }
    if (boundary.type === 'sun' || boundary.anchor === 'sunrise' || boundary.anchor === 'sunset') {
        const anchor = boundary.anchor || (boundary.type === 'sunrise' ? 'sunrise' : 'sunset')
        const base = anchor === 'sunrise' ? env.sunriseMin : env.sunsetMin
        const offset = Number.isFinite(boundary.offsetMin) ? boundary.offsetMin : Number(boundary.offset) || 0
        return ((base + offset) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
    }
    if (boundary.type === 'sunrise' || boundary.type === 'sunset') {
        const base = boundary.type === 'sunrise' ? env.sunriseMin : env.sunsetMin
        const offset = Number.isFinite(boundary.offsetMin) ? boundary.offsetMin : Number(boundary.offset) || 0
        return ((base + offset) % MINUTES_PER_DAY + MINUTES_PER_DAY) % MINUTES_PER_DAY
    }
    return fallbackMinutes
}

function minutesToAngle(minute) {
    const normalized = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    return (normalized / MINUTES_PER_DAY) * FULL_CIRCLE_DEG + 90
}

function currentNeedleCoords() {
    const angle = minutesToAngle(currentDialMinute.value)
    const start = angleToPoint(angle, DIAL_NEEDLE_INNER)
    const end = angleToPoint(angle, DIAL_OUTER_RADIUS)
    return { start, end }
}

function angleToPoint(angle, radius = DIAL_OUTER_RADIUS) {
    const rad = (angle * Math.PI) / 180
    return {
        x: DIAL_CENTER + radius * Math.cos(rad),
        y: DIAL_CENTER + radius * Math.sin(rad)
    }
}

function describeArcPath(radius, startAngle, endAngle) {
    const start = angleToPoint(startAngle, radius)
    const end = angleToPoint(endAngle, radius)
    const sweep = ((endAngle - startAngle + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG) || FULL_CIRCLE_DEG
    const largeArc = sweep > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

function pickScenarioColors(item) {
    if (item?.disabled) {
        return { start: '#64748b', end: '#94a3b8' }
    }
    const actions = Array.isArray(item?.actions) ? item.actions : []
    const cct = actions.find((action) => action?.type === 'light.color.cct')
    if (cct?.source?.fromK != null || cct?.source?.toK != null) {
        const fromK = Number.isFinite(cct.source.fromK) ? cct.source.fromK : 2700
        const toK = Number.isFinite(cct.source.toK) ? cct.source.toK : fromK
        return { start: temperatureToHex(fromK), end: temperatureToHex(toK) }
    }
    const hsv = actions.find((action) => action?.type === 'light.color.hsv')
    if (hsv?.source?.from || hsv?.source?.to) {
        const fromHex = hsv.source?.from ? hsvToHex(hsv.source.from) : '#cbd5f5'
        const toHex = hsv.source?.to ? hsvToHex(hsv.source.to) : fromHex
        return { start: fromHex, end: toHex }
    }
    return { start: '#94a3b8', end: '#64748b' }
}

function scenarioDialGradientId(item) {
    const safe = scenarioKey(item).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
    return `scenario-mini-${safe || 'unknown'}`
}

function buildOverlapSegments(item, radius, width) {
    const overlaps = Array.isArray(item?.overlaps) ? item.overlaps : []
    if (!overlaps.length) return []
    const tz = item?.time?.tz
    const strokeWidth = Math.max(3, width * 0.7)
    const minSpanMinutes = 6
    const segments = []
    overlaps.forEach((overlap) => {
        const windows = Array.isArray(overlap?.windows) ? overlap.windows : []
        windows.forEach((window) => {
            const startMin = minutesFromTimestamp(window.start, tz)
            const endMin = minutesFromTimestamp(window.end, tz)
            if (startMin == null || endMin == null) return
            const spanMinutes = Math.max(1, Math.round((window.end - window.start) / 60000))
            if (spanMinutes >= MINUTES_PER_DAY - 1) {
                segments.push({
                    kind: 'circle',
                    radius,
                    width: strokeWidth,
                    overlap,
                    window,
                    tz
                })
                return
            }
            const adjustedEnd = startMin + Math.max(spanMinutes, minSpanMinutes)
            const startAngle = minutesToAngle(startMin)
            const endAngle = minutesToAngle(adjustedEnd)
            segments.push({
                kind: 'path',
                path: describeArcPath(radius, startAngle, endAngle),
                width: strokeWidth,
                overlap,
                window,
                tz
            })
        })
    })
    return segments
}

const groupCount = computed(() => {
    const ids = new Set()
    sortedScenarios.value.forEach((item) => {
        const groupIds = Array.isArray(item?.targetGroups) ? item.targetGroups : []
        if (!groupIds.length) {
            ids.add(UNGROUPED_ID)
            return
        }
        groupIds.forEach((groupId) => ids.add(String(groupId)))
    })
    return ids.size
})

const groupRingLayout = computed(() => {
    const count = groupCount.value
    const defaultWidth = RING_DEFAULT_WIDTH
    const defaultGap = RING_DEFAULT_GAP
    if (!count) {
        const baseRadius = DIAL_FACE_RADIUS + RING_INNER_GAP + defaultWidth / 2
        return { baseRadius, width: defaultWidth, gap: defaultGap }
    }
    const spanBase = defaultWidth + Math.max(0, count - 1) * (defaultWidth + defaultGap)
    const maxSpan =
        DIAL_OUTER_RADIUS - RING_OUTER_PADDING - (DIAL_FACE_RADIUS + RING_INNER_GAP)
    const scale = spanBase > 0 ? Math.min(1, maxSpan / spanBase) : 1
    const width = Math.max(RING_MIN_WIDTH, defaultWidth * scale)
    let gap = Math.max(RING_MIN_GAP, defaultGap * scale)
    const baseRadius = DIAL_FACE_RADIUS + RING_INNER_GAP + width / 2
    const maxOuterCenter = DIAL_OUTER_RADIUS - RING_OUTER_PADDING - width / 2
    const maxSpanAvailable = Math.max(RING_MIN_AVAILABLE, maxOuterCenter - baseRadius)
    if (count > 1) {
        const suggestedGap = maxSpanAvailable / (count - 1) - width
        gap = Math.max(RING_MIN_GAP, Math.min(gap, suggestedGap))
    }
    return { baseRadius, width, gap }
})

function groupLabelSpanDeg(name) {
    const length = String(name || '').length
    const span = length * GROUP_LABEL_DEG_PER_CHAR
    return Math.max(GROUP_LABEL_MIN_DEG, Math.min(GROUP_LABEL_MAX_DEG, span))
}

function buildGroupLabel(groupId, groupName, startMinutes, radius) {
    const startAngle = minutesToAngle(startMinutes)
    const span = groupLabelSpanDeg(groupName)
    const offsetDeg = radius > 0 ? (GROUP_LABEL_OFFSET_PX / radius) * (180 / Math.PI) : 0
    const endAngle = startAngle - offsetDeg
    const labelStart = endAngle - span
    const pathId = `group-label-${String(groupId).replace(/[^a-z0-9_-]+/gi, '_')}`
    const labelRadius = Math.max(0, radius - 2)
    return {
        id: pathId,
        text: groupName,
        path: describeArcPath(labelRadius, labelStart, endAngle)
    }
}

function buildScenarioArc(item, radius, width, groupId) {
    const env = computeEnvironment(item?.time || {})
    const startMinutes = boundaryToMinutes(item?.time?.start, env, 18 * 60)
    const endMinutes = boundaryToMinutes(item?.time?.end, env, 23 * 60)
    const startAngle = minutesToAngle(startMinutes)
    const endAngle = minutesToAngle(endMinutes)
    const sweep = ((endAngle - startAngle + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG) || FULL_CIRCLE_DEG
    const colors = pickScenarioColors(item)
    const safeGroup = String(groupId).replace(/[^a-z0-9_-]+/gi, '_')
    const gradientId = `${scenarioDialGradientId(item)}-${safeGroup}`
    const status = scenarioStatusDisplay(item)
    const isRunning = status.kind === 'running'
    const isInactive = !isRunning
    const key = `${scenarioKey(item)}-${String(groupId)}`
    const scenarioId = scenarioKey(item)
    if (sweep >= FULL_CIRCLE_DEG - 0.01) {
        return {
            key,
            scenarioId,
            item,
            kind: 'circle',
            radius,
            width,
            stroke: item?.disabled ? colors.end : `url(#${gradientId})`,
            colors,
            gradientId,
            startAngle,
            endAngle,
            status,
            isRunning,
            isInactive,
            startMinutes,
            endMinutes,
            conflicts: buildOverlapSegments(item, radius, width)
        }
    }
    return {
        key,
        scenarioId,
        item,
        kind: 'path',
        path: describeArcPath(radius, startAngle, startAngle + sweep),
        width,
        stroke: item?.disabled ? colors.end : `url(#${gradientId})`,
        colors,
        gradientId,
        startAngle,
        endAngle,
        status,
        isRunning,
        isInactive,
        startMinutes,
        endMinutes,
        conflicts: buildOverlapSegments(item, radius, width)
    }
}

const groupRings = computed(() => {
    const groups = new Map()
    sortedScenarios.value.forEach((item) => {
        const ids = Array.isArray(item?.targetGroups) ? item.targetGroups : []
        const groupIds = ids.length ? ids : [UNGROUPED_ID]
        groupIds.forEach((groupId) => {
            const id = String(groupId)
            const name = groupNameById.value.get(id) || (id === UNGROUPED_ID ? 'Без группы' : id)
            if (!groups.has(id)) {
                groups.set(id, { id, name, scenarios: [] })
            }
            groups.get(id).scenarios.push(item)
        })
    })
    const layout = groupRingLayout.value
    const orderedGroups = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    return orderedGroups.map((group, index) => {
        const radius = layout.baseRadius + index * (layout.width + layout.gap)
        const arcs = group.scenarios
            .map((item) => buildScenarioArc(item, radius, layout.width, group.id))
            .sort((a, b) => a.startMinutes - b.startMinutes)
        const earliest = arcs.length ? arcs[0].startMinutes : 0
        const label = buildGroupLabel(group.id, group.name, earliest, radius)
        return {
            id: group.id,
            name: group.name,
            radius,
            width: layout.width,
            label,
            scenarios: arcs
        }
    })
})

const scenarioArcGradients = computed(() => {
    const list = []
    groupRings.value.forEach((group) => {
        group.scenarios.forEach((arc) => {
            list.push({
                id: arc.gradientId,
                colors: arc.colors,
                vector: scenarioDialGradientVector(arc)
            })
        })
    })
    return list
})

const groupLabelPaths = computed(() => {
    return groupRings.value.map((group) => group.label).filter(Boolean)
})

const orbitConflictSegments = computed(() => {
    const segments = []
    groupRings.value.forEach((group) => {
        group.scenarios.forEach((entry) => {
            const conflicts = Array.isArray(entry.conflicts) ? entry.conflicts : []
            conflicts.forEach((conflict) => {
                segments.push({
                    ...conflict,
                    key: `${entry.key}-${conflict.kind}-${conflict.path || conflict.radius || 0}`
                })
            })
        })
    })
    return segments
})

function openConflictPopup(conflict, event) {
    if (!conflict?.window) return
    if (!event || event.clientX == null || event.clientY == null) return
    const next = {
        time: formatOverlapWindow(conflict.window, conflict.tz),
        label: formatConflictLabel(conflict.overlap),
        x: event.clientX,
        y: event.clientY
    }
    conflictPopup.value = next
    nextTick(() => {
        positionConflictPopup(next)
    })
}

function toggleConflictPopup(conflict, event) {
    if (
        conflictPopup.value?.time === formatOverlapWindow(conflict.window, conflict.tz) &&
        conflictPopup.value?.label === formatConflictLabel(conflict.overlap)
    ) {
        conflictPopup.value = null
        conflictPopupStyle.value = {}
        return
    }
    openConflictPopup(conflict, event)
}

function handleConflictHover(conflict, event) {
    if (event?.pointerType && event.pointerType !== 'mouse') return
    openConflictPopup(conflict, event)
}

function handleConflictClick(conflict, event) {
    if (event?.pointerType === 'mouse') return
    toggleConflictPopup(conflict, event)
}

function positionConflictPopup(anchor) {
    if (!anchor || !orbitDialEl.value || !conflictPopupEl.value) return
    const dialRect = orbitDialEl.value.getBoundingClientRect()
    const popupRect = conflictPopupEl.value.getBoundingClientRect()
    const viewportWidth = window.innerWidth || dialRect.width
    const viewportHeight = window.innerHeight || dialRect.height
    let left = anchor.x - popupRect.width / 2
    let top = anchor.y - CONFLICT_POPUP_OFFSET - popupRect.height
    left = Math.min(Math.max(left, CONFLICT_POPUP_MARGIN), viewportWidth - CONFLICT_POPUP_MARGIN - popupRect.width)
    top = Math.min(Math.max(top, CONFLICT_POPUP_MARGIN), viewportHeight - CONFLICT_POPUP_MARGIN - popupRect.height)
    conflictPopupStyle.value = {
        left: `${left - dialRect.left}px`,
        top: `${top - dialRect.top}px`
    }
}

function handleGlobalPointerDown(event) {
    if (!conflictPopup.value || !event?.target) return
    const target = event.target
    if (conflictPopupEl.value?.contains(target)) return
    conflictPopup.value = null
    conflictPopupStyle.value = {}
}

function clearConflictPopup() {
    if (!conflictPopup.value) return
    conflictPopup.value = null
    conflictPopupStyle.value = {}
}

function scenarioDialGradientVector(entry) {
    const start = angleToPoint(entry.startAngle, entry.radius)
    const end = angleToPoint(entry.endAngle, entry.radius)
    const dx = (end.x ?? 0) - (start.x ?? 0)
    const dy = (end.y ?? 0) - (start.y ?? 0)
    if (Math.hypot(dx, dy) < 0.01) {
        return { x1: 0, y1: 0, x2: 200, y2: 200 }
    }
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y }
}

function setHoveredScenario(key) {
    hoveredScenarioId.value = key
}

function clearHoveredScenario(key) {
    if (hoveredScenarioId.value === key) {
        hoveredScenarioId.value = null
    }
}

function togglePinnedScenario(key) {
    pinnedScenarioId.value = pinnedScenarioId.value === key ? null : key
}

</script>

<template>
    <main class="page-shell list">
        <header class="hero">
            <div>
                <h1>Сценарии</h1>
            </div>
            <div class="actions">
                <RouterLink class="info-link" :to="{ name: 'landing' }" target="_blank" rel="noopener">
                    Что умеет Extrahub?
                </RouterLink>
            </div>
        </header>

        <section class="panel-card" v-if="loading">
            <p>Загрузка списка…</p>
        </section>

        <section class="panel-card" v-else-if="error">
            <p>{{ error }}</p>
            <button class="toggle retry-button" type="button" @click="loadScenarios">Повторить</button>
        </section>

        <section v-else class="scenario-layout">
            <article v-if="!hasScenarios" class="empty onboarding">
                <h2>У вас пока нет сценариев</h2>
                <p>Создайте первый сценарий, чтобы автоматизировать свет или настроить собственные правила.</p>
                <ul>
                    <li>Выберите устройства и группы, которые нужно контролировать.</li>
                    <li>Задайте временное окно и условия запуска.</li>
                    <li>Сохраните и протестируйте сценарий прямо из редактора.</li>
                </ul>
                <article class="scenario-card create-card">
                    <button class="create-card-button" type="button" @click="createScenario">
                        + Создать сценарий
                    </button>
                </article>
            </article>

            <template v-else>
                <section class="scenario-orbit">
                    <div ref="orbitDialEl" class="orbit-dial">
                        <svg viewBox="0 0 200 200" class="orbit-dial-svg" aria-hidden="true">
                            <defs>
                                <linearGradient v-for="entry in scenarioArcGradients" :key="entry.id" :id="entry.id"
                                    gradientUnits="userSpaceOnUse" v-bind="entry.vector">
                                    <stop offset="0%" :stop-color="entry.colors.start" />
                                    <stop offset="100%" :stop-color="entry.colors.end" />
                                </linearGradient>
                                <path v-for="label in groupLabelPaths" :key="label.id" :id="label.id" :d="label.path" />
                            </defs>
                            <circle class="orbit-outer-bg" cx="100" cy="100" r="100" />
                            <g class="orbit-rings">
                                <g v-for="group in groupRings" :key="group.id" class="orbit-group">
                                    <text v-if="group.label?.text && activeGroupId === group.id"
                                        class="orbit-group-label">
                                        <textPath :href="`#${group.label.id}`" :xlink:href="`#${group.label.id}`"
                                            startOffset="100%">
                                            {{ group.label.text }}
                                        </textPath>
                                    </text>
                                    <g v-for="entry in group.scenarios" :key="entry.key" class="orbit-ring" :class="{
                                        inactive: entry.isInactive,
                                        active: entry.isRunning,
                                        hovered: entry.scenarioId === activeScenarioId
                                    }" @mouseenter="setHoveredScenario(entry.scenarioId)"
                                        @mouseleave="clearHoveredScenario(entry.scenarioId)"
                                        @click="togglePinnedScenario(entry.scenarioId)">
                                        <path v-if="entry.kind === 'path'" :d="entry.path" :stroke="entry.stroke"
                                            :stroke-width="entry.width" />
                                        <circle v-else-if="entry.kind === 'circle'" cx="100" cy="100" :r="entry.radius"
                                            fill="none" :stroke="entry.stroke" :stroke-width="entry.width" />
                                    </g>
                                </g>
                            </g>
                            <g class="orbit-face-layer"
                                :transform="`translate(100 100) scale(${DIAL_FACE_SCALE}) translate(-100 -100)`">
                                <circle class="orbit-face-bg" cx="100" cy="100" r="100" />
                                <DialFace :sunrise-minute="environment.sunriseMin"
                                    :sunset-minute="environment.sunsetMin" />
                            </g>
                            <line class="orbit-needle" :x1="currentNeedleCoords().start.x"
                                :y1="currentNeedleCoords().start.y" :x2="currentNeedleCoords().end.x"
                                :y2="currentNeedleCoords().end.y" />
                            <g v-if="orbitConflictSegments.length" class="orbit-conflicts"
                                @pointerleave="clearConflictPopup">
                                <template v-for="conflict in orbitConflictSegments" :key="conflict.key">
                                    <path v-if="conflict.kind === 'path'" class="orbit-conflict-hit" :d="conflict.path"
                                        :stroke-width="conflict.width" @pointerdown.stop
                                        @pointerenter="(event) => handleConflictHover(conflict, event)"
                                        @pointerleave="clearConflictPopup"
                                        @click.stop="(event) => handleConflictClick(conflict, event)" />
                                    <path v-if="conflict.kind === 'path'" :d="conflict.path" :stroke="conflictStroke"
                                        :stroke-width="conflict.width" />
                                    <circle v-else-if="conflict.kind === 'circle'" class="orbit-conflict-hit" cx="100"
                                        cy="100" :r="conflict.radius" fill="none" :stroke-width="conflict.width"
                                        @pointerdown.stop
                                        @pointerenter="(event) => handleConflictHover(conflict, event)"
                                        @pointerleave="clearConflictPopup"
                                        @click.stop="(event) => handleConflictClick(conflict, event)" />
                                    <circle v-else-if="conflict.kind === 'circle'" cx="100" cy="100"
                                        :r="conflict.radius" fill="none" :stroke="conflictStroke"
                                        :stroke-width="conflict.width" />
                                </template>
                            </g>
                        </svg>
                        <div class="orbit-dial-hint">
                            <span>Карта дня</span>
                            <span class="orbit-dial-sub">Наведите на дугу, чтобы увидеть сценарий</span>
                        </div>
                        <div v-if="conflictPopup" ref="conflictPopupEl" class="orbit-conflict-hint"
                            :style="conflictPopupStyle">
                            <span>{{ conflictPopup.time }}</span>
                            <span>{{ conflictPopup.label }}</span>
                        </div>
                    </div>
                </section>
                <div class="scenario-list">
                    <article class="scenario-card create-card">
                        <button class="create-card-button" type="button" @click="createScenario">
                            + Создать сценарий
                        </button>
                    </article>
                    <article v-for="item in sortedScenarios" :key="item.id || item.key || item.name"
                        class="scenario-card"
                        :class="{ paused: isPaused(item), disabled: item.disabled, active: scenarioKey(item) === activeScenarioId }"
                        role="link" tabindex="0" @keyup.enter="handleCardEnter(item)"
                        @mouseenter="setHoveredScenario(scenarioKey(item))"
                        @mouseleave="clearHoveredScenario(scenarioKey(item))">
                        <a class="card-link-overlay" :href="scenarioLinkHref(item)"
                            :aria-label="'Открыть сценарий «' + (item.name || 'Без имени') + '»'"
                            @click="handleCardClick(item, $event)" @auxclick="handleCardAuxClick(item, $event)" />
                        <header class="card__header">
                            <div class="card__title">
                                <h2>{{ item.name }}</h2>
                                <p class="status" :class="`status--${scenarioStatusDisplay(item).kind}`">
                                    <span>{{ scenarioStatusDisplay(item).label }}</span>
                                </p>
                            </div>
                            <button v-if="canTogglePause(item)" type="button" class="card-pause"
                                :disabled="toggling[item.id] || item.disabled"
                                :aria-label="isPaused(item) ? 'Возобновить' : 'Пауза'" @click.stop="togglePause(item)">
                                <span v-if="isPaused(item)">▶</span>
                                <span v-else>⏸</span>
                            </button>
                        </header>
                    </article>
                </div>
            </template>
        </section>
    </main>
</template>

<style scoped>
.page-shell {
    padding: 24px 16px 40px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.panel-card {
    background: var(--surface-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--surface-border);
    padding: 16px;
    box-shadow: 0 12px 30px rgba(2, 6, 23, 0.55);
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.list {
    width: min(960px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.actions {
    display: flex;
    gap: 8px;
}

.info-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    color: #cbd5f5;
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    background: rgba(15, 23, 42, 0.4);
}

.retry-button {
    margin-top: 8px;
}

.hero h1 {
    margin: 0;
    font-size: 28px;
    color: var(--text-primary);
}

.subtitle {
    margin: 4px 0 0;
    color: var(--text-muted);
}

.scenario-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.scenario-orbit {
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: stretch;
    background: radial-gradient(circle at top, rgba(30, 41, 59, 0.6), rgba(2, 6, 23, 0.9));
    border-radius: 24px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 20px;
    box-shadow: 0 18px 40px rgba(2, 6, 23, 0.55);
    position: relative;
    z-index: 5;
}

.orbit-dial {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    width: 100%;
    position: relative;
    z-index: 2;
}

.scenario-list {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    position: relative;
    z-index: 1;
}

.orbit-dial-svg {
    width: 100%;
    aspect-ratio: 1 / 1;
    display: block;
    background: radial-gradient(circle at center, rgba(15, 23, 42, 0.6), rgba(2, 6, 23, 0.95));
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.6);
}

.orbit-outer-bg {
    fill: var(--bg-primary);
    filter: drop-shadow(0 0 18px rgba(0, 0, 0, 0.65));
}

.orbit-face-layer {
    filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.35));
}

.orbit-face-bg {
    fill: var(--surface-card);
    stroke: rgba(0, 0, 0, 0.65);
    stroke-width: 1px;
}

.orbit-needle {
    stroke: #f87171;
    stroke-width: 1px;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.6));
}

.orbit-rings path,
.orbit-rings circle {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: stroke;
    transition: opacity 1s ease, filter 0.4s ease;
}

.orbit-group-label {
    fill: rgba(255, 255, 255, 0.5);
    font-size: 6px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    pointer-events: none;
    text-anchor: end;
}

.orbit-group-label textPath {
    text-anchor: end;
}

.orbit-conflicts path,
.orbit-conflicts circle {
    fill: none;
    stroke-dasharray: 1 4;
    opacity: 1;
    pointer-events: auto;
}

.orbit-conflicts {
    opacity: 1;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.35));
}

.orbit-conflict-hit {
    stroke: transparent;
    stroke-dasharray: none;
    stroke-linecap: round;
    pointer-events: stroke;
    cursor: pointer;
}

.orbit-ring.inactive .orbit-conflicts path,
.orbit-ring.inactive .orbit-conflicts circle {
    opacity: 1;
}

.orbit-ring {
    opacity: 0.5;
    cursor: pointer;
    transition: opacity 1s ease;
}

.orbit-ring.hovered,
.orbit-ring.active {
    opacity: 1;
}

.orbit-ring.active path,
.orbit-ring.active circle {
    animation: orbit-ring-pulse 2.8s ease-in-out infinite;
}

.orbit-dial-hint {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
    color: var(--text-primary);
    font-weight: 600;
}

.orbit-dial-sub {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
}

.orbit-conflict-hint {
    position: absolute;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 16px;
    padding: 8px 12px;
    color: #e2e8f0;
    display: grid;
    gap: 4px;
    font-size: 12px;
    width: max-content;
    max-width: 220px;
    pointer-events: none;
    z-index: 30;
}


.scenario-card {
    background: var(--surface-card);
    border: 1px solid var(--surface-border);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: none;
    position: relative;
    transition: transform var(--transition-base), border-color var(--transition-base),
        background var(--transition-base), box-shadow var(--transition-base);
}

.scenario-card:hover {
    border-color: var(--surface-border-strong);
    background: var(--surface-hover);
}

.scenario-card.active {
    border-color: rgba(56, 189, 248, 0.8);
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.45), 0 0 18px rgba(56, 189, 248, 0.2);
}

.scenario-card:active,
.scenario-card:has(.card-link-overlay:active) {
    transform: scale(0.95);
}

.scenario-card.paused {
    border-color: rgba(249, 115, 22, 0.55);
    box-shadow: none;
}

.scenario-card.disabled {
    opacity: 0.65;
    border-style: dashed;
}

.card__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    position: relative;
}

.card__title {
    flex: 1;
    cursor: pointer;
}

.card__title h2 {
    margin: 0;
    font-size: 18px;
    color: var(--text-primary);
}

.status {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.status span {
    position: relative;
}

.status--running {
    color: #34d399;
    animation: status-shimmer 2.5s ease-in-out infinite;
}

.status--running::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.7);
}

.status--paused {
    color: #facc15;
}

.status--off {
    color: var(--text-muted);
}

.status--waiting {
    color: #93c5fd;
}

.card-pause {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid rgba(148, 163, 184, 0.35);
    background: rgba(15, 23, 42, 0.65);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    position: relative;
    z-index: 3;
    cursor: pointer;
}

.create-card {
    border-style: dashed;
    background: rgba(15, 23, 42, 0.45);
}

.create-card-button {
    width: 100%;
    padding: 0;
    border-radius: 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
}

.card-pause:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.card-link-overlay {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    z-index: 2;
    display: block;
    cursor: pointer;
}

.card-link-overlay:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.4);
    outline-offset: -6px;
}

.card__header,
.card__title,
.status {
    position: relative;
}


.empty {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--text-muted);
    background: var(--surface-card);
    border-radius: 16px;
    padding: 32px;
    border: 1px dashed rgba(148, 163, 184, 0.4);
}

.onboarding {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
}

.onboarding h2 {
    margin: 0;
    color: var(--text-primary);
}

.onboarding ul {
    list-style: disc;
    padding-left: 20px;
    text-align: left;
    margin: 0;
    color: var(--text-muted);
}

@keyframes status-shimmer {
    0% {
        filter: none;
    }

    50% {
        filter: drop-shadow(0 0 6px rgba(52, 211, 153, 0.8));
    }

    100% {
        filter: none;
    }
}

@keyframes orbit-ring-pulse {
    0% {
        opacity: 0.7;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0.7;
    }
}

@media (min-width: 641px) {
    .scenario-layout {
        flex-direction: row;
        align-items: stretch;
    }

    .scenario-orbit {
        flex: 0 1 450px;
        min-width: 250px;
        max-width: 450px;
    }

    .scenario-list {
        flex: 1 1 auto;
        min-width: 250px;
    }
}
</style>
