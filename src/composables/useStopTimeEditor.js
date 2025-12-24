import { computed, nextTick, reactive, ref, watch, watchEffect } from 'vue'
import { computeEnvironment } from '../utils/scenarioUtils'

const MINUTES_PER_DAY = 1440
const OFFSET_LIMIT = 60
const SUN_OFFSET_STEP = 5
const MINUTE_STEP = 5

function normalizeMinutes(value) {
    let next = Number(value) % MINUTES_PER_DAY
    if (Number.isNaN(next)) return 0
    if (next < 0) next += MINUTES_PER_DAY
    return next
}

function clampOffset(value) {
    const numeric = Math.round(Number(value) || 0)
    return Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, numeric))
}

function snapClockMinutesValue(value) {
    const normalized = normalizeMinutes(value)
    const snapped = Math.round(normalized / MINUTE_STEP) * MINUTE_STEP
    return normalizeMinutes(snapped)
}

function snapSunOffsetValue(value) {
    const numeric = Number(value) || 0
    const snapped = Math.round(numeric / SUN_OFFSET_STEP) * SUN_OFFSET_STEP
    return clampOffset(snapped)
}

export function useStopTimeEditor(stopDraft, time, open, commitStop) {
    const timeMode = ref('clock')
    const clockMinutesValue = ref(0)
    const sunAnchorOffsets = reactive({
        sunrise: 0,
        sunset: 0
    })
    const sunEnvironment = computed(() => computeEnvironment(time?.value || {}))

    function getSunClockMinutes(anchor, offsetMin = 0) {
        const env = sunEnvironment.value
        const base = anchor === 'sunrise' ? env.sunriseMin : env.sunsetMin
        return normalizeMinutes(base + (Number(offsetMin) || 0))
    }

    function hydrateFromStop() {
        const stop = stopDraft.value
        if (!stop) return
        if (stop.mode === 'sunrise' || stop.mode === 'sunset') {
            const snapped = snapSunOffsetValue(stop.offset)
            sunAnchorOffsets[stop.mode] = snapped
            timeMode.value = stop.mode
            clockMinutesValue.value = getSunClockMinutes(stop.mode, snapped)
            return
        }
        timeMode.value = 'clock'
        const numeric = Number(stop.clockMinutes)
        clockMinutesValue.value = Number.isFinite(numeric) ? snapClockMinutesValue(numeric) : 0
    }

    watchEffect(() => {
        if (open.value) return
        hydrateFromStop()
    })

    watch(
        () => [time?.value?.tz, time?.value?.lat, time?.value?.lon],
        () => {
            if (!open.value) {
                hydrateFromStop()
                return
            }
            if (timeMode.value === 'sunrise' || timeMode.value === 'sunset') {
                clockMinutesValue.value = getSunClockMinutes(timeMode.value, sunAnchorOffsets[timeMode.value])
            }
        }
    )

    watch(
        open,
        async (value) => {
            if (!value) return
            hydrateFromStop()
            await nextTick()
        },
        { immediate: true }
    )

    function commitClockTime() {
        const value = snapClockMinutesValue(clockMinutesValue.value)
        clockMinutesValue.value = value
        commitStop({
            mode: 'clock',
            offset: 0,
            clockMinutes: value
        })
    }

    function commitSunTime(anchor) {
        const snapped = snapSunOffsetValue(sunAnchorOffsets[anchor])
        sunAnchorOffsets[anchor] = snapped
        clockMinutesValue.value = getSunClockMinutes(anchor, snapped)
        commitStop({
            mode: anchor,
            offset: snapped
        })
    }

    function selectTimeMode(mode) {
        if (mode !== 'clock' && mode !== 'sunrise' && mode !== 'sunset') return
        const previousMode = timeMode.value
        timeMode.value = mode
        if (mode === 'clock') {
            if (previousMode === 'sunrise' || previousMode === 'sunset') {
                const derived = getSunClockMinutes(previousMode, sunAnchorOffsets[previousMode] || 0)
                clockMinutesValue.value = snapClockMinutesValue(derived)
            }
            commitClockTime()
            return
        }
        if (!sunAnchorOffsets[mode]) sunAnchorOffsets[mode] = 0
        commitSunTime(mode)
    }

    function setClockMinutes(value) {
        clockMinutesValue.value = snapClockMinutesValue(value)
    }

    function setClockHour(hour) {
        const normalized = ((Number(hour) % 24) + 24) % 24
        const minutes = clockMinutesValue.value % 60
        clockMinutesValue.value = snapClockMinutesValue(normalized * 60 + minutes)
        commitClockTime()
    }

    function setClockMinute(minute) {
        const normalized = ((Number(minute) % 60) + 60) % 60
        const hours = Math.floor(clockMinutesValue.value / 60)
        clockMinutesValue.value = snapClockMinutesValue(hours * 60 + normalized)
        commitClockTime()
    }

    function setSunOffset(anchor, value) {
        if (!anchor) return
        sunAnchorOffsets[anchor] = snapSunOffsetValue(value)
        if (timeMode.value === anchor) commitSunTime(anchor)
    }

    const clockHour = computed(() => Math.floor(clockMinutesValue.value / 60))
    const clockMinute = computed(() => clockMinutesValue.value % 60)
    const clockHourWheel = computed(() => Array.from({ length: 24 }, (_, index) => index))
    const clockMinuteWheel = computed(() =>
        Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP)
    )

    const activeSunAnchor = computed(() =>
        timeMode.value === 'sunrise' || timeMode.value === 'sunset' ? timeMode.value : ''
    )
    const activeSunOffset = computed(() => (activeSunAnchor.value ? sunAnchorOffsets[activeSunAnchor.value] : 0))
    const sunWheelValues = computed(() => {
        if (!activeSunAnchor.value) return []
        const values = []
        for (let offset = -OFFSET_LIMIT; offset <= OFFSET_LIMIT; offset += SUN_OFFSET_STEP) {
            values.push(offset)
        }
        return values
    })

    const sunAnchorLabel = computed(() => {
        if (activeSunAnchor.value === 'sunrise') return 'Рассвет'
        if (activeSunAnchor.value === 'sunset') return 'Закат'
        return ''
    })

    return {
        timeMode,
        clockHour,
        clockMinute,
        clockHourWheel,
        clockMinuteWheel,
        activeSunAnchor,
        activeSunOffset,
        sunWheelValues,
        sunAnchorLabel,
        selectTimeMode,
        setClockHour,
        setClockMinute,
        setSunOffset
    }
}
