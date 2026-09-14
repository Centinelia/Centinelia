/**
 * Test utilities para portal API routes.
 *
 * Fixtures y builders reutilizables para tests que atacan handlers wrappeados
 * en `withPortalAuth`. Se usa así:
 *
 *   const { mockSupabase, mocks } = setupMocks();
 *   mocks.session.mockResolvedValue(fixtureOwnerSession());
 *   mocks.resolveOrg.mockResolvedValue(fixtureResolvedOrg());
 *   mocks.agent.mockResolvedValue({ data: fixtureAgent(), error: null });
 *
 *   const res = await POST(makeReq({ action: 'pause' }), { params: makeParams({ id: 'a1' }) });
 *
 * IMPORTANTE: `setupMocks()` DEBE llamarse ANTES de importar el route handler,
 * porque las mocks se hoistean pero los imports del handler capturan las refs
 * en tiempo de import. Ver route.test.ts existentes para el patrón.
 */

import { vi, type MockedFunction } from 'vitest';
import { NextRequest } from 'next/server';
import type { ResolvedOrg } from '@/lib/portal/org-token';

// ─── Fixtures ────────────────────────────────────────────────────────────────

export const TEST_PORTAL_EMAIL = 'test-org@centinelia.mx';
export const TEST_ORG_TOKEN    = 'test-org-token-abc';
export const TEST_AGENT_ID     = 'agent-uuid-1';
export const TEST_LEGACY_TOKEN = 'legacy-per-agent-token-xyz';

export function fixtureOwnerSession(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    portalEmail: TEST_PORTAL_EMAIL,
    isSubUser:   false,
    ...overrides,
  };
}

export function fixtureSubUserSession(modules: string[] = []): SessionResult {
  return {
    portalEmail: TEST_PORTAL_EMAIL,
    isSubUser:   true,
    userId:      'sub-user-1',
    modules,
  };
}

export function fixtureResolvedOrg(overrides: Partial<ResolvedOrg> = {}): ResolvedOrg {
  return {
    portalEmail: TEST_PORTAL_EMAIL,
    orgToken:    TEST_ORG_TOKEN,
    legacy:      false,
    ...overrides,
  };
}

export function fixtureAgent(overrides: Record<string, unknown> = {}) {
  return {
    id:                    TEST_AGENT_ID,
    portal_email:          TEST_PORTAL_EMAIL,
    portal_token:          TEST_LEGACY_TOKEN,
    active:                true,
    client_paused:         false,
    billing_status:        'active',
    phone_number:          '+528118000000',
    vapi_agent_id:         'vapi-1',
    features:              { meerkat_role_id: 'nia' },
    tool_overrides:        null,
    heartbeat_config:      { enabled: false },
    heartbeat_last_run_at: null,
    ai_ops_used:           0,
    ai_ops_limit:          100,
    minutes_reset_date:    '2026-10-01',
    ...overrides,
  };
}

// ─── Types re-exported from auth for convenience ────────────────────────────

export interface SessionResult {
  portalEmail: string;
  isSubUser:   boolean;
  userId?:     string;
  modules?:    string[];
}

// ─── Chainable Supabase builder ─────────────────────────────────────────────

/**
 * Construye un mock de PostgREST que responde a cadenas típicas:
 *   .from(t).select(cols).eq(k,v).eq(k,v).maybeSingle() → { data, error }
 *   .from(t).update({...}).eq(k,v).eq(k,v) → { error }
 *
 * Uso:
 *   const mockAgent = fixtureAgent();
 *   supabase.setNextResult({ data: mockAgent, error: null });
 *   supabase.setNextResult({ error: null }); // para el UPDATE siguiente
 *
 * Los mocks se consumen en orden — cada terminal (`maybeSingle`, `single`,
 * o el propio await del update) toma el siguiente resultado del queue.
 */
