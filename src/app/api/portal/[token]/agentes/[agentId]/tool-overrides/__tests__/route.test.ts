/**
 * Tests para GET/PATCH /api/portal/[token]/agentes/[agentId]/tool-overrides
 *
 * Cubre:
 *  - Body vacío/malformado NO borra overrides silenciosamente (Pasada 1)
 *  - Rate limit
 *  - Defense-in-depth: UPDATE con .eq('portal_email')
 *  - Generic error (no leak Postgres)
 *  - IDOR: agente de otra org retorna 403
 *  - Case-insensitive email (Pasada 2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSupabaseMock,
  fixtureOwnerSession,
  fixtureResolvedOrg,
  fixtureAgent,
  makeJsonRequest,
  makeGetRequest,
  makeParams,
  TEST_ORG_TOKEN,
  TEST_AGENT_ID,
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

import { GET, PATCH } from '../route';

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

describe('GET /tool-overrides', () => {
  it('devuelve overrides parseados', async () => {
    supabase.setNextResult({
      data:  fixtureAgent({ tool_overrides: { disabled: ['tool_a'], enabled: ['tool_b'] } }),
      error: null,
    });

    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      overrides: { disabled: ['tool_a'], enabled: ['tool_b'] },
    });
  });

  it('403 IDOR: agente de otra org retorna null → 403', async () => {
    supabase.setNextResult({ data: null, error: null });
    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: 'agent-de-otra-org' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /tool-overrides — protección contra wipe silencioso', () => {
  beforeEach(() => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
  });

  it('400 si body es null (parse fail) — NO borra overrides', async () => {
    // Body no-JSON llega al parse fail
    const badReq = new (await import('next/server')).NextRequest(
      'http://localhost/x',
      { method: 'PATCH', headers: { cookie: 'Centinelia_portal=x', 'content-type': 'application/json' }, body: 'not-json' },
    );
    const res = await PATCH(badReq, {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(400);
    // No hubo UPDATE
    expect(supabase.history.filter(h => h.op === 'update')).toHaveLength(0);
  });

  it('400 si body es objeto sin disabled ni enabled', async () => {
    const res = await PATCH(makeJsonRequest({ foo: 'bar' }, { method: 'PATCH' }), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(400);
    expect(supabase.history.filter(h => h.op === 'update')).toHaveLength(0);
  });

  it('400 si body es un array (no-object)', async () => {
    const res = await PATCH(makeJsonRequest(['a', 'b'], { method: 'PATCH' }), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('acepta { disabled: [] } (lista vacía intencional)', async () => {
    supabase.setNextResult({ error: null }); // UPDATE ok
    const res = await PATCH(makeJsonRequest({ disabled: [] }, { method: 'PATCH' }), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /tool-overrides — strip unknown tool names', () => {
  beforeEach(() => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
  });

  it('descarta names desconocidos y los reporta en warnings.unknown_tools', async () => {
    supabase.setNextResult({ error: null });
    const res = await PATCH(
      makeJsonRequest(
        { disabled: ['read_url', 'fake_tool_xyz'], enabled: ['nonexistent_capability'] },
        { method: 'PATCH' },
      ),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overrides).toEqual({ disabled: ['read_url'], enabled: [] });
    expect(body.warnings.unknown_tools).toEqual(
      expect.arrayContaining(['fake_tool_xyz', 'nonexistent_capability']),
    );

    // El UPDATE recibió la lista limpia, no la sucia
    const updateCall = supabase.history.find(h => h.op === 'update')!;
    expect((updateCall.args as { tool_overrides: unknown }).tool_overrides)
      .toEqual({ disabled: ['read_url'], enabled: [] });
  });

  it('sin unknowns NO incluye warnings en la respuesta', async () => {
    supabase.setNextResult({ error: null });
    const res = await PATCH(
      makeJsonRequest(
        { disabled: ['read_url'], enabled: ['buscar_en_web'] },
        { method: 'PATCH' },
      ),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    const body = await res.json();
    expect(body.warnings).toBeUndefined();
  });
});

describe('PATCH /tool-overrides — defense-in-depth + rate limit', () => {
  beforeEach(() => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
  });

  it('UPDATE incluye eq("id") y eq("portal_email")', async () => {
    supabase.setNextResult({ error: null });
    await PATCH(
      makeJsonRequest({ disabled: ['x'], enabled: ['y'] }, { method: 'PATCH' }),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    const updateCall = supabase.history.find(h => h.op === 'update')!;
    expect(updateCall.eq).toEqual(expect.arrayContaining([
      ['id',           TEST_AGENT_ID],
      ['portal_email', TEST_PORTAL_EMAIL],
    ]));
  });

  it('500 genérico cuando el UPDATE falla (no leak Postgres)', async () => {
    supabase.setNextResult({ error: { message: 'relation "voice_agents_rls" does not permit' } });
    const res = await PATCH(
      makeJsonRequest({ disabled: [] }, { method: 'PATCH' }),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('does not permit');
  });

  it('rate-limit 429 no ejecuta UPDATE', async () => {
    mockRateLimit.mockResolvedValueOnce(
      (await import('next/server')).NextResponse.json({ error: 'rl' }, { status: 429 }),
    );
    const res = await PATCH(
      makeJsonRequest({ disabled: [] }, { method: 'PATCH' }),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(429);
    expect(supabase.history.filter(h => h.op === 'update')).toHaveLength(0);
  });
});
