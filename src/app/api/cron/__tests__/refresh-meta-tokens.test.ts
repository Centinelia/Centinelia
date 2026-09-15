/**
 * Unit tests — cron navi-refresh-meta-tokens
 *
 * Verifica renovación de tokens, manejo de fallos y ventana de 7 días.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks hoisted ───────────────────────────────────────────────────────────

const {
  mockVerifyCronAuth,
  mockCreateAdminClient,
  mockFetch,
} = vi.hoisted(() => ({
  mockVerifyCronAuth:    vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockFetch:             vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}));

// Mock fetch global
vi.stubGlobal('fetch', mockFetch);

import { GET } from '../refresh-meta-tokens/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/refresh-meta-tokens', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

const NOW = new Date('2026-09-15T03:00:00Z');

// Token que vence en 3 días (dentro de la ventana de 7 días)
const EXPIRES_3D = new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
// Token que vence en 10 días (fuera de la ventana)
const EXPIRES_10D = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();

function makeAccount(expiresAt: string, id = 'acct-1') {
  return {
    id,
    portal_email:  'nazre20@gmail.com',
    access_token:  'old-tok',
    expires_at:    expiresAt,
    status:        'active',
  };
}

function buildSb(accounts: unknown[], updateError: unknown = null) {
  const updateEqFn = vi.fn().mockResolvedValue({ error: updateError });
  const updateFn   = vi.fn().mockReturnValue({ eq: updateEqFn });

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'social_accounts') {
        let selectCalled = false;
        return {
          select: vi.fn().mockReturnValue({
            eq:  vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            lt:  vi.fn().mockResolvedValue({ data: accounts, error: null }),
          }),
          update: updateFn,
        };
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }),
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockResolvedValue({ error: null }),
      };
    }),
  };

  return { updateFn, updateEqFn, sb };
}

function mockFetchSuccess(newToken = 'new-long-token') {
  mockFetch.mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ access_token: newToken }),
    text: vi.fn().mockResolvedValue(''),
  });
}

function mockFetchFailure(status = 400, message = 'invalid_token') {
  mockFetch.mockResolvedValue({
    ok:   false,
    status,
    text: vi.fn().mockResolvedValue(message),
    json: vi.fn().mockResolvedValue({ error: { message } }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('navi-refresh-meta-tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(true);
    vi.setSystemTime(NOW);
    process.env.META_APP_ID     = 'app-id-test';
    process.env.META_APP_SECRET = 'app-secret-test';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
  });

  // ── (a) Renueva token que vence en 3 días → new expires_at = now+60d ─────

  it('(a) renueva token expirando en 3 días → actualiza access_token y expires_at', async () => {
    const account = makeAccount(EXPIRES_3D);
    const { updateFn, updateEqFn, sb } = buildSb([account]);
    mockCreateAdminClient.mockReturnValue(sb);
    mockFetchSuccess('new-long-lived-token');

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(body.ok).toBe(true);
    expect((body.metadata as Record<string, number>).renewed).toBe(1);
    expect(body.errors_count).toBe(0);

    // Verificar que se llamó update con el nuevo token y expires_at ~60d desde NOW
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ access_token: 'new-long-lived-token' }),
    );
    const updateArgs = (updateFn.mock.calls[0] as [Record<string, unknown>])[0];
    const newExpires = new Date(updateArgs.expires_at as string).getTime();
    const expected60d = NOW.getTime() + 60 * 24 * 60 * 60 * 1000;
    // Tolerancia de 5 segundos
    expect(Math.abs(newExpires - expected60d)).toBeLessThan(5000);
  });

  // ── (b) Fallo en exchange → status='needs_reauth' ────────────────────────

  it('(b) fallo en token exchange → status=needs_reauth', async () => {
    const account = makeAccount(EXPIRES_3D);
    const { updateFn, sb } = buildSb([account]);
    mockCreateAdminClient.mockReturnValue(sb);
    mockFetchFailure(400, 'OAuthException: invalid token');

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect((body.metadata as Record<string, number>).needs_reauth).toBe(1);
    expect((body.metadata as Record<string, number>).renewed).toBe(0);
    expect(body.errors_count).toBe(1);

    // update con needs_reauth
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'needs_reauth' }),
    );
  });

  // ── (c) Token que vence en >7 días NO se toca ────────────────────────────

  it('(c) tokens con expires_at > 7 días no se renuevan', async () => {
    // La DB query filtra por lt(expires_at, windowEnd) donde windowEnd = now+7d
    // Si no hay cuentas dentro de la ventana, rows = []
    const { updateFn, sb } = buildSb([]); // Query retorna vacío
    mockCreateAdminClient.mockReturnValue(sb);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(body.ok).toBe(true);
    expect((body.metadata as Record<string, number>).renewed).toBe(0);
    expect((body.metadata as Record<string, number>).accounts_checked).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
  });
});
