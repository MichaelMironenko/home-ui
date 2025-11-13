<script setup>
import { computed } from 'vue'

const props = defineProps({
    label: { type: String, required: true },
    unit: { type: String, default: '' },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    step: { type: Number, default: 1 },
    value: { type: Number, required: true },
    displayValue: { type: [String, Number], required: true },
    fillPercent: { type: Number, default: 0 },
    targetPercent: { type: Number, default: null },
    disabled: { type: Boolean, default: false },
    quickIncreaseDisabled: { type: Boolean, default: false },
    quickDecreaseDisabled: { type: Boolean, default: false },
    increaseLabel: { type: String, default: 'Больше' },
    decreaseLabel: { type: String, default: 'Меньше' },
    increaseIcon: { type: String, default: '+' },
    decreaseIcon: { type: String, default: '−' },
    trackClass: { type: [String, Array, Object], default: '' },
    fillClass: { type: [String, Array, Object], default: '' },
    sliderClass: { type: [String, Array, Object], default: '' },
    fillGradient: { type: String, default: '' }
})

const emit = defineEmits([
    'pointerdown',
    'pointerup',
    'pointercancel',
    'input',
    'change',
    'quick-plus',
    'quick-minus'
])

function handleInput(event) {
    const value = Number(event.target.value)
    emit('input', Number.isFinite(value) ? value : props.value)
}

const fillStyle = computed(() => {
    const style = { height: `${props.fillPercent}%` }
    if (typeof props.fillGradient === 'string' && props.fillGradient.trim()) {
        style.background = props.fillGradient
        return style
    }
    const className = typeof props.fillClass === 'string' ? props.fillClass : ''
    if (className === 'tuning-slider__fill--brightness') {
        style.background = 'linear-gradient(180deg, #ffffff 0%, #111827 100%)'
    } else if (className === 'tuning-slider__fill--cct') {
        style.background = 'linear-gradient(180deg, #38bdf8 0%, #fb923c 100%)'
    }
    return style
})

function handleChange(event) {
    const value = Number(event.target.value)
    emit('change', Number.isFinite(value) ? value : props.value)
}
</script>

<template>
    <div class="tuning-column">
        <button
            type="button"
            class="tuning-step"
            :disabled="disabled || quickIncreaseDisabled"
            @click="$emit('quick-plus')"
            :aria-label="increaseLabel"
        >
            <span class="tuning-icon" aria-hidden="true">{{ increaseIcon }}</span>
        </button>

        <div class="tuning-slider">
            <div class="tuning-slider__track" :class="trackClass">
                <div
                    v-if="targetPercent != null"
                    class="tuning-slider__marker"
                    :style="{ bottom: `${targetPercent}%` }"
                ></div>
                <div
                    class="tuning-slider__fill"
                    :class="fillClass"
                    :style="fillStyle"
                ></div>
            </div>
            <input
                type="range"
                :min="min"
                :max="max"
                :step="step"
                class="tuning-slider__input"
                :class="sliderClass"
                :value="value"
                :disabled="disabled"
                @pointerdown="$emit('pointerdown')"
                @pointerup="$emit('pointerup')"
                @pointercancel="$emit('pointercancel')"
                @input="handleInput"
                @change="handleChange"
            />
        </div>

        <button
            type="button"
            class="tuning-step"
            :disabled="disabled || quickDecreaseDisabled"
            @click="$emit('quick-minus')"
            :aria-label="decreaseLabel"
        >
            <span class="tuning-icon" aria-hidden="true">{{ decreaseIcon }}</span>
        </button>

        <div class="tuning-readout">
            <span>{{ label }}</span>
            <strong>
                {{ displayValue }}<template v-if="unit"> {{ unit }}</template>
            </strong>
        </div>
    </div>
</template>


<style scoped>
.tuning-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: linear-gradient(145deg, rgba(248, 250, 252, 0.92), rgba(241, 245, 249, 0.92));
    border-radius: 18px;
    border: 1px solid rgba(203, 213, 225, 0.6);
    position: relative;
}

.tuning-step {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #38bdf8, #6366f1);
    color: #fff;
    font-size: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 10px 18px rgba(99, 102, 241, 0.25);
    transition: transform .15s ease, box-shadow .15s ease;
}

.tuning-step:disabled {
    background: rgba(148, 163, 184, 0.3);
    color: #64748b;
    cursor: not-allowed;
    box-shadow: none;
}

.tuning-step:not(:disabled):hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 20px rgba(79, 70, 229, 0.28);
}

.tuning-slider {
    --slider-length: 240px;
    --slider-thickness: 64px;
    position: relative;
    height: var(--slider-length);
    min-height: var(--slider-length);
    width: var(--slider-thickness);
    display: flex;
    align-items: center;
    justify-content: center;
}

.tuning-slider__input {
    writing-mode: bt-lr;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    width: var(--slider-length);
    height: var(--slider-thickness);
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-90deg);
    transform-origin: center;
    z-index: 2;
}

.tuning-slider__input:disabled {
    opacity: 0.5;
}

.tuning-slider__input:focus {
    outline: none;
}

.tuning-slider__input::-webkit-slider-runnable-track {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: transparent;
}

.tuning-slider__input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.8);
    border: 2px solid rgba(30, 64, 175, 0.85);
    box-shadow: 0 6px 12px rgba(15, 23, 42, 0.2);
}

.tuning-slider__input::-moz-range-track {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: transparent;
}

.tuning-slider__input::-moz-range-thumb {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.8);
    border: 2px solid rgba(30, 64, 175, 0.85);
    box-shadow: 0 6px 12px rgba(15, 23, 42, 0.2);
}

.tuning-slider__track {
    position: absolute;
    width: 22px;
    height: 100%;
    border-radius: 999px;
    background: #e2e8f0;
    overflow: hidden;
    z-index: 1;
}

.tuning-slider__track--brightness {
    background: linear-gradient(180deg, rgba(254, 243, 199, 0.85), rgba(252, 211, 77, 0.85));
}

.tuning-slider__track--cct {
    background: linear-gradient(180deg, rgba(96, 165, 250, 0.35), rgba(253, 230, 138, 0.6));
}

.tuning-slider__fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
}

.tuning-slider__fill--brightness {
    background: linear-gradient(0deg, rgba(253, 186, 116, 0.9), rgba(251, 146, 60, 0.9));
}

.tuning-slider__fill--cct {
    display: none;
}

.tuning-slider__marker {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: repeating-linear-gradient(90deg, rgba(59, 130, 246, 0.7), rgba(59, 130, 246, 0.7) 4px, transparent 4px, transparent 8px);
    pointer-events: none;
}

.tuning-icon {
    font-size: 20px;
    line-height: 1;
}

.tuning-readout {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: #334155;
}

.tuning-readout strong {
    font-size: 20px;
    font-weight: 700;
    color: #0f172a;
}
</style>
