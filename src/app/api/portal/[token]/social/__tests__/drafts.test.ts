/**
 * Tests de comportamiento para:
 *   GET   /api/portal/[token]/social/drafts
 *   PATCH /api/portal/[token]/social/drafts/[id]
 *
 * Cubre por endpoint:
 *   (a) Camino feliz
 *   (b) Sin cookie de sesión → 401
 *   (c) session.portalEmail ≠ resolved.portalEmail → 403
 *   (d) Feature flag desactivado → 403
 *   (e) IDOR: borrador pertenece a otra org → 403
 *   (f) approve → status 'scheduled' si scheduled_for existe
 *   (g) approve → status 'approved' si no hay scheduled_for
 *   (h) approved_by = session.portalEmail (R39)
 *   (i) reject → status 'rejected'
 *   (j) edit → actualiza solo los campos proporcionados
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

import { GET as getDrafts } from '../drafts/route';
import { PATCH as patchDraft } from '../drafts/[id]/route';

// ─── Constantes ──────────────────────────────────────────────────────────────

const TEST_EMAIL     = 'nazre20+navi-drafts-test@gmail.com';
const OTHER_EMAIL    = 'nazre20+navi-other@gmail.com';
const TEST_ORG_TOKEN = 'test-tok-drafts-abc';
const DRAFT_ID       = 'draft-uuid-001';
const AGENT_ID       = 'agent-uuid-001';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(path: string, opts?: Record<string, any>) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: 'Centinelia_portal=valid-session' },
    ...opts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * Crea un mock de Supabase con cola de resultados.
 * Cada llamada a maybySingle/single/then consume el próximo item de la cola.
 *
 * Importante: la chain soporta TODOS los métodos de Supabase builder (select, eq,
 * order, update, delete, upsert, etc.) — todos retornan la misma cadena fluida
 * para que las llamadas encadenadas funcionen.
 */
function makeQueuedSbMock() {
  const queue: Array<{ data: unknown; error: unknown }> = [];
  const enqueue = (r: { data?: unknown; error?: unknown }) =>
    queue.push({ data: r.data ?? null, error: r.error ?? null });
  const dequeue = () => queue.shift() ?? { data: null, error: null };

  // Creamos una chain circular donde TODOS los métodos devuelven la misma instancia.
  // Los métodos terminales (maybySingle, single, then) consumen el próximo resultado.
  const chain: Record<string, unknown> = {};
  chain.select      = vi.fn(() => chain);
  chain.eq          = vi.fn(() => chain);
  chain.order       = vi.fn(() => chain);
  chain.nullsFirst  = vi.fn(() => chain);
  chain.update      = vi.fn(() => chain);
  chain.delete      = vi.fn(() => chain);
  chain.upsert      = vi.fn(() => chain);
  chain.insert      = vi.fn(() => chain);
  chain.in          = vi.fn(() => chain);
  chain.gte         = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => dequeue());
  chain.single      = vi.fn(async () => dequeue());
  chain.then        = vi.fn(<TR>(resolve: (v: { data: unknown; error: unknown }) => TR) =>
    Promise.resolve(dequeue()).then(resolve));
  chain.catch       = vi.fn(() => chain);
  chain.finally     = vi.fn(() => chain);

  const from = vi.fn(() => chain);
  return { from, enqueue };
}

/**
 * Mock para GET /drafts: lista con join incluido.
 */
function makeDraftsListMock(drafts: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select  = vi.fn(() => chain);
  chain.eq      = vi.fn(() => chain);
  chain.order   = vi.fn(() => chain);
  chain.nullsFirst = vi.fn(() => chain);
  chain.then    = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data: drafts, error: null }).then(resolve));
  chain.catch   = vi.fn(() => chain);
  chain.finally = vi.fn(() => chain);
  return { from: vi.fn(() => chain) };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');

  mockVerifySession.mockResolvedValue({ portalEmail: TEST_EMAIL, isSubUser: false });
  mockResolveOrg.mockResolvedValue({ portalEmail: TEST_EMAIL, orgToken: TEST_ORG_TOKEN, legacy: false });
  mockRequireSocialFeature.mockResolvedValue({ enabled: true, agencyMode: false });
});

// ─── GET /drafts ──────────────────────────────────────────────────────────────

