import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'

export function useRangeLinkMetrics(boardRef, leftTrackRef, rightTrackRef, open) {
    const linkMetrics = reactive({
        width: 1,
        height: 1,
        trackTop: 0,
        trackHeight: 1,
        leftX: 0,
        rightX: 0
    })
    const rangeObserver = ref(null)
    let rangeMetricsHandle = 0

    function readRangeMetrics() {
        const board = boardRef.value
        const leftTrack = leftTrackRef.value
        const rightTrack = rightTrackRef.value
        if (!board || !leftTrack || !rightTrack) return
        const boardRect = board.getBoundingClientRect()
        const leftRect = leftTrack.getBoundingClientRect()
        const rightRect = rightTrack.getBoundingClientRect()
        linkMetrics.width = Math.max(1, boardRect.width)
        linkMetrics.height = Math.max(1, boardRect.height)
        linkMetrics.trackTop = leftRect.top - boardRect.top
        linkMetrics.trackHeight = Math.max(1, leftRect.height)
        linkMetrics.leftX = leftRect.left - boardRect.left + leftRect.width
        linkMetrics.rightX = rightRect.left - boardRect.left
    }

    function scheduleRangeMetrics() {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
            readRangeMetrics()
            return
        }
        if (rangeMetricsHandle) return
        rangeMetricsHandle = window.requestAnimationFrame(() => {
            rangeMetricsHandle = 0
            readRangeMetrics()
        })
    }

    function observe() {
        if (typeof ResizeObserver === 'undefined') return
        if (!rangeObserver.value) rangeObserver.value = new ResizeObserver(() => scheduleRangeMetrics())
        const observer = rangeObserver.value
        if (boardRef.value) observer.observe(boardRef.value)
        if (leftTrackRef.value) observer.observe(leftTrackRef.value)
        if (rightTrackRef.value) observer.observe(rightTrackRef.value)
    }

    function unobserve() {
        rangeObserver.value?.disconnect()
    }

    onMounted(() => {
        readRangeMetrics()
        observe()
        if (typeof window !== 'undefined') {
            window.addEventListener('resize', scheduleRangeMetrics)
        }
    })

    onUnmounted(() => {
        if (rangeMetricsHandle && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(rangeMetricsHandle)
            rangeMetricsHandle = 0
        }
        unobserve()
        if (typeof window !== 'undefined') {
            window.removeEventListener('resize', scheduleRangeMetrics)
        }
    })

    watch([boardRef, leftTrackRef, rightTrackRef, open], () => {
        if (open?.value === false) return
        scheduleRangeMetrics()
        if (open?.value) {
            unobserve()
            observe()
        }
    })

    return {
        linkMetrics,
        scheduleRangeMetrics
    }
}
