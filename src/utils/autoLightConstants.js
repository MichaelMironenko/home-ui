export const DEFAULT_PARAMS = Object.freeze({
    alpha: 0.5,
    beta: 0.5,
    brightnessWindow: 0.1,
    cctWindowMin: 45,
    pauseMinutes: 120,
    rampMinutes: 30,
    evaluationIntervalMin: 4,
    rampApplySeconds: 1,
    minBrightness: 0.01,
    maxBrightness: 1,
    minCct: 1000,
    maxCct: 6500
})

export const DEFAULT_BRIGHTNESS_CURVE_DAY = Object.freeze([
    { x: 0, y: 1.0 },
    { x: 0.05, y: 0.98 },
    { x: 0.15, y: 0.85 },
    { x: 0.3, y: 0.65 },
    { x: 0.55, y: 0.35 },
    { x: 0.8, y: 0.15 },
    { x: 1.0, y: 0.05 }
])

export const DEFAULT_BRIGHTNESS_CURVE_EVENING = Object.freeze([
    { x: 0, y: 1.0 },
    { x: 1.0, y: 1.0 }
])

export const ADJUST_THROTTLE_MS = 1000
export const ADJUST_IDLE_DELAY_MS = 1000
export const ADJUST_MIN_DELTA = 2
export const ADJUST_MIN_DELTA_TEMP = 200
export const ADJUST_COMMIT_DELAY_MS = 30000

export const PAUSE_REASON_TEXT = Object.freeze({
    manual_override: 'Ручное управление',
    manual_off: 'Выключено',
    presence_guard: 'Присутствие'
})
