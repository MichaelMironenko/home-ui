import { getConfig } from '../lib/api';

let cachedBase = '';

function resolveBaseUrl(raw) {
  return (raw || '').replace(/\/+$/, '');
}

export async function ensureApiBase() {
  if (cachedBase) return cachedBase;
  const cfg = await getConfig();
  const candidate = resolveBaseUrl(
    cfg.scenariosURL ||
      cfg.scenariosUrl ||
      cfg.scenarioUrl ||
      cfg.scenariosBase ||
      cfg.api ||
      cfg.apiBase ||
      ''
  );
  if (!candidate) {
    throw new Error('scenariosURL (или api) не задан в config.json');
  }
  cachedBase = candidate;
  return cachedBase;
}
