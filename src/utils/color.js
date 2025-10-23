const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const hsvToHex = (hsv) => {
  if (!hsv) return null;
  const h = clampValue(Number(hsv.h) || 0, 0, 360);
  const s = clampValue(Number(hsv.s) || 0, 0, 100) / 100;
  const v = clampValue(Number(hsv.v) || 0, 0, 100) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  const toHex = (num) =>
    Math.round((num + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

export const rgbIntToRgb = (value) => {
  const int = Number(value);
  if (!Number.isFinite(int)) return null;
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
};

export const rgbToHex = ({ r, g, b }) => {
  const clamp255 = (num) => Math.max(0, Math.min(255, Math.round(Number(num) || 0)));
  const parts = [r, g, b].map((value) => clamp255(value).toString(16).padStart(2, '0'));
  return `#${parts.join('').toUpperCase()}`;
};

export const interpolateHue = (from, to, t) => {
  const start = Number(from) || 0;
  const end = Number(to) || 0;
  let delta = ((end - start + 540) % 360) - 180;
  return start + delta * t;
};

export const interpolateValue = (from, to, t) => {
  const start = Number(from) || 0;
  const end = Number(to) || 0;
  return start + (end - start) * t;
};

export const interpolateHsv = (from, to, t) => {
  const ratio = clampValue(t, 0, 1);
  return {
    h: clampValue(Math.round(interpolateHue(from.h, to.h, ratio)), 0, 360),
    s: clampValue(Math.round(interpolateValue(from.s, to.s, ratio)), 0, 100),
    v: clampValue(Math.round(interpolateValue(from.v, to.v, ratio)), 0, 100),
  };
};

export { clampValue as clampColorValue };
