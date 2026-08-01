import type { createAdminClient } from '@/lib/supabase/admin';
import type { Tramite, AuthConfig } from './types';
import { resolveSecretByKey } from './secrets';

type SupabaseClient = ReturnType<typeof createAdminClient>;

const TIMEOUT_MS = 10_000;

async function buildAuthHeaders(
  orgId:    string,
  auth:     AuthConfig,
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  if (auth.type === 'none') return {};
  if (auth.type === 'bearer') {
    const token = auth.secret_key ? await resolveSecretByKey(orgId, auth.secret_key, supabase) : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  if (auth.type === 'api_key_header') {
    const token = auth.secret_key ? await resolveSecretByKey(orgId, auth.secret_key, supabase) : null;
    if (!token || !auth.header_name) return {};
    return { [auth.header_name]: token };
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
  const authHeaders = await buildAuthHeaders(tramite.org_id, tramite.auth_config, supabase);
  const init: RequestInit = {
    method: opts.method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  };

  let result = await fetchWithTimeout(url, init, TIMEOUT_MS);
  const shouldRetry = result.timedOut || (result.status >= 500 && result.status < 600);
  if (shouldRetry) {
    await new Promise(r => setTimeout(r, 500));
    result = await fetchWithTimeout(url, init, TIMEOUT_MS);
  }
  return result;
}
