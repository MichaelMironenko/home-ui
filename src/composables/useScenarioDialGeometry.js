import { computed, shallowRef, watch } from 'vue'
import { computeEnvironment } from '../utils/scenarioUtils'
import { hsvToHex, temperatureToHex } from '../utils/colorUtils'
import { deriveScenarioListStatus } from '../utils/scenarioStatusDisplay'

const MINUTES_PER_DAY = 1440
const FULL_CIRCLE_DEG = 360

const DIAL = {
    CENTER: 100,
    VIEWBOX_RADIUS: 100,
    FACE_SCALE: 0.66
}

const DIAL_FACE_RADIUS = DIAL.VIEWBOX_RADIUS * DIAL.FACE_SCALE
const DIAL_OUTER_RADIUS = DIAL.VIEWBOX_RADIUS
const DIAL_NEEDLE_INNER = DIAL_FACE_RADIUS

const RING = {
    DEFAULT_WIDTH: 14,
    DEFAULT_GAP: 8,
    MIN_WIDTH: 6,
    MIN_GAP: 3,
    MIN_AVAILABLE: 6,
    INNER_GAP: 4,
    OUTER_PADDING: 4
}

const GROUP_LABEL = {
    MIN_DEG: 18,
    MAX_DEG: 70,
    DEG_PER_CHAR: 4.2,
    OFFSET_PX: 8
}

const UNGROUPED_ID = 'ungrouped'

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

function formatConflictLabel(overlap) {
    const types = Array.isArray(overlap?.types) ? overlap.types : []
    if (types.includes('light.brightness')) return 'Наложение по яркости'
    if (types.includes('light.color.cct')) return 'Наложение по температуре'
    if (types.includes('light.color.hsv')) return 'Наложение по цвету'
    return 'Наложение'
}

function scenarioKey(item) {
    return String(item?.id || item?.key || item?.name || 'unknown')
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

function angleToPoint(angle, radius = DIAL_OUTER_RADIUS) {
    const rad = (angle * Math.PI) / 180
    return {
        x: DIAL.CENTER + radius * Math.cos(rad),
        y: DIAL.CENTER + radius * Math.sin(rad)
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

function groupLabelSpanDeg(name) {
    const length = String(name || '').length
    const span = length * GROUP_LABEL.DEG_PER_CHAR
    return Math.max(GROUP_LABEL.MIN_DEG, Math.min(GROUP_LABEL.MAX_DEG, span))
}

function buildGroupLabel(groupId, groupName, startMinutes, radius) {
    const startAngle = minutesToAngle(startMinutes)
    const span = groupLabelSpanDeg(groupName)
    const offsetDeg = radius > 0 ? (GROUP_LABEL.OFFSET_PX / radius) * (180 / Math.PI) : 0
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

function buildScenarioArc(item, radius, width, groupId, scenarioStatusDisplay) {
    const env = item?.env || computeEnvironment(item?.time || {})
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

export function useScenarioDialGeometry({ sortedScenarios, catalogGroups, nowTick }) {
    const groupNameById = shallowRef(new Map())

    watch(
        catalogGroups,
        (list) => {
            const map = new Map()
            list.forEach((group) => {
                if (!group?.id) return
                const name = String(group?.name || group?.title || group?.label || group?.id || '').trim()
                map.set(String(group.id), name || String(group.id))
            })
            groupNameById.value = map
        },
        { immediate: true }
    )

    const scenarioStatusDisplay = (item) => deriveScenarioListStatus(item, nowTick.value)

    const currentDialMinute = computed(() => {
        const date = new Date(nowTick.value)
        return date.getHours() * 60 + date.getMinutes()
    })

    const environment = computed(() => {
        const baseScenario = sortedScenarios.value.find((item) => item?.time)
        if (baseScenario?.env) return baseScenario.env
        return computeEnvironment(baseScenario?.time || {})
    })

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
        const defaultWidth = RING.DEFAULT_WIDTH
        const defaultGap = RING.DEFAULT_GAP
        if (!count) {
            const baseRadius = DIAL_FACE_RADIUS + RING.INNER_GAP + defaultWidth / 2
            return { baseRadius, width: defaultWidth, gap: defaultGap }
        }
        const spanBase = defaultWidth + Math.max(0, count - 1) * (defaultWidth + defaultGap)
        const maxSpan = DIAL_OUTER_RADIUS - RING.OUTER_PADDING - (DIAL_FACE_RADIUS + RING.INNER_GAP)
        const scale = spanBase > 0 ? Math.min(1, maxSpan / spanBase) : 1
        const width = Math.max(RING.MIN_WIDTH, defaultWidth * scale)
        let gap = Math.max(RING.MIN_GAP, defaultGap * scale)
        const baseRadius = DIAL_FACE_RADIUS + RING.INNER_GAP + width / 2
        const maxOuterCenter = DIAL_OUTER_RADIUS - RING.OUTER_PADDING - width / 2
        const maxSpanAvailable = Math.max(RING.MIN_AVAILABLE, maxOuterCenter - baseRadius)
        if (count > 1) {
            const suggestedGap = maxSpanAvailable / (count - 1) - width
            gap = Math.max(RING.MIN_GAP, Math.min(gap, suggestedGap))
        }
        return { baseRadius, width, gap }
    })

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
                .map((item) => buildScenarioArc(item, radius, layout.width, group.id, scenarioStatusDisplay))
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
                    const conflictIndex = segments.length
                    segments.push({
                        ...conflict,
                        key: `${entry.key}-${conflict.kind}-${conflict.path || conflict.radius || 0}-${conflictIndex}`
                    })
                })
            })
        })
        return segments
    })

    function currentNeedleCoords() {
        const angle = minutesToAngle(currentDialMinute.value)
        const start = angleToPoint(angle, DIAL_NEEDLE_INNER)
        const end = angleToPoint(angle, DIAL_OUTER_RADIUS)
        return { start, end }
    }

    return {
        dial: {
            ...DIAL,
            FACE_RADIUS: DIAL_FACE_RADIUS,
            OUTER_RADIUS: DIAL_OUTER_RADIUS,
            NEEDLE_INNER: DIAL_NEEDLE_INNER
        },
        ungroupedId: UNGROUPED_ID,
        currentDialMinute,
        currentNeedleCoords,
        environment,
        groupRings,
        groupLabelPaths,
        orbitConflictSegments,
        scenarioArcGradients,
        scenarioKey,
        scenarioStatusDisplay,
        formatConflictLabel,
        formatOverlapWindow
    }
}
