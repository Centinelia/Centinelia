/**
 * Tests para withPortalAuth — el helper que envuelve auth+scoping+rl+load-agent
 * en todas las routes portal.
 *
 * Cubre: 401 sin cookie, 401 sin portalEmail en prod, 403 sub-user, 404 org
 * no encontrado, 403 cross-org (case-insensitive), 403 IDOR (agent de otra
 * org), 429 rate-limit, dev bypass (empty portalEmail pasa).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

import {
  createSupabaseMock,
  fixtureOwnerSession,
  fixtureSubUserSession,
  fixtureResolvedOrg,
  fixtureAgent,
  makeJsonRequest,
  makeParams,
  TEST_ORG_TOKEN,
  TEST_AGENT_ID,
  TEST_PORTAL_EMAIL,
} from './test-utils';

const {
  mockVerifySession,
  mockResolveOrg,
  mockCreateAdminClient,
  mockRateLimit,
  mockLimiterConfigWrite,
} = vi.hoisted(() => ({
  mockVerifySession:     vi.fn(),
  mockResolveOrg:        vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockRateLimit:         vi.fn(),
  mockLimiterConfigWrite: {} as unknown,
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
  limiters:  { configWrite: mockLimiterConfigWrite },
}));

import { withPortalAuth } from '../with-portal-auth';

// Handler dummy que retorna lo que le llegó por ctx (para asserts).
const echoHandler = vi.fn(async (_req, ctx) =>
  NextResponse.json({ ok: true, org: ctx.org, agentId: ctx.agentId, agent: ctx.agent }),
);

let supabase: ReturnType<typeof createSupabaseMock>;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  mockRateLimit.mockResolvedValue(null); // no rate-limit por default
  vi.stubEnv('NODE_ENV', 'production');
});

describe('withPortalAuth — scoping=token', () => {
  it('devuelve 401 sin sesión', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const handler = withPortalAuth(echoHandler);
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(401);
    expect(echoHandler).not.toHaveBeenCalled();
  });

  it('devuelve 401 en prod si portalEmail está vacío', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockVerifySession.mockResolvedValueOnce({ portalEmail: '', isSubUser: false });
    const handler = withPortalAuth(echoHandler);
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(401);
  });

  it('permite dev bypass: portalEmail vacío pasa en development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockVerifySession.mockResolvedValueOnce({ portalEmail: '', isSubUser: false });
    mockResolveOrg.mockResolvedValueOnce(fixtureResolvedOrg());
    const handler = withPortalAuth(echoHandler);
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(200);
    expect(echoHandler).toHaveBeenCalled();
  });

  it('devuelve 403 a sub-users cuando requireOwner=true', async () => {
    mockVerifySession.mockResolvedValueOnce(fixtureSubUserSession(['inicio']));
    const handler = withPortalAuth(echoHandler, { requireOwner: true });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(403);
  });

  it('devuelve 404 si el token no matchea ningún org', async () => {
    mockVerifySession.mockResolvedValueOnce(fixtureOwnerSession());
    mockResolveOrg.mockResolvedValueOnce(null);
    const handler = withPortalAuth(echoHandler);
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: 'unknown' }) },
    );
    expect(res.status).toBe(404);
  });

  it('devuelve 403 cuando session.portalEmail no matchea org (cross-org)', async () => {
    mockVerifySession.mockResolvedValueOnce({
      portalEmail: 'otra-org@example.com',
      isSubUser:   false,
    });
    mockResolveOrg.mockResolvedValueOnce(fixtureResolvedOrg());
    const handler = withPortalAuth(echoHandler);
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(403);
  });

  it('permite email con case diferente (Test-Org@ vs test-org@)', async () => {
    mockVerifySession.mockResolvedValueOnce({
      portalEmail: 'Test-Org@Centinelia.MX',
      isSubUser:   false,
    });
    mockResolveOrg.mockResolvedValueOnce(fixtureResolvedOrg({
      portalEmail: 'test-org@centinelia.mx',
    }));
    const handler = withPortalAuth(echoHandler);
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(200);
  });
});

describe('withPortalAuth — loadAgent + IDOR', () => {
  beforeEach(() => {
    mockVerifySession.mockResolvedValue(fixtureOwnerSession());
    mockResolveOrg.mockResolvedValue(fixtureResolvedOrg());
  });

  it('carga el agente cuando loadAgent=true', async () => {
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    const handler = withPortalAuth(echoHandler, {
      loadAgent:   true,
      agentSelect: 'id, portal_email',
    });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(200);
    // Verifica que el select incluyó el eq('id') y eq('portal_email')
    const call = supabase.history[0];
    expect(call.table).toBe('voice_agents');
    expect(call.eq).toEqual(expect.arrayContaining([
      ['id',           TEST_AGENT_ID],
      ['portal_email', TEST_PORTAL_EMAIL],
    ]));
  });

  it('devuelve 400 si loadAgent=true pero falta agentId', async () => {
    const handler = withPortalAuth(echoHandler, { loadAgent: true });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(400);
  });

  it('devuelve 403 (IDOR) cuando el agente pertenece a otra org', async () => {
    // Simula: query devuelve null porque el eq('portal_email') filtró la fila
    // ajena. Ese es el comportamiento correcto: no revela existencia.
    supabase.setNextResult({ data: null, error: null });
    const handler = withPortalAuth(echoHandler, {
      loadAgent:   true,
      agentSelect: 'id, portal_email',
    });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: 'other-org-agent' }) },
    );
    expect(res.status).toBe(403);
  });

  it('devuelve 500 si el query del agente falla', async () => {
    supabase.setNextResult({ data: null, error: { message: 'DB down' } });
    const handler = withPortalAuth(echoHandler, { loadAgent: true, agentSelect: 'id' });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(500);
  });
});

describe('withPortalAuth — rate limit', () => {
  it('bloquea con 429 cuando el limiter dice no', async () => {
    mockVerifySession.mockResolvedValueOnce(fixtureOwnerSession());
    mockResolveOrg.mockResolvedValueOnce(fixtureResolvedOrg());
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 }),
    );
    const handler = withPortalAuth(echoHandler, {
      rateLimit:       'configWrite',
      rateLimitPrefix: 'test',
    });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(429);
    expect(echoHandler).not.toHaveBeenCalled();
    // Rate limit se llamó con el prefix correcto
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      mockLimiterConfigWrite,
      `test:${TEST_PORTAL_EMAIL}`,
    );
  });

  it('rate limit se evalúa DESPUÉS de auth (no da señales a atacantes)', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const handler = withPortalAuth(echoHandler, { rateLimit: 'configWrite' });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(401);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });
});

describe('withPortalAuth — scoping=session', () => {
  it('usa session.portalEmail como scope y NO llama a resolveOrgFromToken', async () => {
    mockVerifySession.mockResolvedValueOnce(fixtureOwnerSession());
    supabase.setNextResult({ data: fixtureAgent(), error: null });
    const handler = withPortalAuth(echoHandler, {
      scoping:     'session',
      loadAgent:   true,
      agentIdParam:'id',
      agentSelect: 'id, portal_email',
    });
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ id: TEST_AGENT_ID }) },
    );
    expect(res.status).toBe(200);
    expect(mockResolveOrg).not.toHaveBeenCalled();
    // El eq('portal_email') vino de session, no del token
    expect(supabase.history[0].eq).toEqual(expect.arrayContaining([
      ['portal_email', TEST_PORTAL_EMAIL],
    ]));
  });
});

describe('withPortalAuth — errores no manejados', () => {
  it('atrapa excepciones del handler y responde 500 genérico', async () => {
    mockVerifySession.mockResolvedValueOnce(fixtureOwnerSession());
    mockResolveOrg.mockResolvedValueOnce(fixtureResolvedOrg());
    const boom = vi.fn(async () => { throw new Error('boom'); });
    const handler = withPortalAuth(boom);
    const res = await handler(
      makeJsonRequest({}),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );
    expect(res.status).toBe(500);
    // El error interno NO se leakea al cliente
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('boom');
  });
});
