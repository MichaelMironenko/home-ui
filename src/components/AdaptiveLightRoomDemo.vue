<script setup>
import { computed, ref } from 'vue'
import { blendHex, hexToRgb } from '../utils/colorUtils'

const slider = ref(0)

function clamp01(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return 0
    return Math.max(0, Math.min(1, numeric))
}

function lerp(a, b, t) {
    return a + (b - a) * clamp01(t)
}

function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)
}

const progress = computed(() => clamp01((slider.value || 0) / 100))

const cloudFactor = computed(() => smoothstep(0.18, 0.55, progress.value))
const nightFactor = computed(() => smoothstep(0.6, 1.0, progress.value))

const lampLevel = computed(() => {
    const t = progress.value
    const minLamp = 0.22
    if (t <= 0.18) return 0
    if (t < 0.5) return lerp(0, minLamp, smoothstep(0.18, 0.5, t))
    return lerp(minLamp, 1, smoothstep(0.5, 1, t))
})

const roomDim = computed(() => smoothstep(0.18, 1, progress.value) * 0.4)

const stateLabel = computed(() => {
    const t = progress.value
    if (t < 0.25) return 'Ясный день'
    if (t < 0.7) return 'Пасмурно'
    return 'Вечер'
})

const cssVars = computed(() => {
    const cloudyTop = '#5b7894'
    const cloudyBottom = '#d1dbe6'
    const dayTop = blendHex(cloudyTop, '#6fb7e8', 0.22)
    const dayBottom = blendHex(cloudyBottom, '#f6d38a', 0.14)
    const nightTop = '#040614'
    const nightBottom = '#0f2a4a'

    const clouds = cloudFactor.value
    const night = nightFactor.value

    const skyTop = blendHex(blendHex(dayTop, cloudyTop, clouds), nightTop, night)
    const skyBottom = blendHex(blendHex(dayBottom, cloudyBottom, clouds), nightBottom, night)

    const sunOpacity = clamp01(Math.pow(1 - clouds, 2.2) * (1 - night * 0.98))
    const moonOpacity = clamp01(night * 1.05)
    const cloudOpacity = clamp01(clouds * (1 - night * 0.4))
    const overcastOpacity = clamp01(smoothstep(0.32, 0.9, clouds) * (1 - night * 0.35))
    const cloudScale = lerp(0.9, 1.55, smoothstep(0.25, 0.95, clouds))

    const lamp = lampLevel.value
    const roomOverlay = roomDim.value

    const landBackDay = '#2f7c54'
    const landBackCloudy = '#2a6a50'
    const landBackNight = '#061624'
    const landFrontDay = '#1f5b42'
    const landFrontCloudy = '#1b4c3a'
    const landFrontNight = '#030b12'
    const landBack = blendHex(blendHex(landBackDay, landBackCloudy, clouds), landBackNight, night)
    const landFront = blendHex(blendHex(landFrontDay, landFrontCloudy, clouds), landFrontNight, night)
    const hazeOpacity = clamp01(0.08 + clouds * 0.18 + night * 0.06)
    const landSaturation = lerp(1.02, 0.86, clouds)
    const landBrightness = lerp(1.02, 0.9, clouds) * lerp(1, 0.9, night)

    const lampWarmBase = '#ffd7a3'
    const lampWarmHot = '#ffb35c'
    const lampWarmHex = blendHex(lampWarmBase, lampWarmHot, Math.pow(lamp, 0.75))
    const lampRgb = hexToRgb(lampWarmHex)

    return {
        '--sky-top': skyTop,
        '--sky-bottom': skyBottom,
        '--land-back': landBack,
        '--land-front': landFront,
        '--haze-opacity': String(hazeOpacity),
        '--land-sat': String(landSaturation),
        '--land-bright': String(landBrightness),
        '--sun-opacity': String(sunOpacity),
        '--moon-opacity': String(moonOpacity),
        '--cloud-opacity': String(cloudOpacity),
        '--cloud-scale': String(cloudScale),
        '--overcast-opacity': String(overcastOpacity),
        '--room-overlay': String(roomOverlay),
        '--lamp-level': String(lamp),
        '--lamp-glow': String(lerp(0, 1, Math.pow(lamp, 0.82))),
        '--lamp-rgb': `${lampRgb.r}, ${lampRgb.g}, ${lampRgb.b}`,
        '--window-boost': String(clamp01(0.55 + (1 - clouds) * 0.35 + night * 0.25))
    }
})
</script>

