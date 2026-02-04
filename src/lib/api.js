import { trackFunctionCall } from './requestMetrics';

let cfg = null;
let pendingConfig = null;

async function requestConfig() {
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `config.json request failed (${res.status})`);
  }
  const data = await res.json();
  cfg = data || {};
  return cfg;
}

export async function getConfig(force = false) {
  if (!force && cfg) return cfg;
  if (!force && pendingConfig) return pendingConfig;
  const promise = requestConfig();
  if (!force) {
    pendingConfig = promise.then(
      (value) => {
        pendingConfig = null;
        return value;
      },
      (err) => {
        pendingConfig = null;
        throw err;
      }
    );
    return pendingConfig;
  }
  return promise;
}

export async function callPresence(status, device = 'UI') {
  const c = await getConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (c.keyHeader && c.keyValue) headers[c.keyHeader] = c.keyValue;
  const normalizedDevice = String(device || 'UI').toLowerCase();
  const normalizedStatus = String(status || '').toLowerCase();
  const body = JSON.stringify({ device: normalizedDevice, status: normalizedStatus, ts: new Date().toISOString() });
  trackFunctionCall();
  const r = await fetch(c.presUrl, { method: 'POST', headers, body });
  return { status: r.status, text: await r.text() };
}

export async function runAutoLight(query = '') {
  const c = await getConfig();
  const headers = {};
  if (c.keyHeader && c.keyValue) headers[c.keyHeader] = c.keyValue;
  trackFunctionCall();
  const r = await fetch(c.autoUrl + query, { headers });
  return { status: r.status, text: await r.text() };
}
