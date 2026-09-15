/**
 * Tests de comportamiento para GET /api/auth/meta-callback
 *
 * Cubre cuatro escenarios:
 *   A) Camino feliz: 1 página con IG Business Account → 1 row en social_accounts
 *   B) 2 páginas, solo 1 con IG Business → solo 1 row insertado
 *   C) Nonce no existe en cookie → csrf_nonce redirect, sin rows insertados
 *   D) Nonce alterado (tampering) → csrf_nonce redirect, sin rows insertados
 *
 * Supabase mockeado en memoria (sin hit real a DB).
 * Las 4 llamadas al Graph API de Meta mockeadas vía global.fetch.
 * verifySession mockeado para simular sesión autenticada.
 * verifyOAuthState NO es mockeado — corre código real para probar la defensa CSRF.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockVerifySession,
  mockResolveOrg,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockVerifySession:     vi.fn(),
  mockResolveOrg:        vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/org-token', () => ({
  resolveOrgFromToken: mockResolveOrg,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

// Importar después de los mocks
import { GET } from '../meta-callback/route';

// ─── Constantes de test ───────────────────────────────────────────────────────

const TEST_PORTAL_EMAIL = 'nazre20+navi-meta-test@gmail.com';
const TEST_ORG_TOKEN    = 'test-org-meta-abc';
const TEST_AGENT_ID     = 'agent-uuid-meta-001';
const APP_URL           = 'https://www.centinelia.mx';

const META_APP_ID     = 'test-meta-app-id';
const META_APP_SECRET = 'test-meta-app-secret';

// ─── Fixtures de respuesta del Graph API ──────────────────────────────────────

const SHORT_TOKEN_RESPONSE = { access_token: 'short_lived_token_xyz' };
const LONG_TOKEN_RESPONSE  = { access_token: 'long_lived_token_abc' };

function makePage(id: string, igUserId?: string) {
  return {
    id,
    name:         `Página Test ${id}`,
    access_token: `page_token_${id}`,
    ...(igUserId
      ? { instagram_business_account: { id: igUserId } }
      : {}),
  };
}

function makeIgInfo(username: string) {
  return { username };
}

// ─── Helpers de supabase mock ─────────────────────────────────────────────────

interface UpsertCall {
  table: string;
  data:  unknown;
  opts:  unknown;
}

function createSupabaseMockWithUpsert() {
  const results:   Array<{ data?: unknown; error?: unknown }> = [];
  const upsertLog: UpsertCall[] = [];

  const consumeResult = () => {
    const r = results.shift();
    return { data: r?.data ?? null, error: r?.error ?? null };
  };

  const from = vi.fn((table: string) => {
    // Cadena fluida — todos los métodos de filtro devuelven la misma cadena.
    const chain: Record<string, unknown> = {};

    chain.select      = (_c?: string)              => chain;
    chain.eq          = (_k: string, _v: unknown)  => chain;
    chain.maybeSingle = async () => consumeResult();
    chain.single      = async () => consumeResult();
    chain.upsert      = (data: unknown, opts?: unknown) => {
      upsertLog.push({ table, data, opts });
      return {
        then: <TR>(fn: (v: { data: unknown; error: unknown }) => TR) =>
          Promise.resolve({ data: null, error: null }).then(fn),
      };
    };
    chain.then = <TR>(fn: (v: { data: unknown; error: unknown }) => TR) =>
      Promise.resolve(consumeResult()).then(fn);

    return chain;
  });

  return {
    from,
    setNextResult: (r: { data?: unknown; error?: unknown }) => results.push(r),
    getUpsertLog:  () => upsertLog,
  };
}

// ─── Helper de fetch mock ─────────────────────────────────────────────────────

/**
 * Construye un mock de `global.fetch` que responde a las 4 URLs del flujo Meta.
 * Orden de llamadas:
 *   1. short-lived token exchange
 *   2. long-lived token exchange
 *   3. /me/accounts (lista páginas)
 *   4. /:igUserId?fields=username (por cada página con IG Business)
 */
function makeFetch(pages: ReturnType<typeof makePage>[], igUsernames: Record<string, string>) {
  const responses: Array<{ data: unknown }> = [
    { data: SHORT_TOKEN_RESPONSE },
    { data: LONG_TOKEN_RESPONSE },
    { data: { data: pages } },
    // Los usernames se agregan abajo por página con IG business
    ...pages
      .filter(p => p.instagram_business_account)
      .map(p => ({
        data: makeIgInfo(igUsernames[p.instagram_business_account!.id] ?? 'ig_user'),
      })),
  ];

  let callIndex = 0;
  return vi.fn((_url: string) => {
    const r = responses[callIndex++] ?? { data: {} };
    return Promise.resolve({
      ok:   true,
      json: () => Promise.resolve(r.data),
    });
  });
}

// ─── Helper de request ────────────────────────────────────────────────────────