<template>
    <section class="adaptive-demo" aria-label="Демонстрация адаптивного света">
        <header class="adaptive-demo__head">
            <div>
                <h3 class="adaptive-demo__title">Адаптивный свет</h3>
                <p class="adaptive-demo__hint">Двигайте ползунок и смотрите, как меняются комната и торшер.</p>
            </div>
            <span class="adaptive-demo__state" aria-live="polite">{{ stateLabel }}</span>
        </header>

        <div class="scene" :style="cssVars" role="img" aria-label="Комната с окном и торшером">
            <svg class="scene-svg" viewBox="0 0 600 360" aria-hidden="true" focusable="false">
                <defs>
                    <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" style="stop-color: var(--sky-top)" />
                        <stop offset="100%" style="stop-color: var(--sky-bottom)" />
                    </linearGradient>
                    <radialGradient id="lampWallGlow" cx="60%" cy="38%" r="68%">
                        <stop offset="0%" style="stop-color: rgba(var(--lamp-rgb), 0.75)" />
                        <stop offset="48%" style="stop-color: rgba(var(--lamp-rgb), 0.18)" />
                        <stop offset="74%" style="stop-color: rgba(var(--lamp-rgb), 0)" />
                    </radialGradient>
                    <radialGradient id="lampFloorGlow" cx="52%" cy="62%" r="75%">
                        <stop offset="0%" style="stop-color: rgba(var(--lamp-rgb), 0.55)" />
                        <stop offset="48%" style="stop-color: rgba(var(--lamp-rgb), 0.16)" />
                        <stop offset="76%" style="stop-color: rgba(var(--lamp-rgb), 0)" />
                    </radialGradient>
                    <clipPath id="windowClip">
                        <polygon points="58,112 250,92 250,252 58,276" />
                    </clipPath>
                </defs>

                <g class="room-base">
                    <polygon class="wall-fill" points="0,0 350,60 350,300 0,360" />
                    <polygon class="wall-fill wall-fill--right" points="350,60 600,0 600,280 350,300" />
                    <polygon class="floor-fill" points="0,360 350,300 600,280 600,360" />

                    <polyline class="room-line" points="0,0 350,60 600,0" />
                    <polyline class="room-line" points="0,360 350,300 600,280" />
                    <line class="room-line room-line--corner" x1="350" y1="60" x2="350" y2="300" />
                </g>

                <g class="room-dim">
                    <polygon points="0,0 350,60 350,300 0,360" />
                    <polygon points="350,60 600,0 600,280 350,300" />
                    <polygon points="0,360 350,300 600,280 600,360" />
                </g>

                <g class="window-group">
                    <polygon class="window-frame-outer" points="40,100 268,76 268,266 40,292" />
                    <polygon class="window-reveal" points="48,106 260,84 260,260 48,284" />
                    <g clip-path="url(#windowClip)">
                        <rect x="0" y="0" width="600" height="360" fill="url(#skyGradient)" />
                        <rect x="0" y="0" width="600" height="360" class="overcast" />
                        <circle class="sun" cx="210" cy="124" r="22" />
                        <circle class="moon" cx="220" cy="128" r="18" />
                        <g class="clouds">
                            <path
                                d="M70 160c-22 0-40-12-40-28 0-13 12-23 29-27 5-18 24-31 46-31 26 0 47 16 51 38 20 2 36 14 36 30 0 16-17 30-40 30H70Z" />
                            <path
                                d="M175 206c-18 0-33-10-33-24 0-12 10-21 24-23 4-15 18-26 36-26 20 0 36 13 38 31 15 1 27 12 27 25 0 15-15 27-33 27h-56Z" />
                            <path
                                d="M40 238c-12 0-22-7-22-16 0-7 7-13 16-14 3-11 14-19 27-19 15 0 27 10 29 24 11 1 19 9 19 19s-10 18-22 18H40Z" />
                        </g>
                        <g class="hills">
                            <path class="hill hill--back"
                                d="M0 268c60-18 98-34 140-40 55-9 98 13 142 20 60 10 100-10 150-22 30-7 54-8 68-4v98H0v-52Z" />
                            <path class="hill hill--front"
                                d="M0 292c70-26 118-30 168-24 56 7 102 24 148 26 64 2 114-26 168-36 24-5 40-4 52 0v102H0v-68Z" />
                        </g>
                    </g>
                    <polyline class="window-line" points="58,112 250,92 250,252 58,276 58,112" />
                    <line class="window-line" x1="154" y1="102" x2="154" y2="266" />
                    <line class="window-line" x1="58" y1="172" x2="250" y2="156" />
                    <polyline class="window-sill" points="40,292 264,266 300,270" />
                    <polyline class="window-sill window-sill--shadow" points="40,304 265,276 304,281" />
                </g>

                <g class="lamp-light" :style="{ opacity: String(Number(lampLevel) || 0) }">
                    <path class="lamp-wall-glow" d="M350 70 L600 0 L600 280 L350 300 Z" />
                    <path class="lamp-floor-glow" d="M0 360 L350 300 L600 280 L600 360 Z" />
                </g>

                <g class="lamp-group">
                    <ellipse class="lamp-shadow" cx="455" cy="292" rx="54" ry="16" />
                    <ellipse class="lamp-base" cx="455" cy="292" rx="38" ry="12" />
                    <rect class="lamp-stem" x="448" y="150" width="14" height="142" rx="6" />
                    <path class="lamp-shade"
                        d="M420 96 L490 88 C505 118 505 148 490 168 L420 176 C405 148 405 118 420 96 Z" />
                    <path class="lamp-shade-inner"
                        d="M426 110 L484 104 C494 124 494 142 484 158 L426 164 C416 144 416 126 426 110 Z" />
                    <line class="lamp-line" x1="455" y1="176" x2="455" y2="292" />
                </g>
            </svg>
        </div>

        <label class="control">
            <span class="control__label">Ясный день → Пасмурно → Вечер</span>
            <input v-model.number="slider" type="range" min="0" max="100" step="1" class="control__range"
                aria-label="Погодный ползунок" list="adaptive-light-demo-marks" />
            <datalist id="adaptive-light-demo-marks">
                <option value="0" label="День" />
                <option value="50" label="Пасмурно" />
                <option value="100" label="Вечер" />
            </datalist>
        </label>
    </section>
