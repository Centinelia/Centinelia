/**
 * Tests de comportamiento para GET /api/auth/canva-callback
 *
 * Cubre tres escenarios críticos de seguridad + persistencia:
 *   A) Camino feliz: code válido + nonce correcto → 302 a success URL + row en integration_accounts
 *   B) Nonce no existe en cookie → csrf_nonce redirect, sin row insertado
 *   C) Nonce mal formado (tampering) → csrf_nonce redirect, sin row insertado
 *
 * Supabase mockeado en memoria (sin hit real a DB).
 * CanvaProvider.exchangeCodeForToken mockeado vía vi.mock.
 * verifySession mockeado para simular sesión autenticada.
 * verifyOAuthState NO es mockeado — corre código real para probar la defensa CSRF.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockVerifySession,
  mockResolveOrg,
  mockCreateAdminClient,
  mockExchangeCode,
  mockEncrypt,
} = vi.hoisted(() => ({
  mockVerifySession:     vi.fn(),
  mockResolveOrg:        vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockExchangeCode:      vi.fn(),
  mockEncrypt:           vi.fn((s: string) => `enc:${s}`),
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

vi.mock('@/lib/social/canva', () => ({
  CanvaProvider: {
    exchangeCodeForToken: mockExchangeCode,
  },
}));

vi.mock('@/lib/crypto', () => ({
  encrypt: mockEncrypt,
}));

// Importar después de los mocks
import { GET } from '../canva-callback/route';

// ─── Constantes de test ───────────────────────────────────────────────────────

const TEST_PORTAL_EMAIL = 'nazre20+navi-canva-test@gmail.com';
const TEST_ORG_TOKEN    = 'test-org-canva-abc';
const TEST_AGENT_ID     = 'agent-uuid-canva-001';
const APP_URL           = 'https://www.centinelia.mx';

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
    // Los terminales (maybeSingle, then) consumen el próximo resultado del queue.
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

// ─── Helpers de request ───────────────────────────────────────────────────────

/**
 * Construye un NextRequest de callback con nonce válido.
 * El state tiene formato `${portalToken}.${nonce}`.
 * La cookie tiene formato `navi-canva:${nonce}`.
 */
