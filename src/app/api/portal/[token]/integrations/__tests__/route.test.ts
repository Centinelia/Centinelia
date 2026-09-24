/**
 * Regression: `google_review_url` fue removido del portal /integrations
 * (2026-09-24). El GET no debe surfacear el campo y el PATCH debe ignorarlo
 * en el body sin escribir a organizations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  createSupabaseMock,
  fixtureOwnerSession,
  fixtureResolvedOrg,
  makeJsonRequest,
  makeGetRequest,
  makeParams,
  TEST_ORG_TOKEN,
} from '@/lib/portal/__tests__/test-utils';

const {
  mockVerifySession,
  mockCreateAdminClient,
  mockResolveOrgFromToken,
  mockCookies,
} = vi.hoisted(() => ({
  mockVerifySession:       vi.fn(),
  mockCreateAdminClient:   vi.fn(),
  mockResolveOrgFromToken: vi.fn(),
  mockCookies:             vi.fn(async () => ({
    get: (_name: string) => ({ value: 'valid-cookie' }),
  })),
}));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/org-token', () => ({
  resolveOrgFromToken: mockResolveOrgFromToken,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { GET, PATCH } from '../route';

let supabase: ReturnType<typeof createSupabaseMock>;

beforeEach(() => {
  vi.clearAllMocks();
  supabase = createSupabaseMock();
  mockCreateAdminClient.mockReturnValue(supabase);
  mockVerifySession.mockResolvedValue(fixtureOwnerSession());
  mockResolveOrgFromToken.mockResolvedValue(fixtureResolvedOrg());
});

describe('GET /api/portal/[token]/integrations', () => {
  it('no incluye google_review_url en el payload', async () => {
    supabase.setNextResult({
      data: {
        calendar_type:          'calcom',
        calendar_event_type_id: '123',
        calendar_link:          'https://cal.com/x',
        calendar_api_key:       'key',
      },
    });
    supabase.setNextResult({ data: [] });

    const res = await GET(makeGetRequest(), { params: makeParams({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty('google_review_url');
    expect(body).toMatchObject({ calendar_type: 'calcom', cal_api_configured: true });
  });

  it('el SELECT a organizations no pide google_review_url', async () => {
    supabase.setNextResult({ data: {} });
    supabase.setNextResult({ data: [] });

    await GET(makeGetRequest(), { params: makeParams({ token: TEST_ORG_TOKEN }) });

    const orgSelect = supabase.history.find(h => h.table === 'organizations' && h.op === 'select');
    expect(orgSelect).toBeDefined();
    expect(orgSelect!.args as string).not.toContain('google_review_url');
  });
});

describe('PATCH /api/portal/[token]/integrations', () => {
  it('ignora google_review_url en el body: responde 200 sin escribir a DB', async () => {
    const res = await PATCH(
      makeJsonRequest({ google_review_url: 'https://g.page/r/xyz/review' }, { method: 'PATCH' }),
      { params: makeParams({ token: TEST_ORG_TOKEN }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Sin campos válidos en body → hasChanges=false → no upsert.
    // Antes del removal, `google_review_url` sí disparaba upsert a organizations.
    const writes = supabase.history.filter(h => h.op === 'update' || h.op === 'insert');
    expect(writes).toHaveLength(0);
    expect(supabase.history).toHaveLength(0);
  });
});
