export const deepFind = (payload, predicate) => {
  if (!payload) return null;
  const stack = [{ value: payload, key: undefined }];
  const seen = new Set();
  while (stack.length) {
    const { value, key } = stack.pop();
    const result = predicate(value, key);
    if (result !== undefined && result !== null) return result;
    if (!value || typeof value !== 'object') continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({ value: value[i], key: undefined });
      }
    } else {
      Object.keys(value).forEach((k) => {
        stack.push({ value: value[k], key: k });
      });
    }
  }
  return null;
};

export const extractBrightnessValue = (payload) =>
  deepFind(payload, (value, key) => {
    if (typeof value === 'number' && typeof key === 'string' && key.toLowerCase().includes('brightness')) {
      return value;
    }
    if (
      value &&
      typeof value === 'object' &&
      value.instance === 'brightness' &&
      typeof value.value === 'number'
    ) {
      return value.value;
    }
    return null;
  });

export const extractColorTemperature = (payload) =>
  deepFind(payload, (value, key) => {
    if (typeof value === 'number' && typeof key === 'string') {
      const lower = key.toLowerCase();
      if (lower.includes('temperature_k') || lower.includes('color_temperature') || lower === 'temperature') {
        return value;
      }
    }
    if (value && typeof value === 'object') {
      if (typeof value.temperature_k === 'number') return value.temperature_k;
      if (typeof value.color_temperature === 'number') return value.color_temperature;
      const instance = String(value.instance || '').toLowerCase();
      if ((instance === 'temperature_k' || instance === 'temperature') && typeof value.value === 'number') {
        return value.value;
      }
    }
    return null;
  });

export const extractColorHsv = (payload) => {
  const hsv = deepFind(payload, (value) => {
    if (value && typeof value === 'object') {
      if (typeof value.h === 'number' && typeof value.s === 'number' && typeof value.v === 'number') {
        return value;
      }
      if (value.state && typeof value.state === 'object') {
        const state = value.state;
        if (typeof state.h === 'number' && typeof state.s === 'number' && typeof state.v === 'number') {
          return state;
        }
      }
    }
    return null;
  });
  if (!hsv) return null;
  return {
    h: Number.isFinite(hsv.h) ? hsv.h : 0,
    s: Number.isFinite(hsv.s) ? hsv.s : 0,
    v: Number.isFinite(hsv.v) ? hsv.v : 0,
  };
};
