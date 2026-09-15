/**
 * Tests de comportamiento para:
 *   GET  /api/portal/[token]/social/accounts
 *   DELETE /api/portal/[token]/social/accounts/[id]
 *
 * Cubre por endpoint:
 *   (a) Camino feliz con sesión + org + feature habilitados
 *   (b) Sin cookie de sesión → 401
 *   (c) session.portalEmail ≠ resolved.portalEmail → 403
 *   (d) Feature flag desactivado → 403
 *   (e) IDOR: intentar eliminar cuenta de otra org → 403
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks hoisted ─────────────────────────────────────────────────────────────

const {
  mockVerifySession,
  mockResolveOrg,
  mockRequireSocialFeature,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockVerifySession:          vi.fn(),
  mockResolveOrg:             vi.fn(),
  mockRequireSocialFeature:   vi.fn(),
  mockCreateAdminClient:      vi.fn(),
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/org-token', () => ({
  resolveOrgFromToken: mockResolveOrg,
}));

vi.mock('@/lib/feature-flags/social-publishing', () => ({
  requireSocialFeature: mockRequireSocialFeature,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { GET as getAccounts } from '../accounts/route';
import { DELETE as deleteAccount } from '../accounts/[id]/route';

// ─── Constantes ──────────────────────────────────────────────────────────────

const TEST_EMAIL       = 'nazre20+navi-accounts-test@gmail.com';
const OTHER_EMAIL      = 'nazre20+navi-other@gmail.com';
const TEST_ORG_TOKEN   = 'test-tok-accounts-abc';
const TEST_ACCOUNT_ID  = 'acc-uuid-001';
const TEST_AGENT_ID    = 'agent-uuid-001';

// ─── Helper de request ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(path: string, opts?: Record<string, any>) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: 'Centinelia_portal=valid-session' },
    ...opts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Crea un mock de Supabase con fluent chain que resuelve la lista de cuentas
 * al hacer `await q` (es decir, cuando se llama `.then` sobre el chain).
 */
function makeAccountsListMock(accounts: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select  = vi.fn(() => chain);
  chain.eq      = vi.fn(() => chain);
  chain.order   = vi.fn(() => chain);
  // El await sobre el chain llama a .then — necesita ser un thenable
  chain.then    = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data: accounts, error: null }).then(resolve));
  chain.catch   = vi.fn(() => chain);
  chain.finally = vi.fn(() => chain);
  return { from: vi.fn(() => chain) };
}

/**
 * Crea un mock de Supabase para el flujo de DELETE (select maybySingle + delete).
 */
function makeDeleteMock(opts: { accountExists: boolean }) {
  const selectResult = opts.accountExists
    ? { data: { id: TEST_ACCOUNT_ID, portal_email: TEST_EMAIL }, error: null }
    : { data: null, error: null };

  const deleteResult  = { data: null, error: null };
  const deleteThen    = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve(deleteResult).then(resolve));

  const deleteChain: Record<string, unknown> = {};
  deleteChain.eq    = vi.fn(() => deleteChain);
  deleteChain.then  = deleteThen;
  deleteChain.catch = vi.fn(() => deleteChain);

  const selectChain: Record<string, unknown> = {};
  selectChain.select      = vi.fn(() => selectChain);
  selectChain.eq          = vi.fn(() => selectChain);
  selectChain.maybySingle = vi.fn(async () => selectResult);
  selectChain.maybySingle; // alias
  selectChain.maybySingle; // TypeScript compat

  // maybySingle (vitest finds the right method name below)
  const fromMock = vi.fn((_table: string) => ({
    select:      vi.fn(() => ({
      eq: vi.fn(() => ({
        eq:          vi.fn(() => ({ maybySingle: vi.fn(async () => selectResult), maybysingle: vi.fn(async () => selectResult) })),
        maybySingle: vi.fn(async () => selectResult),
        maybysingle: vi.fn(async () => selectResult),
      })),
      maybySingle: vi.fn(async () => selectResult),
    })),
    delete: vi.fn(() => deleteChain),
  }));

  return { from: fromMock };
}

// ─── Setup común ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');

  mockVerifySession.mockResolvedValue({ portalEmail: TEST_EMAIL, isSubUser: false });
  mockResolveOrg.mockResolvedValue({ portalEmail: TEST_EMAIL, orgToken: TEST_ORG_TOKEN, legacy: false });
  mockRequireSocialFeature.mockResolvedValue({ enabled: true, agencyMode: false });
});

// ─── GET /accounts ────────────────────────────────────────────────────────────