</template>

<style scoped>
.adaptive-demo {
    border-radius: 16px;
    background: linear-gradient(180deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.02));
    border: 1px solid rgba(148, 163, 184, 0.35);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.adaptive-demo__head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
}

.adaptive-demo__title {
    margin: 0;
    font-size: 15px;
    color: #0f172a;
    font-weight: 800;
}

.adaptive-demo__hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: #64748b;
}

.adaptive-demo__state {
    font-size: 12px;
    font-weight: 700;
    color: #0f172a;
    background: rgba(255, 255, 255, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.3);
    padding: 6px 10px;
    border-radius: 999px;
    white-space: nowrap;
}

.scene {
    width: 100%;
    height: clamp(220px, 40vh, 360px);
    border-radius: 14px;
    overflow: hidden;
    background: #fdfdfd;
    border: 1px solid rgba(15, 23, 42, 0.12);
}

.scene-svg {
    display: block;
    width: 100%;
    height: 100%;
}

.wall-fill {
    fill: #ffffff;
}

.wall-fill--right {
    fill: #f7f8fb;
}

.floor-fill {
    fill: #f3f4f6;
}

.room-line {
    fill: none;
    stroke: #0f172a;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.room-line--corner {
    stroke-width: 3.4;
}

.window-frame-outer {
    fill: none;
    stroke: #0f172a;
    stroke-width: 3.2;
    stroke-linejoin: round;
}

.window-reveal {
    fill: rgba(255, 255, 255, 0.85);
    stroke: rgba(15, 23, 42, 0.38);
    stroke-width: 2.2;
    stroke-linejoin: round;
}

.window-line {
    stroke: #0f172a;
    stroke-width: 2.6;
    stroke-linecap: round;
}

.window-sill {
    fill: none;
    stroke: #0f172a;
    stroke-width: 2.8;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.window-sill--shadow {
    stroke: rgba(15, 23, 42, 0.18);
    stroke-width: 2.2;
}

.sun {
    fill: #ffd166;
    opacity: var(--sun-opacity);
    filter: drop-shadow(0 0 10px rgba(255, 209, 102, 0.45));
}

.moon {
    fill: rgba(241, 245, 249, 0.95);
    opacity: var(--moon-opacity);
    filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.18));
}

.clouds {
    fill: rgba(248, 250, 252, 0.96);
    opacity: var(--cloud-opacity);
    transform-origin: 160px 160px;
    transform: scale(var(--cloud-scale));
    filter: drop-shadow(0 10px 14px rgba(2, 6, 23, 0.12));
}

.overcast {
    fill: rgba(241, 245, 249, 0.92);
    opacity: var(--overcast-opacity);
    mix-blend-mode: screen;
}

.hills {
    filter: saturate(var(--land-sat)) brightness(var(--land-bright)) contrast(1.06);
}

.hill--back {
    fill: var(--land-back);
    opacity: 0.95;
}

.hill--front {
    fill: var(--land-front);
    opacity: 0.98;
}

.lamp-wall-glow {
    fill: url(#lampWallGlow);
}

.lamp-floor-glow {
    fill: url(#lampFloorGlow);
}

.lamp-group {
    stroke: rgba(15, 23, 42, 0.9);
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
}

.lamp-shadow {
    fill: rgba(15, 23, 42, 0.14);
    stroke: rgba(15, 23, 42, 0);
}

.lamp-base,
.lamp-stem,
.lamp-shade {
    fill: rgba(255, 255, 255, 0.92);
}

.lamp-shade-inner {
    fill: rgba(var(--lamp-rgb), 0.18);
    opacity: var(--lamp-glow);
}

.lamp-line {
    stroke-width: 3.6;
}

.room-dim {
    opacity: calc(var(--room-overlay) * 0.8);
    mix-blend-mode: multiply;
}

.room-dim polygon {
    fill: rgba(15, 23, 42, 0.28);
}

.control {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.control__label {
    font-size: 12px;
    color: #334155;
    font-weight: 650;
}

.control__range {
    width: 100%;
    accent-color: #2563eb;
}

@media (prefers-reduced-motion: reduce) {
    .clouds {
        transition: none;
    }

    .sun,
    .moon,
    .overcast,
    .lamp-light,
    .lamp-shade-inner,
    .room-dim {
        transition: none;
    }
}
</style>