function makeCallbackRequest(opts: {
  code?:       string;
  nonce?:      string;
  cookieNonce?: string;
  token?:      string;
  agentId?:    string;
}) {
  const nonce       = opts.nonce    ?? randomBytes(24).toString('base64url');
  const token       = opts.token    ?? TEST_ORG_TOKEN;
  const agentId     = opts.agentId  ?? TEST_AGENT_ID;
  const code        = opts.code     ?? 'meta-auth-code-xyz';
  const cookieNonce = opts.cookieNonce ?? nonce;

  const portalToken = `${token}::navi-meta::${agentId}`;
  const state       = `${portalToken}.${nonce}`;
  const cookieValue = `navi-meta:${cookieNonce}`;

  const url = `${APP_URL}/api/auth/meta-callback?code=${code}&state=${encodeURIComponent(state)}`;
  return new NextRequest(url, {
    headers: {
      cookie: `Centinelia_portal=valid-session; oauth_state=${cookieValue}`,
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/auth/meta-callback', () => {
  let supabase: ReturnType<typeof createSupabaseMockWithUpsert>;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
    vi.stubEnv('META_APP_ID',         META_APP_ID);
    vi.stubEnv('META_APP_SECRET',     META_APP_SECRET);
    vi.stubEnv('NODE_ENV',            'production');

    originalFetch = global.fetch;

    supabase = createSupabaseMockWithUpsert();
    mockCreateAdminClient.mockReturnValue(supabase);

    mockVerifySession.mockResolvedValue({
      portalEmail: TEST_PORTAL_EMAIL,
      isSubUser:   false,
    });

    mockResolveOrg.mockResolvedValue({
      portalEmail: TEST_PORTAL_EMAIL,
      orgToken:    TEST_ORG_TOKEN,
      legacy:      false,
    });

    // IDOR check → agente existe
    supabase.setNextResult({ data: { id: TEST_AGENT_ID }, error: null });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  // ─── (A) 1 página con IG Business → 1 row en social_accounts ─────────────
  it('(A) 1 página con IG Business → 302 success + 1 row en social_accounts', async () => {
    const pages = [makePage('page-001', 'ig-user-001')];
    global.fetch = makeFetch(pages, { 'ig-user-001': 'mi_tienda_mx' }) as typeof global.fetch;

    const req = makeCallbackRequest({});
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('navi=connected');
    expect(location).toContain('provider=meta');
    expect(location).toContain('pages=1');
    expect(location).toContain(`/portal/${TEST_ORG_TOKEN}/configurar/${TEST_AGENT_ID}`);

    // Debe haber exactamente 1 upsert en social_accounts
    const log = supabase.getUpsertLog();
    expect(log).toHaveLength(1);

    const upserted = log[0].data as Record<string, unknown>;
    expect(upserted.provider).toBe('meta_instagram');
    expect(upserted.external_account_id).toBe('ig-user-001');
    expect(upserted.external_username).toBe('mi_tienda_mx');
    expect(upserted.page_id).toBe('page-001');
    expect(upserted.access_token).toBe('page_token_page-001');
    expect(upserted.portal_email).toBe(TEST_PORTAL_EMAIL);
    expect(upserted.agent_id).toBe(TEST_AGENT_ID);
    expect(upserted.status).toBe('active');
  });

  // ─── (B) 2 páginas, solo 1 con IG Business → 1 row insertado ────────────
  it('(B) 2 páginas, solo 1 con IG Business → 1 row insertado en social_accounts', async () => {
    const pages = [
      makePage('page-001', 'ig-user-001'),  // tiene IG Business
      makePage('page-002'),                   // no tiene IG Business
    ];
    global.fetch = makeFetch(pages, { 'ig-user-001': 'negocio_uno' }) as typeof global.fetch;

    const req = makeCallbackRequest({});
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('pages=1'); // Solo 1 cuenta conectada

    // Solo 1 upsert (la página sin IG Business se ignora)
    const log = supabase.getUpsertLog();
    expect(log).toHaveLength(1);
    expect((log[0].data as Record<string, unknown>).external_account_id).toBe('ig-user-001');
  });

  // ─── (C) Sin cookie de nonce → csrf_nonce redirect, sin rows ─────────────
  it('(C) sin cookie de nonce → redirect a csrf_nonce, sin rows insertados', async () => {
    const nonce       = randomBytes(24).toString('base64url');
    const portalToken = `${TEST_ORG_TOKEN}::navi-meta::${TEST_AGENT_ID}`;
    const state       = `${portalToken}.${nonce}`;

    // Sin la cookie oauth_state
    const url = `${APP_URL}/api/auth/meta-callback?code=code123&state=${encodeURIComponent(state)}`;
    const req = new NextRequest(url, {
      headers: {
        cookie: 'Centinelia_portal=valid-session',
      },
    });

    // fetch no debería llamarse en el camino de error
    global.fetch = vi.fn().mockRejectedValue(new Error('fetch should not be called')) as typeof global.fetch;

    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location') ?? '').toContain('csrf_nonce');

    // Sin upserts
    expect(supabase.getUpsertLog()).toHaveLength(0);
    // fetch no se llamó
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ─── (D) Nonce alterado → csrf_nonce redirect, sin rows ──────────────────
  it('(D) nonce alterado en state → redirect a csrf_nonce, sin rows insertados', async () => {
    const realNonce    = randomBytes(24).toString('base64url');
    const tamperedNonce = randomBytes(24).toString('base64url');

    const req = makeCallbackRequest({
      nonce:       tamperedNonce,
      cookieNonce: realNonce,
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('fetch should not be called')) as typeof global.fetch;

    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location') ?? '').toContain('csrf_nonce');

    expect(supabase.getUpsertLog()).toHaveLength(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
