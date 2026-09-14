/**
 * Tests para POST /api/portal/agents/[id]/pause
 *
 * Cubre los fixes de Pasada 1 + Pasada 2:
 *  - Validación de action (Pasada 1)
 *  - Idempotencia (Pasada 1)
 *  - try/catch en Vapi (Pasada 1)
 *  - DB error handling (Pasada 1)
 *  - Sub-user gating (Pasada 1)
 *  - Rate limit (Pasada 1)
 *  - Guard portal_email null (Pasada 2)
 *  - resume bloqueado si billing pago_fallido
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSupabaseMock,
  fixtureOwnerSession,
  fixtureSubUserSession,
  fixtureAgent,
  makeJsonRequest,
  makeParams,
  TEST_AGENT_ID,
} from '@/lib/portal/__tests__/test-utils';

const {
  mockVerifySession,
  mockCreateAdminClient,
  mockRateLimit,
  mockPauseVapi,
  mockResumeVapi,
} = vi.hoisted(() => ({
  mockVerifySession:     vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockRateLimit:         vi.fn(),
  mockPauseVapi:         vi.fn(),
  mockResumeVapi:        vi.fn(),
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/org-token', () => ({
  resolveOrgFromToken: vi.fn(), // no se usa (scoping=session) pero necesita el mock
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: mockRateLimit,
  limiters:  { configWrite: {} },
}));

vi.mock('@/lib/vapi/control', () => ({
  pauseVapiAgent:  mockPauseVapi,
  resumeVapiAgent: mockResumeVapi,
}));

import { POST } from '../route';

let supabase: ReturnType<typeof createSupabaseMock>;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  mockRateLimit.mockResolvedValue(null);
  mockVerifySession.mockResolvedValue(fixtureOwnerSession());
  mockPauseVapi.mockResolvedValue(undefined);
  mockResumeVapi.mockResolvedValue({ ok: true });
  vi.stubEnv('NODE_ENV', 'production');
});

describe('POST /api/portal/agents/[id]/pause — auth', () => {
  it('401 sin sesión', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('403 a sub-users (requireOwner=true)', async () => {
    mockVerifySession.mockResolvedValueOnce(fixtureSubUserSession(['inicio']));
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(403);
  });

  it('403 IDOR: agente de otra org retorna null → no-encontrado (403)', async () => {
    supabase.setNextResult({ data: null, error: null }); // load agent = null
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: 'agent-de-otra-org' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/portal/agents/[id]/pause — validación', () => {
  beforeEach(() => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
  });

  it('400 si action no es "pause" ni "resume"', async () => {
    const res = await POST(makeJsonRequest({ action: 'foo' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(400);
    expect(mockPauseVapi).not.toHaveBeenCalled();
    expect(mockResumeVapi).not.toHaveBeenCalled();
  });

  it('400 si body no es JSON válido', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    // Body vacío que req.json() no puede parsear
    const badReq = new (await import('next/server')).NextRequest(
      'http://localhost/x',
      { method: 'POST', headers: { cookie: 'Centinelia_portal=x', 'content-type': 'application/json' }, body: 'not-json' },
    );
    const res = await POST(badReq, { params: makeParams({ id: TEST_AGENT_ID }) });
    expect(res.status).toBe(400);
  });

});

describe('POST /api/portal/agents/[id]/pause — defense-in-depth (dev bypass)', () => {
  it('500 si agent.portal_email es null bajo dev bypass', async () => {
    // En prod el eq('portal_email') filtraría esta fila. Este guard cubre el
    // caso dev-bypass donde no hay filtro por portal_email y podría llegar
    // un agente con portal_email=null (fila huérfana). Sin este test no había
    // regression guard para el fix de Pasada 2.
    vi.stubEnv('NODE_ENV', 'development');
    mockVerifySession.mockResolvedValueOnce({ portalEmail: '', isSubUser: false });
    supabase.setNextResult({ data: fixtureAgent({ portal_email: null }), error: null });
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(500);
    expect(mockPauseVapi).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/agents/[id]/pause — idempotencia', () => {
  it('pause sobre agente YA pausado retorna { noop: true }', async () => {
    supabase.setNextResult({
      data:  fixtureAgent({ active: false, client_paused: true }),
      error: null,
    });
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, noop: true });
    expect(mockPauseVapi).not.toHaveBeenCalled();
  });

  it('resume sobre agente YA activo retorna { noop: true }', async () => {
    supabase.setNextResult({
      data:  fixtureAgent({ active: true, client_paused: false }),
      error: null,
    });
    const res = await POST(makeJsonRequest({ action: 'resume' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, noop: true });
    expect(mockResumeVapi).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/agents/[id]/pause — Vapi errors', () => {
  it('502 si Vapi pause lanza, sin mutar DB', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    mockPauseVapi.mockRejectedValueOnce(new Error('vapi down'));
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(502);
    // Solo hubo el SELECT, no UPDATE
    expect(supabase.history.filter(h => h.op === 'update')).toHaveLength(0);
  });

  it('502 si Vapi resume lanza', async () => {
    supabase.setNextResult({
      data:  fixtureAgent({ active: false, client_paused: true }),
      error: null,
    });
    mockResumeVapi.mockRejectedValueOnce(new Error('vapi down'));
    const res = await POST(makeJsonRequest({ action: 'resume' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(502);
  });
});

describe('POST /api/portal/agents/[id]/pause — DB update errors', () => {
  it('500 si el UPDATE tras Vapi ok falla', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    supabase.setNextResult({ error: { message: 'DB down' } });
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(500);
    // Vapi sí se ejecutó (falla en DB tras Vapi)
    expect(mockPauseVapi).toHaveBeenCalled();
  });
});

describe('POST /api/portal/agents/[id]/pause — happy path', () => {
  it('pause OK: llama Vapi, actualiza DB filtrando por portal_email', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    supabase.setNextResult({ error: null });
    const res = await POST(makeJsonRequest({ action: 'pause' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockPauseVapi).toHaveBeenCalledWith('+528118000000');

    const updateCall = supabase.history.find(h => h.op === 'update')!;
    expect(updateCall.eq).toEqual(expect.arrayContaining([
      ['id',           TEST_AGENT_ID],
      ['portal_email', 'test-org@centinelia.mx'],
    ]));
    expect(updateCall.args).toMatchObject({
      active:        false,
      client_paused: true,
    });
  });

  it('resume bloqueado si billing_status="pago_fallido"', async () => {
    supabase.setNextResult({
      data:  fixtureAgent({ active: false, client_paused: true, billing_status: 'pago_fallido' }),
      error: null,
    });
    const res = await POST(makeJsonRequest({ action: 'resume' }), {
      params: makeParams({ id: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(403);
    expect(mockResumeVapi).not.toHaveBeenCalled();
  });
});