function makeCallbackRequest(opts: {
  code?:      string;
  nonce?:     string;
  cookieNonce?: string;  // si difiere del nonce en state (para tampering)
  token?:     string;
  agentId?:   string;
  provider?:  string;
}) {
  const nonce       = opts.nonce    ?? randomBytes(24).toString('base64url');
  const token       = opts.token    ?? TEST_ORG_TOKEN;
  const agentId     = opts.agentId  ?? TEST_AGENT_ID;
  const provider    = opts.provider ?? 'navi-canva';
  const code        = opts.code     ?? 'canva-auth-code-xyz';
  const cookieNonce = opts.cookieNonce ?? nonce;

  const portalToken = `${token}::navi-canva::${agentId}`;
  const state       = `${portalToken}.${nonce}`;
  const cookieValue = `${provider}:${cookieNonce}`;

  const url = `${APP_URL}/api/auth/canva-callback?code=${code}&state=${encodeURIComponent(state)}`;
  return new NextRequest(url, {
    headers: {
      cookie: `Centinelia_portal=valid-session; oauth_state=${cookieValue}`,
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/auth/canva-callback', () => {
  let supabase: ReturnType<typeof createSupabaseMockWithUpsert>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', APP_URL);
    vi.stubEnv('NODE_ENV', 'production');

    supabase = createSupabaseMockWithUpsert();
    mockCreateAdminClient.mockReturnValue(supabase);

    mockVerifySession.mockResolvedValue({
      portalEmail: TEST_PORTAL_EMAIL,
      isSubUser: false,
    });

    mockResolveOrg.mockResolvedValue({
      portalEmail: TEST_PORTAL_EMAIL,
      orgToken:    TEST_ORG_TOKEN,
      legacy:      false,
    });

    // IDOR check → agente existe
    supabase.setNextResult({ data: { id: TEST_AGENT_ID }, error: null });

    mockExchangeCode.mockResolvedValue({
      accessToken:  'at_canva_abc',
      refreshToken: 'rt_canva_xyz',
      expiresIn:    14400,
    });
  });

  // ─── (A) Camino feliz ────────────────────────────────────────────────────
  it('(A) nonce válido → 302 a success URL y upsert a integration_accounts', async () => {
    const req = makeCallbackRequest({});
    const res = await GET(req);

    // Debe redirigir
    expect(res.status).toBe(307);

    const location = res.headers.get('location') ?? '';
    expect(location).toContain('navi=connected');
    expect(location).toContain('provider=canva');
    expect(location).toContain(`/portal/${TEST_ORG_TOKEN}/configurar/${TEST_AGENT_ID}`);

    // Debe haber llamado exchangeCodeForToken con code correcto
    expect(mockExchangeCode).toHaveBeenCalledWith(
      'canva-auth-code-xyz',
      `${APP_URL}/api/auth/canva-callback`,
    );

    // Debe haber encriptado el refresh token
    expect(mockEncrypt).toHaveBeenCalledWith('rt_canva_xyz');

    // Debe haber hecho upsert en integration_accounts
    const log = supabase.getUpsertLog();
    expect(log).toHaveLength(1);
    expect(log[0].table).toBe('integration_accounts');

    const upserted = log[0].data as Record<string, unknown>;
    expect(upserted.agent_id).toBe(TEST_AGENT_ID);
    expect(upserted.portal_email).toBe(TEST_PORTAL_EMAIL);
    expect(upserted.provider).toBe('canva');
    expect(upserted.capability).toBe('design');
    expect(upserted.access_token).toBe('at_canva_abc');
    // El refresh token debe estar encriptado, no en plaintext
    expect(upserted.refresh_token).toBe('enc:rt_canva_xyz');
    expect(upserted.refresh_token).not.toBe('rt_canva_xyz');
    expect(upserted.status).toBe('active');
  });

  // ─── (B) Sin cookie de nonce → csrf_nonce redirect, sin upsert ──────────
  it('(B) sin cookie de nonce → redirect a csrf_nonce, sin row insertado', async () => {
    const nonce       = randomBytes(24).toString('base64url');
    const portalToken = `${TEST_ORG_TOKEN}::navi-canva::${TEST_AGENT_ID}`;
    const state       = `${portalToken}.${nonce}`;

    // Request SIN la cookie oauth_state (simula que no pasó por el initiator)
    const url = `${APP_URL}/api/auth/canva-callback?code=code123&state=${encodeURIComponent(state)}`;
    const req = new NextRequest(url, {
      headers: {
        // Solo la cookie de sesión, sin oauth_state
        cookie: 'Centinelia_portal=valid-session',
      },
    });

    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('csrf_nonce');

    // No debe haber upsert
    expect(supabase.getUpsertLog()).toHaveLength(0);
    // No debe haber llamado exchangeCodeForToken
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  // ─── (C) Nonce alterado (tampering) → csrf_nonce redirect, sin upsert ───
  it('(C) nonce alterado en state → redirect a csrf_nonce, sin row insertado', async () => {
    // El state tiene un nonce diferente al que está en la cookie
    const realNonce    = randomBytes(24).toString('base64url');
    const tamperedNonce = randomBytes(24).toString('base64url'); // ≠ realNonce

    const req = makeCallbackRequest({
      nonce:       tamperedNonce, // nonce en el state URL
      cookieNonce: realNonce,     // nonce en la cookie (diferente)
    });

    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('csrf_nonce');

    // No debe haber upsert
    expect(supabase.getUpsertLog()).toHaveLength(0);
    // No debe haber llamado exchangeCodeForToken
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });
});
