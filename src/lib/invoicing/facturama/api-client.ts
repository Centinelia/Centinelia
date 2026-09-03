// HTTP wrapper para Facturama REST API.
// Auth: Basic (usuario Facturama:contraseña Facturama de la cuenta).
// Base URL cambia sandbox/prod.

const BASE_URL = {
  sandbox: process.env.FACTURAMA_ENDPOINT_SANDBOX ?? 'https://apisandbox.facturama.mx',
  prod:    process.env.FACTURAMA_ENDPOINT_PROD    ?? 'https://api.facturama.mx',
};

export function baseUrl(testMode: boolean): string {
  return testMode ? BASE_URL.sandbox : BASE_URL.prod;
}

export function basicAuthHeader(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

export interface FacturamaResponse {
  status: number;
  json: unknown;
  raw: string;
}

export async function facturamaJsonCall(
  url: string,
  method: string,
  auth: string,
  body?: unknown,
  timeoutMs = 30000,
): Promise<FacturamaResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
        'Authorization': auth,
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(raw); } catch { /* not json */ }
    return { status: res.status, json: parsed, raw };
  } finally { clearTimeout(t); }
}

export async function facturamaFetchBuffer(
  url: string,
  auth: string,
  timeoutMs = 30000,
): Promise<{ status: number; buffer: Buffer; contentType: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': auth },
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buffer: buf, contentType: res.headers.get('content-type') ?? '' };
  } finally { clearTimeout(t); }
}

/**
 * Descarga PDF timbrado desde Facturama.
 * Facturama devuelve el PDF como binario si Accept es application/pdf,
 * o como base64 dentro de JSON si Accept es application/json.
 * Aquí pedimos application/pdf directo — mucho más simple.
 */
export async function facturamaFetchPdf(
  facturamaId: string, auth: string, testMode: boolean, timeoutMs = 30000,
): Promise<Buffer> {
  const url = `${baseUrl(testMode)}/cfdi/pdf/issued/${facturamaId}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': auth, 'Accept': 'application/pdf' },
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status !== 200) {
      throw new Error(`Facturama GET pdf (${res.status}): ${buf.toString('utf8').slice(0, 300)}`);
    }
    // Si Facturama devolvió JSON base64, decodificar:
    const asStr = buf.toString('utf8').trimStart();
    if (asStr.startsWith('{')) {
      const parsed = JSON.parse(asStr) as { Content?: string; content?: string };
      const b64 = parsed.Content ?? parsed.content;
      if (b64) return Buffer.from(b64, 'base64');
    }
    // Si empieza con %PDF-, es binario ya
    return buf;
  } finally { clearTimeout(t); }
}
