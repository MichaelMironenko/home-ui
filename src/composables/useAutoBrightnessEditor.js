import { computed, reactive, ref, watch } from 'vue'
import {
    buildLuxTicks,
    clamp,
    luxToPercent,
    normalizeAutoBrightness,
    percentToLux,
    resolveLuxBounds,
    snapLuxValue
} from '../utils/autoBrightnessMapping'

const SENSOR_MAX_FALLBACK = 100000
const SENSOR_MIN_FLOOR = 1

export function useAutoBrightnessEditor(autoDraft, sensorOptions, open, isStartContext, commitAutoBrightness) {
    const autoRangeBoardRef = ref(null)
    const luxTrackRef = ref(null)
    const brightnessTrackRef = ref(null)
    const rangeDrag = reactive({
        active: false,
        kind: '',
        handle: '',
        track: null,
        pointerId: null
    })

    const selectedSensorOption = computed(() =>
        (sensorOptions?.value || []).find((option) => option?.id === autoDraft.value?.sensorId) || null
    )
    const fallbackSensorOption = computed(() => (sensorOptions?.value || [])[0] || null)

    const capabilityBounds = computed(() => {
        const selectedMin = Number(selectedSensorOption.value?.minValue)
        const selectedMax = Number(selectedSensorOption.value?.maxValue)
        const fallbackMin = Number(fallbackSensorOption.value?.minValue)
        const fallbackMax = Number(fallbackSensorOption.value?.maxValue)
        const minCandidate = Number.isFinite(selectedMin) ? selectedMin : fallbackMin
        const maxCandidate = Number.isFinite(selectedMax) ? selectedMax : fallbackMax
        const min = Number.isFinite(minCandidate) && minCandidate > 0 ? minCandidate : SENSOR_MIN_FLOOR
        const max = Number.isFinite(maxCandidate) && maxCandidate > min ? maxCandidate : SENSOR_MAX_FALLBACK
        return resolveLuxBounds(min, max)
    })

    function shouldCommit(next) {
        const current = autoDraft.value || {}
        return (
            next.luxMin !== current.luxMin ||
            next.luxMax !== current.luxMax ||
            next.brightnessMin !== current.brightnessMin ||
            next.brightnessMax !== current.brightnessMax ||
            next.sensorId !== current.sensorId ||
            next.enabled !== current.enabled
        )
    }

    function normalizeDraft(next = autoDraft.value) {
        const normalized = normalizeAutoBrightness(next, capabilityBounds.value)
        if (!normalized) return
        if (!shouldCommit(normalized)) return
        commitAutoBrightness(normalized)
    }

    watch(
        [
            () => autoDraft.value?.sensorId,
            () => autoDraft.value?.luxMin,
            () => autoDraft.value?.luxMax,
            () => autoDraft.value?.brightnessMin,
            () => autoDraft.value?.brightnessMax,
            capabilityBounds
        ],
        () => normalizeDraft()
    )

    const luxMinPercent = computed(() =>
        luxToPercent(autoDraft.value?.luxMin ?? capabilityBounds.value.min, capabilityBounds.value)
    )
    const luxMaxPercent = computed(() =>
        luxToPercent(autoDraft.value?.luxMax ?? capabilityBounds.value.max, capabilityBounds.value)
    )
    const brightnessMinPercent = computed(() =>
        clamp(Math.round(autoDraft.value?.brightnessMin ?? 0), 0, 100)
    )
    const brightnessMaxPercent = computed(() =>
        clamp(Math.round(autoDraft.value?.brightnessMax ?? 100), 0, 100)
    )

    const luxMinSlider = computed({
        get: () => clamp(luxMinPercent.value, 0, 100),
        set: (value) => {
            const percent = clamp(Number(value) || 0, 0, 100)
            const lux = snapLuxValue(percentToLux(percent, capabilityBounds.value))
            const maxBound = Math.max(
                capabilityBounds.value.min + 1,
                autoDraft.value?.luxMax ?? capabilityBounds.value.max
            )
            commitAutoBrightness({
                ...autoDraft.value,
                luxMin: clamp(lux, capabilityBounds.value.min, maxBound - 1)
            })
        }
    })

    const luxMaxSlider = computed({
        get: () => clamp(luxMaxPercent.value, 0, 100),
        set: (value) => {
            const percent = clamp(Number(value) || 0, 0, 100)
            const lux = snapLuxValue(percentToLux(percent, capabilityBounds.value))
            const minBound = Math.max(
                capabilityBounds.value.min,
                (autoDraft.value?.luxMin ?? capabilityBounds.value.min) + 1
            )
            commitAutoBrightness({
                ...autoDraft.value,
                luxMax: clamp(lux, minBound, capabilityBounds.value.max)
            })
        }
    })

    const brightnessMinSlider = computed({
        get: () => clamp(brightnessMinPercent.value, 0, 100),
        set: (value) => {
            const percent = clamp(Number(value) || 0, 0, 100)
            const maxBound = Math.max(0, (autoDraft.value?.brightnessMax ?? 100) - 1)
            commitAutoBrightness({
                ...autoDraft.value,
                brightnessMin: clamp(Math.round(percent), 0, maxBound)
            })
        }
    })

    const brightnessMaxSlider = computed({
        get: () => clamp(brightnessMaxPercent.value, 0, 100),
        set: (value) => {
            const percent = clamp(Number(value) || 0, 0, 100)
            const minBound = Math.max(1, (autoDraft.value?.brightnessMin ?? 0) + 1)
            commitAutoBrightness({
                ...autoDraft.value,
                brightnessMax: clamp(Math.round(percent), minBound, 100)
            })
        }
    })

    const luxTicks = computed(() => buildLuxTicks(capabilityBounds.value))

    function percentFromPointer(event, track) {
        if (!track) return 0
        const rect = track.getBoundingClientRect()
        const clamped = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
        return clamped * 100
    }

    function pickNearestHandle(percent, minPercent, maxPercent, minKey, maxKey) {
        if (Math.abs(percent - maxPercent) <= Math.abs(percent - minPercent)) return maxKey
        return minKey
    }

    function updateRangeDrag(event) {
        if (!rangeDrag.active || !rangeDrag.track) return
        if (rangeDrag.pointerId != null && event.pointerId !== rangeDrag.pointerId) return
        const percent = percentFromPointer(event, rangeDrag.track)
        if (rangeDrag.kind === 'lux') {
            const minPercent = luxMinPercent.value
            const maxPercent = luxMaxPercent.value
            if (!rangeDrag.handle) {
                rangeDrag.handle = pickNearestHandle(percent, minPercent, maxPercent, 'luxMin', 'luxMax')
            }
            if (rangeDrag.handle === 'luxMax') luxMaxSlider.value = percent
            else luxMinSlider.value = percent
            return
        }
        if (rangeDrag.kind === 'brightness') {
            const minPercent = brightnessMinPercent.value
            const maxPercent = brightnessMaxPercent.value
            if (!rangeDrag.handle) {
                rangeDrag.handle = pickNearestHandle(percent, minPercent, maxPercent, 'brightnessMin', 'brightnessMax')
            }
            if (rangeDrag.handle === 'brightnessMin') brightnessMinSlider.value = percent
            else brightnessMaxSlider.value = percent
        }
    }

    function endRangeDrag() {
        rangeDrag.active = false
        rangeDrag.kind = ''
        rangeDrag.handle = ''
        rangeDrag.track = null
        rangeDrag.pointerId = null
        if (typeof window !== 'undefined') {
            window.removeEventListener('pointermove', updateRangeDrag)
            window.removeEventListener('pointerup', endRangeDrag)
        }
    }

    function startRangeDrag(kind, event) {
        if (!isStartContext.value) return
        event.preventDefault()
        const track = kind === 'lux' ? luxTrackRef.value : brightnessTrackRef.value
        if (!track) return
        rangeDrag.active = true
        rangeDrag.kind = kind
        rangeDrag.handle = ''
        rangeDrag.track = track
        rangeDrag.pointerId = event.pointerId
        event.currentTarget?.setPointerCapture?.(event.pointerId)
        updateRangeDrag(event)
        if (typeof window !== 'undefined') {
            window.addEventListener('pointermove', updateRangeDrag)
            window.addEventListener('pointerup', endRangeDrag, { once: true })
        }
    }

    watch(
        open,
        (value) => {
            if (!value) endRangeDrag()
        }
    )

    return {
        autoRangeBoardRef,
        luxTrackRef,
        brightnessTrackRef,
        luxMinPercent,
        luxMaxPercent,
        brightnessMinPercent,
        brightnessMaxPercent,
        luxMinSlider,
        luxMaxSlider,
        brightnessMinSlider,
        brightnessMaxSlider,
        luxTicks,
        capabilityBounds,
        rangeDrag,
        startRangeDrag
    }
}