describe('GET /api/portal/[token]/social/drafts', () => {
  it('(a) camino feliz: devuelve borradores con estado pending_approval', async () => {
    const drafts = [
      {
        id: DRAFT_ID, status: 'pending_approval', agent_id: AGENT_ID, caption: 'Hola mundo',
        brand_templates: { name: 'Plantilla post', category: 'post' },
        social_accounts: { external_username: '@tortillas_estrella' },
      },
    ];
    mockCreateAdminClient.mockReturnValue(makeDraftsListMock(drafts));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts`);
    const res = await getDrafts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(DRAFT_ID);
    expect(body.data[0].brand_templates.name).toBe('Plantilla post');
    expect(body.data[0].social_accounts.external_username).toBe('@tortillas_estrella');
  });

  it('(a2) filtro agent_id y status: consulta con filtros adicionales', async () => {
    mockCreateAdminClient.mockReturnValue(makeDraftsListMock([]));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts?status=approved&agent_id=${AGENT_ID}`);
    const res = await getDrafts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/drafts`);
    const res = await getDrafts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });

    expect(res.status).toBe(401);
  });

  it('(c) session.portalEmail ≠ resolved.portalEmail → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts`);
    const res = await getDrafts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/autorizado/i);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts`);
    const res = await getDrafts(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/social publishing/i);
  });
});

// ─── PATCH /drafts/[id] ───────────────────────────────────────────────────────

describe('PATCH /api/portal/[token]/social/drafts/[id]', () => {
  it('(f) approve con scheduled_for → status=scheduled', async () => {
    const existingDraft = {
      id: DRAFT_ID, portal_email: TEST_EMAIL, status: 'pending_approval',
      scheduled_for: '2026-10-01T10:00:00Z',
    };
    const updatedDraft = { ...existingDraft, status: 'scheduled', approved_by: TEST_EMAIL };

    // La ruta llama:
    //   1. select().eq().eq().maybySingle()  → existingDraft (ownership check)
    //   2. update().eq().eq()                → then() → { data: null, error: null }
    //   3. select().eq().eq().maybySingle()  → updatedDraft (refetch)
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: existingDraft,  error: null }); // maybySingle #1 (ownership)
    sb.enqueue({ data: null,           error: null }); // then del update
    sb.enqueue({ data: updatedDraft,   error: null }); // maybySingle #2 (refetch)
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('scheduled');
  });

  it('(g) approve sin scheduled_for → status=approved', async () => {
    const existingDraft = { id: DRAFT_ID, portal_email: TEST_EMAIL, status: 'pending_approval', scheduled_for: null };
    const updatedDraft  = { ...existingDraft, status: 'approved', approved_by: TEST_EMAIL };

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: existingDraft, error: null });
    sb.enqueue({ data: null, error: null });
    sb.enqueue({ data: updatedDraft, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('approved');
  });

  it('(h) approved_by viene de session.portalEmail (R39), no hardcoded', async () => {
    const existingDraft = { id: DRAFT_ID, portal_email: TEST_EMAIL, status: 'pending_approval', scheduled_for: null };
    const updatedDraft  = { ...existingDraft, status: 'approved', approved_by: TEST_EMAIL };

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: existingDraft, error: null });
    sb.enqueue({ data: null, error: null });
    sb.enqueue({ data: updatedDraft, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    // approved_by debe reflejar la sesión del usuario logueado
    expect(body.data.approved_by).toBe(TEST_EMAIL);
  });

  it('(i) reject → status=rejected', async () => {
    const existingDraft = { id: DRAFT_ID, portal_email: TEST_EMAIL, status: 'pending_approval', scheduled_for: null };
    const updatedDraft  = { ...existingDraft, status: 'rejected' };

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: existingDraft, error: null });
    sb.enqueue({ data: null, error: null });
    sb.enqueue({ data: updatedDraft, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'reject' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('rejected');
  });

  it('(j) edit → actualiza caption y hashtags, preserva otros campos', async () => {
    const existingDraft = {
      id: DRAFT_ID, portal_email: TEST_EMAIL, status: 'draft',
      scheduled_for: null, caption: 'Texto original', hashtags: ['#viejo'],
    };
    const updatedDraft = { ...existingDraft, caption: 'Nuevo texto', hashtags: ['#nuevo'] };

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: existingDraft, error: null });
    sb.enqueue({ data: null, error: null });
    sb.enqueue({ data: updatedDraft, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'edit', caption: 'Nuevo texto', hashtags: ['#nuevo'] }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.caption).toBe('Nuevo texto');
    expect(body.data.hashtags).toEqual(['#nuevo']);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });

    expect(res.status).toBe(401);
  });

  it('(c) session.portalEmail ≠ resolved.portalEmail → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/autorizado/i);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });

    expect(res.status).toBe(403);
  });

  it('(e) IDOR: borrador pertenece a otra org → 403', async () => {
    // maybySingle devuelve null porque .eq portal_email filtra al borrador ajeno
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: null, error: null }); // ownership check → no encontrado
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/draft-de-otra-org`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: 'draft-de-otra-org' }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/sin acceso/i);
  });

  it('(extra) action inválida → 400', async () => {
    const existingDraft = { id: DRAFT_ID, portal_email: TEST_EMAIL, status: 'pending_approval', scheduled_for: null };

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: existingDraft, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/drafts/${DRAFT_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'publicar' }), // acción no válida
    });
    const res = await patchDraft(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, id: DRAFT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/action/i);
  });
});
