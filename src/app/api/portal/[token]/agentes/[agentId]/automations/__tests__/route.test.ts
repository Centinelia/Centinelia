/**
 * Tests para GET/PATCH /api/portal/[token]/agentes/[agentId]/automations
 *
 * Cubre los fixes de Pasada 1 + Pasada 2:
 *  - Prod-strict auth
 *  - Rate limit
 *  - Defense-in-depth: UPDATE con .eq('portal_email')
 *  - Generic error (no leak de Postgres al cliente)
 *  - Validación de body (automation name, enabled boolean)
 *  - learn requiere correo conectado
 *  - Case-insensitive email compare (Pasada 2)
 *  - hasEmailIntegration fail-open ante DB error
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
import { NextResponse } from 'next/server';

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

describe('GET /automations', () => {
  it('devuelve config + quota + available', async () => {
    // 1: load agent (has automations: { heartbeat: { enabled: true } })
    supabase.setNextResult({
      data: fixtureAgent({
        features: { automations: { heartbeat: { enabled: true } } },
        ai_ops_used: 42,
        ai_ops_limit: 100,
      }),
      error: null,
    });
    // 2: hasEmailIntegration org check → cuenta encontrada
    supabase.setNextResult({ data: [{ provider: 'gmail', status: 'active' }], error: null });

    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.automations.heartbeat.enabled).toBe(true);
    expect(body.automations.weekly_insights.enabled).toBe(false);
    expect(body.automations.learn.available).toBe(true);
    expect(body.quota).toEqual({ used: 42, limit: 100, resets_at: '2026-10-01' });
  });

  it('learn.available=true fail-open ante DB error en hasEmailIntegration', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    supabase.setNextResult({ data: null, error: { message: 'DB down' } });

    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Fail-open: no rompemos el toggle por hiccup de DB
    expect(body.automations.learn.available).toBe(true);
  });
});

describe('PATCH /automations — validación', () => {
  beforeEach(() => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
  });

  it('400 si body no tiene automation ni enabled', async () => {
    const res = await PATCH(makeJsonRequest({}), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('400 si automation no es una de las válidas', async () => {
    const res = await PATCH(makeJsonRequest({ automation: 'foo', enabled: true }), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(400);
  });

  it('400 al activar learn sin correo conectado', async () => {
    // Reset queue — el default beforeEach ya puso el agente. Ahora hasEmail...
    // devuelve arrays vacíos = no hay integración.
    supabase.setNextResult({ data: [], error: null }); // org check
    supabase.setNextResult({ data: [], error: null }); // per-agent check

    const res = await PATCH(makeJsonRequest({ automation: 'learn', enabled: true }), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('correo');
  });
});

describe('PATCH /automations — persist + defense-in-depth', () => {
  it('UPDATE incluye .eq("id") Y .eq("portal_email")', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    // re-SELECT fresh features
    supabase.setNextResult({
      data: { features: {}, heartbeat_config: {} },
      error: null,
    });
    // UPDATE ok
    supabase.setNextResult({ error: null });

    const res = await PATCH(
      makeJsonRequest({ automation: 'weekly_insights', enabled: true }),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(200);

    const updateCall = supabase.history.find(h => h.op === 'update')!;
    expect(updateCall.eq).toEqual(expect.arrayContaining([
      ['id',           TEST_AGENT_ID],
      ['portal_email', TEST_PORTAL_EMAIL],
    ]));
  });

  it('500 con error GENÉRICO cuando el UPDATE falla (no leak Postgres)', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    supabase.setNextResult({ data: {}, error: null });
    supabase.setNextResult({ error: { message: 'permission denied for table voice_agents' } });

    const res = await PATCH(
      makeJsonRequest({ automation: 'weekly_insights', enabled: true }),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    // Error genérico, no leak del mensaje interno de Postgres
    expect(JSON.stringify(body)).not.toContain('permission denied');
    expect(JSON.stringify(body)).not.toContain('voice_agents');
  });

  it('sync heartbeat_config.enabled cuando toggle es heartbeat', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    supabase.setNextResult({
      data: { features: {}, heartbeat_config: { enabled: false } },
      error: null,
    });
    supabase.setNextResult({ error: null });

    await PATCH(
      makeJsonRequest({ automation: 'heartbeat', enabled: true }),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );

    const updateCall = supabase.history.find(h => h.op === 'update')!;
    expect((updateCall.args as Record<string, unknown>).heartbeat_config).toEqual({ enabled: true });
  });
});

describe('PATCH /automations — rate limit', () => {
  it('bloquea con 429 cuando el limiter dispara', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 }),
    );

    const res = await PATCH(
      makeJsonRequest({ automation: 'heartbeat', enabled: true }),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(429);
    // No hubo UPDATE
    expect(supabase.history.filter(h => h.op === 'update')).toHaveLength(0);
  });
});

describe('PATCH /automations — case-insensitive email (Pasada 2)', () => {
  it('permite dueños con case-mismatch (Beatriz@X vs beatriz@x)', async () => {
    mockVerifySession.mockResolvedValueOnce(fixtureOwnerSession({
      portalEmail: 'TEST-org@Centinelia.MX',
    }));
    mockResolveOrg.mockResolvedValueOnce(fixtureResolvedOrg({
      portalEmail: 'test-org@centinelia.mx',
    }));
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    // hasEmailIntegration
    supabase.setNextResult({ data: [{ provider: 'gmail' }], error: null });

    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
  });
});
