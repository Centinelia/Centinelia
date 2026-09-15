/**
 * Tests de comportamiento para:
 *   GET  /api/portal/[token]/social/templates
 *   POST /api/portal/[token]/social/templates/sync
 *   GET  /api/portal/[token]/social/calendar/[month]
 *   PUT  /api/portal/[token]/social/calendar/[month]
 *   POST /api/portal/[token]/social/calendar/[month]/approve
 *   GET  /api/portal/[token]/social/metrics
 *
 * Cubre por endpoint:
 *   (a) Camino feliz
 *   (b) Sin cookie de sesión → 401
 *   (c) session.portalEmail ≠ resolved.portalEmail → 403
 *   (d) Feature flag desactivado → 403
 *   (+ casos especiales según endpoint)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Mocks hoisted ─────────────────────────────────────────────────────────────

const {
  mockVerifySession,
  mockResolveOrg,
  mockRequireSocialFeature,
  mockCreateAdminClient,
  mockListBrandTemplates,
} = vi.hoisted(() => ({
  mockVerifySession:          vi.fn(),
  mockResolveOrg:             vi.fn(),
  mockRequireSocialFeature:   vi.fn(),
  mockCreateAdminClient:      vi.fn(),
  mockListBrandTemplates:     vi.fn(),
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

// Mock de CanvaProvider como función constructora (clase mock)
vi.mock('@/lib/social/canva', () => {
  function MockCanvaProvider() {
    return { listBrandTemplates: mockListBrandTemplates };
  }
  MockCanvaProvider.prototype.listBrandTemplates = mockListBrandTemplates;
  return { CanvaProvider: MockCanvaProvider };
});

import { GET as getTemplates } from '../templates/route';
import { POST as syncTemplates } from '../templates/sync/route';
import { GET as getCalendar, PUT as putCalendar } from '../calendar/[month]/route';
import { POST as approveCalendar } from '../calendar/[month]/approve/route';
import { GET as getMetrics } from '../metrics/route';

// ─── Constantes ──────────────────────────────────────────────────────────────

const TEST_EMAIL     = 'nazre20+navi-cal-metrics-test@gmail.com';
const OTHER_EMAIL    = 'nazre20+navi-other@gmail.com';
const TEST_ORG_TOKEN = 'test-tok-cal-metrics-abc';
const AGENT_ID       = 'agent-uuid-cal-001';
const DRAFT_ID       = 'draft-uuid-met-001';
const MONTH          = '2026-10';
const CAL_ID         = 'cal-uuid-001';

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
 * Crea un mock de Supabase con cola de resultados sequenciales.
 * La chain fluida soporta todos los métodos del query builder.
 */