export interface SupabaseMock {
  from: MockedFunction<(table: string) => ChainableMock>;
  /** Encola un resultado que consumirá el próximo terminal de PostgREST. */
  setNextResult: (result: { data?: unknown; error?: unknown }) => void;
  /** Encola varios en orden. */
  setResults: (results: Array<{ data?: unknown; error?: unknown }>) => void;
  /** Historial de invocaciones a from/update/etc para asserts. */
  history:  QueryCall[];
}

export interface QueryCall {
  table:  string;
  op:     'select' | 'update' | 'insert' | 'delete';
  args?:  unknown;
  eq:     Array<[string, unknown]>;
  neq:    Array<[string, unknown]>;
  in:     Array<[string, unknown[]]>;
  order?: [string, { ascending: boolean }];
  limit?: number;
}

interface ChainableMock {
  select: (cols?: string) => ChainableMock;
  update: (data: unknown) => ChainableMock;
  insert: (data: unknown) => ChainableMock;
  delete: () => ChainableMock;
  eq:     (k: string, v: unknown) => ChainableMock;
  neq:    (k: string, v: unknown) => ChainableMock;
  in:     (k: string, v: unknown[]) => ChainableMock;
  order:  (k: string, opts?: { ascending: boolean }) => ChainableMock;
  limit:  (n: number) => ChainableMock;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single:      () => Promise<{ data: unknown; error: unknown }>;
  then: <TR>(onfulfilled: (v: { data: unknown; error: unknown }) => TR) => Promise<TR>;
}

export function createSupabaseMock(): SupabaseMock {
  const results:  Array<{ data?: unknown; error?: unknown }> = [];
  const history:  QueryCall[] = [];

  const consumeResult = () => {
    const r = results.shift();
    return { data: r?.data ?? null, error: r?.error ?? null };
  };

  const from = vi.fn((table: string): ChainableMock => {
    const call: QueryCall = { table, op: 'select', eq: [], neq: [], in: [] };
    history.push(call);

    const chain: ChainableMock = {
      select: (cols?: string) => { call.op = 'select'; call.args = cols; return chain; },
      update: (data: unknown) => { call.op = 'update'; call.args = data; return chain; },
      insert: (data: unknown) => { call.op = 'insert'; call.args = data; return chain; },
      delete: () => { call.op = 'delete'; return chain; },
      eq:  (k, v) => { call.eq.push([k, v]);  return chain; },
      neq: (k, v) => { call.neq.push([k, v]); return chain; },
      in:  (k, v) => { call.in.push([k, v]);  return chain; },
      order: (k, opts) => { call.order = [k, opts ?? { ascending: true }]; return chain; },
      limit: (n)     => { call.limit = n; return chain; },
      maybeSingle: async () => consumeResult(),
      single:      async () => consumeResult(),
      then:  <TR>(onfulfilled: (v: { data: unknown; error: unknown }) => TR) => {
        // Update/delete se resuelven con `await query...` sin .single()
        return Promise.resolve(consumeResult()).then(onfulfilled);
      },
    };
    return chain;
  });

  return {
    from: from as unknown as SupabaseMock['from'],
    setNextResult: (r) => results.push(r),
    setResults:    (rs) => rs.forEach(r => results.push(r)),
    history,
  };
}

// ─── Request/Params builders ─────────────────────────────────────────────────

export function makeJsonRequest(
  body: unknown,
  {
    path    = '/api/test',
    method  = 'POST',
    cookies = { Centinelia_portal: 'valid-cookie' },
  }: { path?: string; method?: string; cookies?: Record<string, string> } = {},
): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const upper = method.toUpperCase();
  const bodyless = upper === 'GET' || upper === 'HEAD';
  return new NextRequest(`http://localhost${path}`, {
    method: upper,
    headers: {
      'content-type': 'application/json',
      cookie:         cookieHeader,
    },
    body: bodyless ? undefined : JSON.stringify(body),
  });
}

export function makeGetRequest(
  path = '/api/test',
  cookies: Record<string, string> = { Centinelia_portal: 'valid-cookie' },
): NextRequest {
  return makeJsonRequest(null, { path, method: 'GET', cookies });
}

export function makeParams(p: Record<string, string>): Promise<Record<string, string>> {
  return Promise.resolve(p);
}
