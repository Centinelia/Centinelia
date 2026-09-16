/**
 * Unit tests — cron navi-refresh-social-metrics
 *
 * Verifica lógica de selección de snapshots y respeto al UNIQUE
 * (content_draft_id, snapshot_type).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks hoisted ───────────────────────────────────────────────────────────

const {
  mockBuildPublisher,
  mockVerifyCronAuth,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockBuildPublisher:    vi.fn(),
  mockVerifyCronAuth:    vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}));

vi.mock('@/lib/social/publishers', () => ({
  buildPublisher: mockBuildPublisher,
}));

import { GET } from '../refresh-social-metrics/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/refresh-social-metrics', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

function makePublisher(metricsOverrides: Partial<Record<string, unknown>> = {}) {
  return {
    fetchMetrics: vi.fn().mockResolvedValue({
      impressions: 1000,
      reach:       800,
      likes:       50,
      comments:    5,
      shares:      3,
      saves:       10,
      plays:       null,
      rawResponse: {},
      ...metricsOverrides,
    }),
  };
}

const NOW = new Date('2026-09-15T10:00:00Z');

// draft publicado hace 25 horas
const PUBLISHED_25H_AGO = new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString();
// draft publicado hace 8 días
const PUBLISHED_8D_AGO  = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
// draft publicado hace 31 días
const PUBLISHED_31D_AGO = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
// draft publicado hace 10 horas (< 24h)
const PUBLISHED_10H_AGO = new Date(NOW.getTime() - 10 * 60 * 60 * 1000).toISOString();

function makeDraft(publishedAt: string, mediaId = 'media-1') {
  return {
    id:                  'draft-1',
    published_at:        publishedAt,
    published_media_id:  mediaId,
    social_account_id:   'acct-1',
    social_accounts:     {
      id: 'acct-1', portal_email: 'nazre20@gmail.com', agent_id: 'ag-1',
      provider: 'meta_instagram', external_account_id: 'ig-1',
      external_username: null, page_id: null, brand_summary: null,
      denylist_words: [], paused: false, status: 'active', metadata: {},
      access_token: 'tok', refresh_token: null, expires_at: null,
    },
  };
}

function buildSb(drafts: unknown[], existingSnapshots: unknown[] = [], upsertError: unknown = null) {
  let fromCallCount = 0;
  const upsertFn = vi.fn().mockReturnValue({ error: upsertError });

  return {
    upsertFn,
    sb: {
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return {
            select: vi.fn().mockReturnValue({
              eq:    vi.fn().mockReturnThis(),
              not:   vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: drafts, error: null }),
            }),
          };
        }
        if (table === 'social_metrics') {
          fromCallCount++;
          if (fromCallCount === 1) {
            // Primera llamada: select de existing snapshots
            return {
              select: vi.fn().mockReturnValue({
                eq:  vi.fn().mockReturnThis(),
                in:  vi.fn().mockResolvedValue({ data: existingSnapshots, error: null }),
              }),
              upsert: upsertFn,
            };
          }
          // Llamadas posteriores: upsert
          return { upsert: upsertFn };
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockResolvedValue({ error: null }),
        };
      }),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('navi-refresh-social-metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(true);
  });

  // ── (a) Inserta snapshot 24h para draft publicado hace 25h sin snapshot ──

  it('(a) crea snapshot 24h para draft publicado hace 25 horas', async () => {
    const publisher = makePublisher();
    mockBuildPublisher.mockReturnValue(publisher);

    const draft = makeDraft(PUBLISHED_25H_AGO);

    // social_metrics.select devuelve existentes vacío para esta draft
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const sbFrom = vi.fn((table: string) => {
      if (table === 'content_drafts') {
        return {
          select: vi.fn().mockReturnValue({
            eq:    vi.fn().mockReturnThis(),
            not:   vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
          }),
        };
      }
      if (table === 'social_metrics') {
        return {
          select: vi.fn().mockReturnValue({
            eq:  vi.fn().mockReturnThis(),
            in:  vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          upsert: upsertFn,
        };
      }
      return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    // Vitest fake now
    mockCreateAdminClient.mockReturnValue({ from: sbFrom });

    // Patch now en el handler vía el contexto que inyecta defineCron
    // Sobreescribimos createAdminClient + auth para que el NOW del test sea controlado
    // defineCron usa `new Date()` internamente — mockeamos Date
    vi.setSystemTime(NOW);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    // Al menos 1 snapshot creado
    expect(body.errors_count).toBe(0);
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot_type: '24h', content_draft_id: 'draft-1' }),
      expect.objectContaining({ onConflict: 'content_draft_id,snapshot_type' }),
    );

    vi.useRealTimers();
  });

  // ── (b) Upsert respeta UNIQUE — segunda ejecución no duplica ─────────────

  it('(b) segunda ejecución no duplica — snapshot 24h ya existe', async () => {
    const publisher = makePublisher();
    mockBuildPublisher.mockReturnValue(publisher);

    const draft = makeDraft(PUBLISHED_25H_AGO);

    // social_metrics.select retorna que '24h' ya existe
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const sbFrom = vi.fn((table: string) => {
      if (table === 'content_drafts') {
        return {
          select: vi.fn().mockReturnValue({
            eq:    vi.fn().mockReturnThis(),
            not:   vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
          }),
        };
      }
      if (table === 'social_metrics') {
        return {
          select: vi.fn().mockReturnValue({
            eq:  vi.fn().mockReturnThis(),
            in:  vi.fn().mockResolvedValue({ data: [{ snapshot_type: '24h' }], error: null }),
          }),
          upsert: upsertFn,
        };
      }
      return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    mockCreateAdminClient.mockReturnValue({ from: sbFrom });
    vi.setSystemTime(NOW);

    const res = await GET(makeRequest() as never);
    await res.json();

    // upsert no debe haberse llamado (snapshot ya existe)
    expect(upsertFn).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  // ── (c) Draft publicado hace <24h → no genera ningún snapshot ────────────

  it('(c) skip draft publicado hace menos de 24 horas', async () => {
    const publisher = makePublisher();
    mockBuildPublisher.mockReturnValue(publisher);

    const draft = makeDraft(PUBLISHED_10H_AGO);
    const upsertFn = vi.fn();

    const sbFrom = vi.fn((table: string) => {
      if (table === 'content_drafts') {
        return {
          select: vi.fn().mockReturnValue({
            eq:    vi.fn().mockReturnThis(),
            not:   vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
          }),
        };
      }
      if (table === 'social_metrics') {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          upsert: upsertFn,
        };
      }
      return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    mockCreateAdminClient.mockReturnValue({ from: sbFrom });
    vi.setSystemTime(NOW);

    await GET(makeRequest() as never);

    expect(publisher.fetchMetrics).not.toHaveBeenCalled();
    expect(upsertFn).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  // ── (d) Draft publicado hace 31 días → snapshots 24h, 7d, 30d ───────────

  it('(d) draft publicado hace 31 días genera snapshots 24h, 7d y 30d faltantes', async () => {
    const publisher = makePublisher();
    mockBuildPublisher.mockReturnValue(publisher);

    const draft = { ...makeDraft(PUBLISHED_31D_AGO), id: 'draft-old' };

    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const sbFrom = vi.fn((table: string) => {
      if (table === 'content_drafts') {
        return {
          select: vi.fn().mockReturnValue({
            eq:    vi.fn().mockReturnThis(),
            not:   vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
          }),
        };
      }
      if (table === 'social_metrics') {
        return {
          // Ningún snapshot existe aún
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          upsert: upsertFn,
        };
      }
      return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    mockCreateAdminClient.mockReturnValue({ from: sbFrom });
    vi.setSystemTime(NOW);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    // Debe haberse llamado fetchMetrics una vez
    expect(publisher.fetchMetrics).toHaveBeenCalledOnce();

    // 3 snapshots creados: 24h, 7d, 30d
    expect(upsertFn).toHaveBeenCalledTimes(3);
    const calledTypes = upsertFn.mock.calls.map(
      ([arg]: [Record<string, unknown>]) => arg.snapshot_type,
    );
    expect(calledTypes).toContain('24h');
    expect(calledTypes).toContain('7d');
    expect(calledTypes).toContain('30d');

    expect(body.errors_count).toBe(0);

    vi.useRealTimers();
  });

  // ── (e) Regression: 3 drafts todos too_recent NO debe reportar CRITICO ──
  //
  // Antes del fix, `expected = rows.length` (3) y `processed = 0` (todos hicieron
  // `continue` por edad < 24h). defineCron interpretaba processed<expected como
  // parcial y disparaba [CRITICO]. Ahora expected solo cuenta snapshots que
  // TOCABA crear — si todos skippean por lógica de negocio, expected=0.

  it('(e) 3 drafts todos <24h reporta expected=0 (no CRITICO)', async () => {
    const publisher = makePublisher();
    mockBuildPublisher.mockReturnValue(publisher);

    const drafts = [
      { ...makeDraft(PUBLISHED_10H_AGO), id: 'd-1' },
      { ...makeDraft(PUBLISHED_10H_AGO), id: 'd-2' },
      { ...makeDraft(PUBLISHED_10H_AGO), id: 'd-3' },
    ];

    const sbFrom = vi.fn((table: string) => {
      if (table === 'content_drafts') {
        return {
          select: vi.fn().mockReturnValue({
            eq:    vi.fn().mockReturnThis(),
            not:   vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: drafts, error: null }),
          }),
        };
      }
      return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    mockCreateAdminClient.mockReturnValue({ from: sbFrom });
    vi.setSystemTime(NOW);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as { expected: number; processed: number; errors_count: number; metadata: { skipped_too_recent: number } };

    expect(body.expected).toBe(0);
    expect(body.processed).toBe(0);
    expect(body.errors_count).toBe(0);
    expect(body.metadata.skipped_too_recent).toBe(3);

    vi.useRealTimers();
  });
});
