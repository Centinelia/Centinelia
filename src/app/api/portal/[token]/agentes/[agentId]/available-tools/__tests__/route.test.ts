/**
 * Tests para GET /api/portal/[token]/agentes/[agentId]/available-tools
 *
 * Cubre:
 *  - Auth: 401/403/404
 *  - IDOR: agente de otra org devuelve 403
 *  - Retorna { overrides, groups } con datos parseados
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSupabaseMock,
  fixtureOwnerSession,
  fixtureResolvedOrg,
  fixtureAgent,
  makeGetRequest,
  makeParams,
  TEST_ORG_TOKEN,
  TEST_AGENT_ID,
} from '@/lib/portal/__tests__/test-utils';

const {
  mockVerifySession,
  mockResolveOrg,
  mockCreateAdminClient,
  mockRateLimit,
  mockPackContext,
  mockResolveActive,
  mockMeerkatActive,
  mockBuildGroups,
} = vi.hoisted(() => ({
  mockVerifySession:     vi.fn(),
  mockResolveOrg:        vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockRateLimit:         vi.fn(),
  mockPackContext:       vi.fn(),
  mockResolveActive:     vi.fn(),
  mockMeerkatActive:     vi.fn(),
  mockBuildGroups:       vi.fn(),
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
  limiters:  {},
}));

vi.mock('@/lib/tools/packs', () => ({
  resolveOrgPackContext: mockPackContext,
  resolveActivePacks:    mockResolveActive,
  meerkatActivePacks:    mockMeerkatActive,
}));

vi.mock('@/lib/tools/available-tools', () => ({
  buildToolGroups: mockBuildGroups,
}));

import { GET } from '../route';

let supabase: ReturnType<typeof createSupabaseMock>;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  mockRateLimit.mockResolvedValue(null);
  mockVerifySession.mockResolvedValue(fixtureOwnerSession());
  mockResolveOrg.mockResolvedValue(fixtureResolvedOrg());
  mockPackContext.mockResolvedValue({});
  mockResolveActive.mockReturnValue([]);
  mockMeerkatActive.mockReturnValue([]);
  mockBuildGroups.mockReturnValue([{ id: 'g1', label: 'G1', description: null, tools: [] }]);
  vi.stubEnv('NODE_ENV', 'production');
});

describe('GET /available-tools', () => {
  it('devuelve overrides + groups', async () => {
    supabase.setNextResult({
      data:  fixtureAgent({ tool_overrides: { disabled: ['t1'] } }),
      error: null,
    });
    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overrides).toEqual({ disabled: ['t1'], enabled: [] });
    expect(body.groups).toHaveLength(1);
  });

  it('401 sin sesión', async () => {
    mockVerifySession.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(401);
  });

  it('403 cuando agente pertenece a otra org (IDOR guard)', async () => {
    supabase.setNextResult({ data: null, error: null });
    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: 'agent-de-otra-org' }),
    });
    expect(res.status).toBe(403);
  });

  it('404 cuando el token no resuelve org', async () => {
    mockResolveOrg.mockResolvedValueOnce(null);
    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: 'unknown', agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(404);
  });

  it('403 cuando session.portalEmail no matchea org', async () => {
    mockVerifySession.mockResolvedValueOnce(
      fixtureOwnerSession({ portalEmail: 'otra@example.com' }),
    );
    const res = await GET(makeGetRequest(), {
      params: makeParams({ token: TEST_ORG_TOKEN, agentId: TEST_AGENT_ID }),
    });
    expect(res.status).toBe(403);
  });
});
