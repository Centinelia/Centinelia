import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite, AuthConfig, EnvelopeConfig } from './types';
import { resolveSecretByKey } from './secrets';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const TIMEOUT_MS = 10_000;
const RATE_LIMIT_BACKOFF_MS = 2_500;

function isEnvelopeRateLimit(body: unknown, envelope: EnvelopeConfig | null | undefined): boolean {
  if (!envelope?.rate_limit_message_prefix) return false;
  if (!body || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  if (record[envelope.success_field] !== false) return false;
  const messageField = envelope.message_field ?? 'mensaje';
  const message = record[messageField];
  return typeof message === 'string' && message.startsWith(envelope.rate_limit_message_prefix);
}

async function buildAuthHeaders(
  portalEmail: string,
  auth:        AuthConfig,
  supabase:    SupabaseClient,
): Promise<Record<string, string>> {
  if (auth.type === 'none') return {};
  if (auth.type === 'bearer') {
    const token = auth.secret_key ? await resolveSecretByKey(portalEmail, auth.secret_key, supabase) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  if (auth.type === 'api_key_header') {
    const token = auth.secret_key ? await resolveSecretByKey(portalEmail, auth.secret_key, supabase) : null;
    if (!token || !auth.header_name) return {};
    return { [auth.header_name]: token };
  }
  if (auth.type === 'api_key_dual_header') {
    if (!auth.secret_key || !auth.header_name || !auth.secret_key_2 || !auth.header_name_2) return {};
    const [k1, k2] = await Promise.all([
      resolveSecretByKey(portalEmail, auth.secret_key, supabase),
      resolveSecretByKey(portalEmail, auth.secret_key_2, supabase),
    ]);
    if (!k1 || !k2) return {};
    return { [auth.header_name]: k1, [auth.header_name_2]: k2 };
  }
  // oauth_client_credentials: no implementado en Fase 1
  return {};
}

async function fetchWithTimeout(
  url:  string,
  init: RequestInit,
  ms:   number,
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body, timedOut: false };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { status: 0, body: null, timedOut: true };
    return { status: 0, body: { error: (err as Error).message }, timedOut: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Llama a un endpoint del trámite. Aplica auth, timeout 10s, y 1 reintento
 * con backoff exponencial en 5xx / timeout.
 */
export async function callTramiteEndpoint(
  tramite: Tramite,
  pathAndQuery: string,
  opts: { method: 'GET' | 'POST' | 'PUT'; body?: unknown },
  supabase: SupabaseClient,
): Promise<{ status: number; body: unknown; timedOut: boolean }> {
  const url = tramite.endpoint_base.replace(/\/$/, '') + pathAndQuery;
  const authHeaders = await buildAuthHeaders(tramite.portal_email, tramite.auth_config, supabase);
  const init: RequestInit = {
    method: opts.method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  };

  let result = await fetchWithTimeout(url, init, TIMEOUT_MS);
  const transportRetry = result.timedOut || (result.status >= 500 && result.status < 600);
  if (transportRetry) {
    await new Promise(r => setTimeout(r, 500));
    result = await fetchWithTimeout(url, init, TIMEOUT_MS);
  } else if (isEnvelopeRateLimit(result.body, tramite.response_envelope)) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
    result = await fetchWithTimeout(url, init, TIMEOUT_MS);
  }
  return result;
}