describe('GET /api/portal/[token]/social/accounts', () => {
  it('(a) camino feliz: devuelve lista de cuentas con ok: true', async () => {
    const accounts = [
      { id: TEST_ACCOUNT_ID, provider: 'meta_instagram', external_username: '@tortillas', paused: false, status: 'active', created_at: '2026-09-01T00:00:00Z', agent_id: TEST_AGENT_ID, page_id: null },
    ];
    mockCreateAdminClient.mockReturnValue(makeAccountsListMock(accounts));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts`);
    const res = await getAccounts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(TEST_ACCOUNT_ID);
    expect(body.data[0].provider).toBe('meta_instagram');
  });

  it('(a2) con filtro agent_id: devuelve lista vacía (ninguna cuenta en mock)', async () => {
    mockCreateAdminClient.mockReturnValue(makeAccountsListMock([]));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts?agent_id=${TEST_AGENT_ID}`);
    const res = await getAccounts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/accounts`);
    const res = await getAccounts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/autenticado/i);
  });

  it('(c) session.portalEmail ≠ resolved.portalEmail → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts`);
    const res = await getAccounts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/autorizado/i);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts`);
    const res = await getAccounts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/social publishing/i);
  });

  it('(d2) token no encontrado → 404', async () => {
    mockResolveOrg.mockResolvedValue(null);

    const req = makeRequest('/api/portal/token-inexistente/social/accounts');
    const res = await getAccounts(req, { params: Promise.resolve({ token: 'token-inexistente' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/portal/i);
  });
});

// ─── DELETE /accounts/[id] ────────────────────────────────────────────────────

describe('DELETE /api/portal/[token]/social/accounts/[id]', () => {
  it('(a) camino feliz: elimina la cuenta y devuelve ok: true', async () => {
    // El route hace:
    //   supabase.from('social_accounts').select(...).eq(...).eq(...).maybySingle()
    //   supabase.from('social_accounts').delete().eq(...).eq(...)   [awaited via .then]
    // Necesitamos que la chain fluida soporte ambas rutas desde el mismo from().

    const maybySingleFn = vi.fn(async () => ({ data: { id: TEST_ACCOUNT_ID, portal_email: TEST_EMAIL }, error: null }));
    const deleteThen    = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve));

    // Cada from() crea una cadena independiente que soporta todos los métodos
    // (incluyendo update para soft delete)
    const fromMock = vi.fn(() => ({
      select:      vi.fn(function(this: unknown) { return this; }),
      eq:          vi.fn(function(this: unknown) { return this; }),
      delete:      vi.fn(function(this: unknown) { return this; }),
      update:      vi.fn(function(this: unknown) { return this; }),
      maybeSingle: maybySingleFn,
      then:        deleteThen as unknown as (...args: unknown[]) => unknown,
      catch:       vi.fn(),
      finally:     vi.fn(),
    }));

    mockCreateAdminClient.mockReturnValue({ from: fromMock });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts/${TEST_ACCOUNT_ID}`, { method: 'DELETE' });
    const res = await deleteAccount(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: TEST_ACCOUNT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/accounts/${TEST_ACCOUNT_ID}`, { method: 'DELETE' });
    const res = await deleteAccount(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: TEST_ACCOUNT_ID }) });

    expect(res.status).toBe(401);
  });

  it('(c) session.portalEmail ≠ resolved.portalEmail → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts/${TEST_ACCOUNT_ID}`, { method: 'DELETE' });
    const res = await deleteAccount(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: TEST_ACCOUNT_ID }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/autorizado/i);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts/${TEST_ACCOUNT_ID}`, { method: 'DELETE' });
    const res = await deleteAccount(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: TEST_ACCOUNT_ID }) });

    expect(res.status).toBe(403);
  });

  it('(e) IDOR: cuenta pertenece a otra org → 403', async () => {
    // maybySingle devuelve null porque .eq portal_email filtra al account ajeno
    const maybySingleFn = vi.fn(async () => ({ data: null, error: null }));

    const fromMock = vi.fn(() => {
      const c: Record<string, unknown> = {};
      c.select      = vi.fn(() => c);
      c.eq          = vi.fn(() => c);
      c.maybeSingle = maybySingleFn;
      c.then        = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve));
      c.catch       = vi.fn(() => c);
      return c;
    });

    mockCreateAdminClient.mockReturnValue({ from: fromMock });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/accounts/cuenta-de-otra-org`, { method: 'DELETE' });
    const res = await deleteAccount(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: 'cuenta-de-otra-org' }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/sin acceso/i);
  });
});
