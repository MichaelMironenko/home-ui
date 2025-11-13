// sunCalc.js — вычисление времени восхода/заката для фронтенда (порт из backend/sun.js)

const PI = Math.PI
const RAD = PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545

const toJulian = (ms) => ms / DAY_MS - 0.5 + J1970
const fromJulian = (j) => new Date((j - J1970 + 0.5) * DAY_MS)
const toDays = (ms) => toJulian(ms) - J2000

function rightAscension(l, b) {
  const e = RAD * 23.4397
  return Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
}

function declination(l, b) {
  const e = RAD * 23.4397
  return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
}

function solarMeanAnomaly(d) {
  return RAD * (357.5291 + 0.98560028 * d)
}

function eclipticLongitude(M) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const P = RAD * 102.9372
  return M + C + P + PI
}

function sunCoords(d) {
  const M = solarMeanAnomaly(d)
  const L = eclipticLongitude(M)
  return { dec: declination(L, 0), ra: rightAscension(L, 0) }
}

const J0 = 0.0009

function siderealTime(d, lw) {
  return RAD * (280.16 + 360.9856235 * d) - lw
}

function hourAngle(h, phi, d) {
  const x = (Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d))
  const clamped = Math.max(-1, Math.min(1, x))
  return Math.acos(clamped)
}

function julianCycle(d, lw) {
  return Math.round(d - J0 - lw / (2 * PI))
}

function approxTransit(Ht, lw, n) {
  return J0 + (Ht - lw) / (2 * PI) + n
}

function solarTransitJ(ds, M, L) {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
}

function getSetJ(h, lw, phi, dec, n, M, L, rising) {
  const w = hourAngle(h, phi, dec)
  const a = rising ? J0 - (w + lw) / (2 * PI) + n : J0 + (w - lw) / (2 * PI) + n
  return solarTransitJ(a, M, L)
}

function localNoonUtc(tz, atUtcDate) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const [y, m, d] = fmt.format(atUtcDate).split('-').map((n) => parseInt(n, 10))
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}

function sunEventUTC(tz, baseUtcDate, latDeg, lonDeg, which) {
  const noonUtc = localNoonUtc(tz, baseUtcDate)
  const lw = lonDeg * RAD
  const phi = latDeg * RAD
  const d = toDays(noonUtc.getTime())
  const n = julianCycle(d, lw)
  const ds = approxTransit(0, lw, n)
  const M = solarMeanAnomaly(ds)
  const L = eclipticLongitude(M)
  const dec = declination(L, 0)
  const h0 = -0.833 * RAD
  const J = getSetJ(h0, lw, phi, dec, n, M, L, which === 'rise')
  return fromJulian(J)
}

export function sunriseUTC(baseUtcDate, lat, lon, tz = 'UTC') {
  return sunEventUTC(tz, baseUtcDate, lat, lon, 'rise')
}

export function sunsetUTC(baseUtcDate, lat, lon, tz = 'UTC') {
  return sunEventUTC(tz, baseUtcDate, lat, lon, 'set')
}

export function debugSunTimes(nowUtc, lat, lon, tz) {
  const sr = sunriseUTC(nowUtc, lat, lon, tz)
  const ss = sunsetUTC(nowUtc, lat, lon, tz)
  const fmt = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  return {
    nowUtc: nowUtc.toISOString(),
    sunriseUtc: sr.toISOString(),
    sunsetUtc: ss.toISOString(),
    sunriseLocal: fmt.format(sr),
    sunsetLocal: fmt.format(ss)
  }
}
