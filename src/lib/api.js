let cfg = null;
export async function getConfig() {
  if (cfg) return cfg;
  const res = await fetch('/config.json'); // из public/
  cfg = await res.json();
  return cfg;
}

export async function callPresence(status, device = 'UI') {
  const c = await getConfig();
  const headers = { 'Content-Type': 'application/json' };
  if (c.keyHeader && c.keyValue) headers[c.keyHeader] = c.keyValue;
  const body = JSON.stringify({ device, status, ts: new Date().toISOString() });
  const r = await fetch(c.presUrl, { method: 'POST', headers, body });
  return { status: r.status, text: await r.text() };
}

export async function runAutoLight(query = '') {
  const c = await getConfig();
  const headers = {};
  if (c.keyHeader && c.keyValue) headers[c.keyHeader] = c.keyValue;
  const r = await fetch(c.autoUrl + query, { headers });
  return { status: r.status, text: await r.text() };
}