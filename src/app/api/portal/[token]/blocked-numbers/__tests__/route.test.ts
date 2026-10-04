/**
 * Tests para GET/POST/DELETE /api/portal/[token]/blocked-numbers
 *
 * Cubre:
 *  - GET devuelve lista filtrada por portal_email
 *  - POST normaliza a E.164, inserta, retorna row
 *  - POST duplicado → 409
 *  - POST phone vacío → 400
 *  - POST phone inválido (<7 dígitos) → 400
 *  - DELETE por id funciona
 *  - DELETE por phone funciona
 *  - DELETE sin id ni phone → 400
 *  - DELETE idempotente (0 rows → 200 ok)
 *  - requireOwner: sub-user en POST → 403
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSupabaseMock,
  fixtureOwnerSession,
  fixtureSubUserSession,
  fixtureResolvedOrg,
  makeJsonRequest,
  makeGetRequest,
  makeParams,
  TEST_ORG_TOKEN,
  TEST_PORTAL_EMAIL,
} from '@/lib/portal/__tests__/test-utils';

const {
  mockVerifySession,
  mockResolveOrg,
  mockCreateAdminClient,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockVerifySession:     vi.fn(),
  mockResolveOrg:        vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockRateLimit:         vi.fn(),
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

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: mockRateLimit,
  limiters:  { configWrite: {} },
}));

import { GET, POST, DELETE } from '../route';

let supabase: ReturnType<typeof createSupabaseMock>;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  mockRateLimit.mockResolvedValue(null);
  mockVerifySession.mockResolvedValue(fixtureOwnerSession());
  mockResolveOrg.mockResolvedValue(fixtureResolvedOrg());
  vi.stubEnv('NODE_ENV', 'production');
});

describe('GET /blocked-numbers', () => {
  it('devuelve la lista filtrada por portal_email', async () => {
    const rows = [
      { id: 'b1', phone_e164: '+524812092229', reason: 'bot marcador', created_at: '2026-10-03T20:00:00Z', created_by: TEST_PORTAL_EMAIL },
      { id: 'b2', phone_e164: '+525555555555', reason: null,           created_at: '2026-10-02T10:00:00Z', created_by: TEST_PORTAL_EMAIL },
    ];
    supabase.setNextResult({ data: rows, error: null });

    const res = await GET(makeGetRequest(), { params: makeParams({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(rows);

    const call = supabase.history[0];
    expect(call.table).toBe('blocked_numbers');
    expect(call.op).toBe('select');
    expect(call.eq).toContainEqual(['portal_email', TEST_PORTAL_EMAIL]);
  });

  it('devuelve [] cuando no hay resultados', async () => {
    supabase.setNextResult({ data: null, error: null });
    const res = await GET(makeGetRequest(), { params: makeParams({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe('POST /blocked-numbers', () => {
  it('normaliza "4812092229" a "+524812092229" e inserta', async () => {
    supabase.setNextResult({ error: null });

    const res = await POST(
      makeJsonRequest({ phone: '4812092229', reason: 'bot' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phone_e164).toBe('+524812092229');

    const call = supabase.history[0];
    expect(call.op).toBe('insert');
    const inserted = call.args as { phone_e164: string; portal_email: string; reason: string | null; created_by: string | null };
    expect(inserted.phone_e164).toBe('+524812092229');
    expect(inserted.portal_email).toBe(TEST_PORTAL_EMAIL);
    expect(inserted.reason).toBe('bot');
    expect(inserted.created_by).toBe(TEST_PORTAL_EMAIL);
  });

  it('reason vacío se guarda como null', async () => {
    supabase.setNextResult({ error: null });

    await POST(
      makeJsonRequest({ phone: '+525555555555' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    const inserted = supabase.history[0].args as { reason: string | null };
    expect(inserted.reason).toBeNull();
  });

  it('duplicado (unique violation 23505) → 409', async () => {
    supabase.setNextResult({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const res = await POST(
      makeJsonRequest({ phone: '+524812092229' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ya está bloqueado/i);
  });

  it('phone vacío → 400', async () => {
    const res = await POST(
      makeJsonRequest({ phone: '' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/Falta|inv/i) });
  });

  it('phone con menos de 7 dígitos → 400', async () => {
    const res = await POST(
      makeJsonRequest({ phone: '123' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(400);
  });

  it('sub-user (no owner) → 403 (requireOwner)', async () => {
    mockVerifySession.mockResolvedValue(fixtureSubUserSession(['configuracion']));
    const res = await POST(
      makeJsonRequest({ phone: '+524812092229' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(403);
  });

  it('reason > 200 chars se trunca', async () => {
    const longReason = 'a'.repeat(500);
    supabase.setNextResult({ error: null });
    await POST(
      makeJsonRequest({ phone: '+525555555555', reason: longReason }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    const inserted = supabase.history[0].args as { reason: string | null };
    expect(inserted.reason?.length).toBe(200);
  });
});

describe('DELETE /blocked-numbers', () => {
  it('elimina por id, scoped por portal_email', async () => {
    supabase.setNextResult({ error: null });
    const res = await DELETE(
      makeJsonRequest(null, { path: '/api/portal/t/blocked-numbers?id=b1', method: 'DELETE' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const call = supabase.history[0];
    expect(call.op).toBe('delete');
    expect(call.eq).toContainEqual(['portal_email', TEST_PORTAL_EMAIL]);
    expect(call.eq).toContainEqual(['id', 'b1']);
  });

  it('elimina por phone (normalizado)', async () => {
    supabase.setNextResult({ error: null });
    await DELETE(
      makeJsonRequest(null, { path: '/api/portal/t/blocked-numbers?phone=4812092229', method: 'DELETE' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    const call = supabase.history[0];
    expect(call.eq).toContainEqual(['phone_e164', '+524812092229']);
  });

  it('sin id ni phone → 400', async () => {
    const res = await DELETE(
      makeJsonRequest(null, { path: '/api/portal/t/blocked-numbers', method: 'DELETE' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(400);
  });

  it('idempotente — 0 filas borradas también retorna ok', async () => {
    supabase.setNextResult({ error: null });
    const res = await DELETE(
      makeJsonRequest(null, { path: '/api/portal/t/blocked-numbers?id=nonexistent', method: 'DELETE' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('sub-user → 403', async () => {
    mockVerifySession.mockResolvedValue(fixtureSubUserSession([]));
    const res = await DELETE(
      makeJsonRequest(null, { path: '/api/portal/t/blocked-numbers?id=b1', method: 'DELETE' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(403);
  });
});
