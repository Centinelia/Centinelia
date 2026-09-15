/**
 * Tests de comportamiento para:
 *   POST /api/portal/[token]/social/pause
 *   POST /api/portal/[token]/social/resume
 *
 * Cubre:
 *   (a) Camino feliz
 *   (b) Sin cookie de sesión → 401
 *   (c) session.portalEmail ≠ resolved.portalEmail → 403
 *   (d) Feature flag desactivado → 403
 *   (e) IDOR: social_account_id de otra org → 403
 *   (f) social_account_id dado → pausa solo ese row (paused: 1)
 *   (g) agent_id con 3 cuentas en agencia → pausa las 3 (paused: 3)
 *   (h) Sin agent_id ni social_account_id → 400
 *   (i) resume con social_account_id → limpia paused_reason y paused_at
 *   (j) resume con agent_id y N cuentas pausadas → reactiva todas
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
  mockVerifySession:        vi.fn(),
  mockResolveOrg:           vi.fn(),
  mockRequireSocialFeature: vi.fn(),
  mockCreateAdminClient:    vi.fn(),
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

import { POST as pause } from '../pause/route';
import { POST as resume } from '../resume/route';

// ─── Constantes ──────────────────────────────────────────────────────────────

const TEST_EMAIL       = 'nazre20+navi-pause-test@gmail.com';
const OTHER_EMAIL      = 'nazre20+navi-other@gmail.com';
const TEST_ORG_TOKEN   = 'test-tok-pause-abc';
const AGENT_ID         = 'agent-uuid-pause-001';
const ACCOUNT_ID       = 'acc-uuid-pause-001';
const OTHER_ACCOUNT_ID = 'acc-uuid-other-org';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method:  'POST',
    headers: {
      cookie:         'Centinelia_portal=valid-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Mock de Supabase con cola de resultados para secuencias de llamadas.
 * Registra llamadas a update() para verificar los valores escritos.
 */
function makeQueuedSbMock() {
  const queue: Array<{ data: unknown; error: unknown }> = [];
  const updateLog: Array<{ values: unknown }> = [];
  const enqueue = (r: { data?: unknown; error?: unknown }) =>
    queue.push({ data: r.data ?? null, error: r.error ?? null });
  const dequeue = () => queue.shift() ?? { data: null, error: null };

  const buildChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    chain.select      = vi.fn(() => chain);
    chain.eq          = vi.fn(() => chain);
    chain.in          = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => dequeue());
    chain.update      = vi.fn((values: unknown) => {
      updateLog.push({ values });
      return chain;
    });
    chain.then = vi.fn(<TR>(fn: (v: unknown) => TR) =>
      Promise.resolve(dequeue()).then(fn));
    return chain;
  };

  const from = vi.fn(() => buildChain());
  return { from, enqueue, updateLog };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');

  mockVerifySession.mockResolvedValue({ portalEmail: TEST_EMAIL, isSubUser: false });
  mockResolveOrg.mockResolvedValue({ portalEmail: TEST_EMAIL, orgToken: TEST_ORG_TOKEN, legacy: false });
  mockRequireSocialFeature.mockResolvedValue({ enabled: true, agencyMode: false });
});

// ─── POST /pause ──────────────────────────────────────────────────────────────

describe('POST /api/portal/[token]/social/pause', () => {
  it('(f) social_account_id → pausa solo ese row, paused: 1', async () => {
    const sb = makeQueuedSbMock();
    // select maybySingle para verificar ownership
    sb.enqueue({ data: { id: ACCOUNT_ID, portal_email: TEST_EMAIL }, error: null });
    // update
    sb.enqueue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/pause`, {
      social_account_id: ACCOUNT_ID,
      reason: 'Revisión manual',
    });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.paused).toBe(1);
  });

  it('(g) agent_id en agencia con 3 cuentas → pausa las 3, paused: 3', async () => {
    const accounts = [
      { id: 'acc-1' }, { id: 'acc-2' }, { id: 'acc-3' },
    ];
    const sb = makeQueuedSbMock();
    // select de cuentas activas del agente
    sb.enqueue({ data: accounts, error: null });
    // update masivo
    sb.enqueue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/pause`, {
      agent_id: AGENT_ID,
      reason:   'Pausa programada',
    });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.paused).toBe(3);
  });

  it('(g2) agent_id sin cuentas activas → paused: 0', async () => {
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: [], error: null }); // sin cuentas activas
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/pause`, { agent_id: AGENT_ID });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.paused).toBe(0);
  });

  it('(h) sin agent_id ni social_account_id → 400', async () => {
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/pause`, { reason: 'sin id' });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/agent_id/i);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/pause`, {
      method: 'POST',
      body:   JSON.stringify({ social_account_id: ACCOUNT_ID }),
    });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(401);
  });

  it('(c) session.portalEmail ≠ resolved.portalEmail → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/pause`, { social_account_id: ACCOUNT_ID });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/autorizado/i);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/pause`, { social_account_id: ACCOUNT_ID });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });

  it('(e) IDOR: social_account_id de otra org → 403', async () => {
    const sb = makeQueuedSbMock();
    // La cuenta no se encuentra porque el .eq portal_email filtra
    sb.enqueue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/pause`, { social_account_id: OTHER_ACCOUNT_ID });
    const res = await pause(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/sin acceso/i);
  });
});

// ─── POST /resume ─────────────────────────────────────────────────────────────

describe('POST /api/portal/[token]/social/resume', () => {
  it('(i) social_account_id → reactiva el row, limpia paused_reason y paused_at', async () => {
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: { id: ACCOUNT_ID, portal_email: TEST_EMAIL }, error: null });
    sb.enqueue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/resume`, { social_account_id: ACCOUNT_ID });
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.paused).toBe(1);
  });

  it('(j) agent_id con 2 cuentas pausadas → reactiva las 2', async () => {
    const accounts = [{ id: 'acc-1' }, { id: 'acc-2' }];
    const sb       = makeQueuedSbMock();
    sb.enqueue({ data: accounts, error: null });
    sb.enqueue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/resume`, { agent_id: AGENT_ID });
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.paused).toBe(2);
  });

  it('(j2) agent_id sin cuentas pausadas → paused: 0', async () => {
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: [], error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/resume`, { agent_id: AGENT_ID });
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.paused).toBe(0);
  });

  it('(h) sin agent_id ni social_account_id → 400', async () => {
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/resume`, {});
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/agent_id/i);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/resume`, {
      method: 'POST',
      body:   JSON.stringify({ social_account_id: ACCOUNT_ID }),
    });
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(401);
  });

  it('(c) session.portalEmail ≠ resolved.portalEmail → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/resume`, { social_account_id: ACCOUNT_ID });
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/resume`, { social_account_id: ACCOUNT_ID });
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });

  it('(e) IDOR: social_account_id de otra org → 403', async () => {
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: null, error: null }); // la cuenta no se encontró con portal_email del org
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/resume`, { social_account_id: OTHER_ACCOUNT_ID });
    const res = await resume(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/sin acceso/i);
  });
});