function makeQueuedSbMock() {
  const queue: Array<{ data: unknown; error: unknown }> = [];
  const enqueue = (r: { data?: unknown; error?: unknown }) =>
    queue.push({ data: r.data ?? null, error: r.error ?? null });
  const dequeue = () => queue.shift() ?? { data: null, error: null };

  const chain: Record<string, unknown> = {};
  chain.select      = vi.fn(() => chain);
  chain.eq          = vi.fn(() => chain);
  chain.order       = vi.fn(() => chain);
  chain.gte         = vi.fn(() => chain);
  chain.in          = vi.fn(() => chain);
  chain.upsert      = vi.fn(() => chain);
  chain.insert      = vi.fn(() => chain);
  chain.update      = vi.fn(() => chain);
  chain.delete      = vi.fn(() => chain);
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
 * Mock de lista simple (para endpoints GET de plantillas y métricas).
 */
function makeListMock(data: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  chain.select  = vi.fn(() => chain);
  chain.eq      = vi.fn(() => chain);
  chain.order   = vi.fn(() => chain);
  chain.gte     = vi.fn(() => chain);
  chain.then    = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(resolve));
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

// ─── GET /templates ───────────────────────────────────────────────────────────

describe('GET /api/portal/[token]/social/templates', () => {
  it('(a) camino feliz: devuelve plantillas de la org con ok: true', async () => {
    const templates = [{ id: 'tpl-001', name: 'Post Navi', category: 'post', active: true }];
    mockCreateAdminClient.mockReturnValue(makeListMock(templates));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates`);
    const res = await getTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Post Navi');
  });

  it('(a2) filtro ?category=post y ?active=true funciona', async () => {
    mockCreateAdminClient.mockReturnValue(makeListMock([]));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates?category=post&active=true`);
    const res = await getTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/templates`);
    const res = await getTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(401);
  });

  it('(c) session mismatch → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates`);
    const res = await getTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates`);
    const res = await getTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });
});

// ─── POST /templates/sync ────────────────────────────────────────────────────

describe('POST /api/portal/[token]/social/templates/sync', () => {
  it('(a) camino feliz: sincroniza 2 plantillas desde Canva, synced: 2', async () => {
    const canvaTemplates = [
      { id: 'canva-tpl-001', title: 'Post Verano', viewUrl: 'https://canva.com/t1', previewUrl: 'https://cdn.canva.com/t1.png' },
      { id: 'canva-tpl-002', title: 'Reel Promo',  viewUrl: 'https://canva.com/t2', previewUrl: 'https://cdn.canva.com/t2.png' },
    ];
    mockListBrandTemplates.mockResolvedValue(canvaTemplates);

    const sb = makeQueuedSbMock();
    // integration_accounts lookup → token de Canva encontrado
    sb.enqueue({ data: { access_token: 'canva-at-xyz' }, error: null });
    // upsert de brand_templates → sin error
    sb.enqueue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates/sync`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: AGENT_ID }),
    });
    const res = await syncTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.synced).toBe(2);
  });

  it('(a2) sin integración de Canva activa → 400 con mensaje que menciona Canva', async () => {
    const sb = makeQueuedSbMock();
    // integration_accounts lookup → sin registro
    sb.enqueue({ data: null, error: null });
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates/sync`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: AGENT_ID }),
    });
    const res = await syncTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Canva/i);
  });

  it('(a3) sin agent_id en body → 400', async () => {
    mockCreateAdminClient.mockReturnValue({ from: vi.fn() });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates/sync`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await syncTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/agent_id/i);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/templates/sync`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: AGENT_ID }),
    });
    const res = await syncTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(401);
  });

  it('(c) session mismatch → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates/sync`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: AGENT_ID }),
    });
    const res = await syncTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/templates/sync`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: AGENT_ID }),
    });
    const res = await syncTemplates(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });
});

// ─── GET /calendar/[month] ────────────────────────────────────────────────────

describe('GET /api/portal/[token]/social/calendar/[month]', () => {
  it('(a) camino feliz: devuelve calendario y slots del mes', async () => {
    const calendar = { id: CAL_ID, month: '2026-10-01', status: 'draft', portal_email: TEST_EMAIL };
    const slots    = [{ id: 'slot-001', calendar_id: CAL_ID, scheduled_for: '2026-10-05T10:00:00Z' }];

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: calendar, error: null }); // editorial_calendars maybySingle
    sb.enqueue({ data: slots,   error: null }); // calendar_slots then (lista)
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`);
    const res = await getCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(CAL_ID);
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0].id).toBe('slot-001');
  });

  it('(a2) sin calendario para el mes → data: null, slots: []', async () => {
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: null, error: null }); // editorial_calendars → no existe
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`);
    const res = await getCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toBeNull();
    expect(body.slots).toEqual([]);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`);
    const res = await getCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(401);
  });

  it('(c) session mismatch → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`);
    const res = await getCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(403);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`);
    const res = await getCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(403);
  });
});

// ─── PUT /calendar/[month] ────────────────────────────────────────────────────

describe('PUT /api/portal/[token]/social/calendar/[month]', () => {
  it('(a) camino feliz: crea calendario con 1 slot', async () => {
    const calendar = { id: CAL_ID, month: '2026-10-01', status: 'draft', portal_email: TEST_EMAIL };
    const newSlots = [{ id: 'slot-001', calendar_id: CAL_ID, scheduled_for: '2026-10-05T10:00:00Z' }];

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: calendar,  error: null }); // upsert editorial_calendars → single
    sb.enqueue({ data: null,      error: null }); // delete calendar_slots
    sb.enqueue({ data: null,      error: null }); // insert slots
    sb.enqueue({ data: newSlots,  error: null }); // select slots final
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`, {
      method: 'PUT',
      body: JSON.stringify({
        slots: [{ scheduled_for: '2026-10-05T10:00:00Z', theme: 'Promo otoño', auto_publish: false }],
      }),
    });
    const res = await putCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(CAL_ID);
    expect(body.slots).toHaveLength(1);
  });

  it('(a2) PUT con slots vacíos → limpia slots existentes', async () => {
    const calendar = { id: CAL_ID, month: '2026-10-01', status: 'draft', portal_email: TEST_EMAIL };

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: calendar, error: null }); // upsert
    sb.enqueue({ data: null, error: null });     // delete
    sb.enqueue({ data: [], error: null });       // select slots (vacío)
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`, {
      method: 'PUT',
      body: JSON.stringify({ slots: [] }),
    });
    const res = await putCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slots).toEqual([]);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`, {
      method: 'PUT',
      body: JSON.stringify({ slots: [] }),
    });
    const res = await putCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(401);
  });

  it('(c) session mismatch → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`, {
      method: 'PUT',
      body: JSON.stringify({ slots: [] }),
    });
    const res = await putCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(403);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}`, {
      method: 'PUT',
      body: JSON.stringify({ slots: [] }),
    });
    const res = await putCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(403);
  });
});

// ─── POST /calendar/[month]/approve ──────────────────────────────────────────

describe('POST /api/portal/[token]/social/calendar/[month]/approve', () => {
  it('(a) camino feliz: marca calendar.status=approved y approved_by', async () => {
    const calendar         = { id: CAL_ID, portal_email: TEST_EMAIL, status: 'draft' };
    const approvedCalendar = { ...calendar, status: 'approved', approved_by: TEST_EMAIL };

    const sb = makeQueuedSbMock();
    sb.enqueue({ data: calendar,         error: null }); // maybySingle: fetchear calendario
    sb.enqueue({ data: approvedCalendar, error: null }); // single: post-update
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}/approve`, {
      method: 'POST',
    });
    const res = await approveCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('approved');
    expect(body.data.approved_by).toBe(TEST_EMAIL);
  });

  it('(a2) calendario no existe para ese mes → 404 con mensaje que menciona "mes"', async () => {
    const sb = makeQueuedSbMock();
    sb.enqueue({ data: null, error: null }); // calendario no encontrado
    mockCreateAdminClient.mockReturnValue(sb);

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/2099-99/approve`, {
      method: 'POST',
    });
    const res = await approveCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: '2099-99' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/mes/i);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}/approve`, {
      method: 'POST',
    });
    const res = await approveCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(401);
  });

  it('(c) session mismatch → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}/approve`, {
      method: 'POST',
    });
    const res = await approveCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(403);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/calendar/${MONTH}/approve`, {
      method: 'POST',
    });
    const res = await approveCalendar(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN, month: MONTH }) });
    expect(res.status).toBe(403);
  });
});

// ─── GET /metrics ─────────────────────────────────────────────────────────────

describe('GET /api/portal/[token]/social/metrics', () => {
  it('(a) camino feliz: agrega snapshots 24h/7d/30d por content_draft_id', async () => {
    const rawMetrics = [
      { content_draft_id: DRAFT_ID, published_permalink: 'https://ig.com/p/abc', snapshot_window: '24h', likes: 10, comments: 2, shares: 1, reach: 500, impressions: 600, content_drafts: { portal_email: TEST_EMAIL, agent_id: AGENT_ID } },
      { content_draft_id: DRAFT_ID, published_permalink: 'https://ig.com/p/abc', snapshot_window: '7d',  likes: 80, comments: 15, shares: 8, reach: 2000, impressions: 2500, content_drafts: { portal_email: TEST_EMAIL, agent_id: AGENT_ID } },
      { content_draft_id: DRAFT_ID, published_permalink: 'https://ig.com/p/abc', snapshot_window: '30d', likes: 200, comments: 40, shares: 20, reach: 5000, impressions: 6000, content_drafts: { portal_email: TEST_EMAIL, agent_id: AGENT_ID } },
    ];

    mockCreateAdminClient.mockReturnValue(makeListMock(rawMetrics));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/metrics`);
    const res = await getMetrics(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);

    const entry = body.data[0];
    expect(entry.content_draft_id).toBe(DRAFT_ID);
    expect(entry.published_permalink).toBe('https://ig.com/p/abc');
    // Snapshots agrupados correctamente
    expect(entry.snapshots['24h']).not.toBeNull();
    expect(entry.snapshots['24h'].likes).toBe(10);
    expect(entry.snapshots['7d']).not.toBeNull();
    expect(entry.snapshots['7d'].likes).toBe(80);
    expect(entry.snapshots['30d']).not.toBeNull();
    expect(entry.snapshots['30d'].likes).toBe(200);
  });

  it('(a2) ventanas desconocidas se ignoran en los snapshots', async () => {
    const rawMetrics = [
      { content_draft_id: DRAFT_ID, published_permalink: null, snapshot_window: '1h', likes: 5, comments: 0, shares: 0, reach: 50, impressions: 60, content_drafts: { portal_email: TEST_EMAIL, agent_id: AGENT_ID } },
    ];

    mockCreateAdminClient.mockReturnValue(makeListMock(rawMetrics));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/metrics`);
    const res = await getMetrics(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    // El draft existe pero sin snapshots conocidos
    expect(body.data[0].snapshots['24h']).toBeNull();
    expect(body.data[0].snapshots['7d']).toBeNull();
    expect(body.data[0].snapshots['30d']).toBeNull();
  });

  it('(a3) sin métricas → data: []', async () => {
    mockCreateAdminClient.mockReturnValue(makeListMock([]));

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/metrics`);
    const res = await getMetrics(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('(b) sin cookie de sesión → 401', async () => {
    mockVerifySession.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/portal/${TEST_ORG_TOKEN}/social/metrics`);
    const res = await getMetrics(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(401);
  });

  it('(c) session mismatch → 403', async () => {
    mockResolveOrg.mockResolvedValue({ portalEmail: OTHER_EMAIL, orgToken: 'other-tok', legacy: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/metrics`);
    const res = await getMetrics(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });

  it('(d) feature flag desactivado → 403', async () => {
    mockRequireSocialFeature.mockResolvedValue({ enabled: false, agencyMode: false });

    const req = makeRequest(`/api/portal/${TEST_ORG_TOKEN}/social/metrics`);
    const res = await getMetrics(req, { params: Promise.resolve({ token: TEST_ORG_TOKEN }) });
    expect(res.status).toBe(403);
  });
});
