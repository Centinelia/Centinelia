/**
 * Unit tests — cron navi-monitor-social-interactions
 *
 * Verifica routing de sentimiento → response_status, skip de cuentas pausadas,
 * upsert con UNIQUE (external_id, interaction_type) y actualización de
 * last_interaction_check_at.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks hoisted ───────────────────────────────────────────────────────────

const {
  mockBuildPublisher,
  mockClassifySentiment,
  mockVerifyCronAuth,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockBuildPublisher:    vi.fn(),
  mockClassifySentiment: vi.fn(),
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

vi.mock('@/lib/social/sentiment', () => ({
  classifySentiment: mockClassifySentiment,
}));

import { GET } from '../monitor-social-interactions/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/monitor-social-interactions', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

function makeAccount(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                  'acct-1',
    portal_email:        'nazre20@gmail.com',
    agent_id:            'agent-1',
    provider:            'meta_instagram',
    external_account_id: 'ig-123',
    external_username:   null,
    page_id:             null,
    brand_summary:       null,
    denylist_words:      [],
    paused:              false,
    status:              'active',
    metadata:            {},
    access_token:        'tok',
    refresh_token:       null,
    expires_at:          null,
    ...overrides,
  };
}

function makePublisherWithInteractions(
  comments: Array<{ id: string; from: string; text: string; createdAt: Date }> = [],
  dms: Array<{ id: string; threadId: string; from: string; text: string; createdAt: Date }> = [],
) {
  return {
    listRecentComments: vi.fn().mockResolvedValue(comments),
    listRecentDms:      vi.fn().mockResolvedValue(dms),
  };
}

const NOW = new Date('2026-09-15T10:00:00Z');

// Construye mock de supabase para el cron de interacciones
function buildSb(
  accounts: unknown[],
  drafts:   unknown[] = [],
  upsertError: unknown = null,
) {
  const upsertFn  = vi.fn().mockResolvedValue({ error: upsertError });
  const updateFn  = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

  return {
    upsertFn,
    updateFn,
    sb: {
      from: vi.fn((table: string) => {
        if (table === 'social_accounts') {
          // Primer llamado: SELECT de cuentas; segundo llamado: UPDATE metadata
          let call = 0;
          return {
            select: vi.fn().mockReturnValue({
              eq:    vi.fn().mockReturnThis(),
              eq2:   vi.fn().mockReturnThis(),
              // encadena múltiples eq
              _build: function() { return this; },
            }),
            // Para el select real necesitamos retornar un mock que termine con data
            _selectResult: vi.fn().mockResolvedValue({ data: accounts, error: null }),
            update: updateFn,
          };
        }
        if (table === 'content_drafts') {
          return {
            select: vi.fn().mockReturnValue({
              eq:    vi.fn().mockReturnThis(),
              not:   vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({ data: drafts, error: null }),
            }),
          };
        }
        if (table === 'social_interactions') {
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

// Versión simplificada con todos los métodos encadenados correctamente
function buildSimpleSb(
  accounts: unknown[],
  drafts:   unknown[] = [],
  upsertError: unknown = null,
) {
  const upsertFn  = vi.fn().mockResolvedValue({ error: upsertError });
  const updateEq  = vi.fn().mockResolvedValue({ error: null });
  const updateFn  = vi.fn().mockReturnValue({ eq: updateEq });

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'social_accounts') {
        return {
          select: vi.fn().mockReturnValue({
            eq:  vi.fn().mockReturnThis(),
            eq2: vi.fn().mockReturnThis(),
            // El handler hace: .eq('provider',...).eq('status',...).eq('paused',...)
            // Necesitamos que al final de la cadena de .eq se retorne data
            // Construimos un proxy que devuelve `this` en .eq y .select,
            // y una Promise en el último .eq
            _chain: true,
          }),
          update: updateFn,
        };
      }
      if (table === 'content_drafts') {
        return {
          select: vi.fn().mockReturnValue({
            eq:    vi.fn().mockReturnThis(),
            not:   vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: drafts, error: null }),
          }),
        };
      }
      if (table === 'social_interactions') {
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
  };

  // Monkey-patch: cuando se llame .from('social_accounts').select(...).eq(...).eq(...).eq(...)
  // el resultado debe ser `{ data: accounts, error: null }`
  // Hacemos esto interceptando la cadena completa:
  const origFrom = sb.from.bind(sb);
  sb.from = vi.fn((table: string) => {
    const result = origFrom(table);
    if (table === 'social_accounts') {
      // Retornar un proxy que siempre devuelve `this` en métodos de filtro
      // y resuelve con `accounts` al awaitar
      const eqChain: Record<string, unknown> = {
        eq:     vi.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: accounts, error: null }),
        update: updateFn,
      };
      Object.assign(eqChain, { [Symbol.iterator]: undefined });
      // El handler espera: await supabase.from('social_accounts').select(...).eq(...).eq(...).eq(...)
      // Hacemos que select() retorne el eqChain thenable
      return {
        select: vi.fn().mockReturnValue(eqChain),
        update: updateFn,
      };
    }
    return result;
  });

  return { upsertFn, updateFn, updateEq, sb };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('navi-monitor-social-interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(true);
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (a) Comentario positivo → response_status='auto_replied' ─────────────

  it('(a) comentario positive → auto_replied', async () => {
    mockClassifySentiment.mockResolvedValue('positive');
    const publisher = makePublisherWithInteractions(
      [{ id: 'cmt-1', from: 'user1', text: '¡Excelente servicio!', createdAt: NOW }],
    );
    mockBuildPublisher.mockReturnValue(publisher);

    const { upsertFn, sb } = buildSimpleSb(
      [makeAccount()],
      [{ id: 'draft-1', published_media_id: 'media-1' }],
    );
    mockCreateAdminClient.mockReturnValue(sb);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(body.errors_count).toBe(0);
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ response_status: 'auto_replied', external_id: 'cmt-1', interaction_type: 'comment' }),
      expect.objectContaining({ onConflict: 'external_id,interaction_type' }),
    );
  });

  // ── (b) Comentario neutral → pending_approval ────────────────────────────

  it('(b) comentario neutral → pending_approval', async () => {
    mockClassifySentiment.mockResolvedValue('neutral');
    const publisher = makePublisherWithInteractions(
      [{ id: 'cmt-2', from: 'user2', text: '¿A qué hora abren?', createdAt: NOW }],
    );
    mockBuildPublisher.mockReturnValue(publisher);

    const { upsertFn, sb } = buildSimpleSb(
      [makeAccount()],
      [{ id: 'draft-1', published_media_id: 'media-1' }],
    );
    mockCreateAdminClient.mockReturnValue(sb);

    await GET(makeRequest() as never);

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ response_status: 'pending_approval' }),
      expect.anything(),
    );
  });

  // ── (c) Comentario negative → escalated_to_human ────────────────────────

  it('(c) comentario negative → escalated_to_human', async () => {
    mockClassifySentiment.mockResolvedValue('negative');
    const publisher = makePublisherWithInteractions(
      [{ id: 'cmt-3', from: 'user3', text: 'Muy mal servicio', createdAt: NOW }],
    );
    mockBuildPublisher.mockReturnValue(publisher);

    const { upsertFn, sb } = buildSimpleSb(
      [makeAccount()],
      [{ id: 'draft-1', published_media_id: 'media-1' }],
    );
    mockCreateAdminClient.mockReturnValue(sb);

    await GET(makeRequest() as never);

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ response_status: 'escalated_to_human' }),
      expect.anything(),
    );
  });

  // ── (d) Sentiment crisis → escalated_to_human ────────────────────────────

  it('(d) sentiment crisis → escalated_to_human', async () => {
    mockClassifySentiment.mockResolvedValue('crisis');
    const publisher = makePublisherWithInteractions(
      [{ id: 'cmt-4', from: 'user4', text: 'Voy a demandar a esta empresa', createdAt: NOW }],
    );
    mockBuildPublisher.mockReturnValue(publisher);

    const { upsertFn, sb } = buildSimpleSb(
      [makeAccount()],
      [{ id: 'draft-1', published_media_id: 'media-1' }],
    );
    mockCreateAdminClient.mockReturnValue(sb);

    await GET(makeRequest() as never);

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ response_status: 'escalated_to_human' }),
      expect.anything(),
    );
  });

  // ── (e) Cuenta pausada → skip, publisher no se llama ────────────────────

  it('(e) skip cuenta pausada — publisher no se llama', async () => {
    const publisher = makePublisherWithInteractions();
    mockBuildPublisher.mockReturnValue(publisher);

    // La cuenta tiene paused=true → el query SELECT filtra por paused=false, no la retorna
    const { sb } = buildSimpleSb([]); // 0 cuentas activas (pausada fue filtrada en DB)
    mockCreateAdminClient.mockReturnValue(sb);

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(body.errors_count).toBe(0);
    // No se llamó buildPublisher porque no hay cuentas
    expect(mockBuildPublisher).not.toHaveBeenCalled();
  });

  // ── (f) Upsert duplicado ignorado (external_id + interaction_type) ───────

  it('(f) upsert con ignoreDuplicates=true para UNIQUE (external_id, interaction_type)', async () => {
    mockClassifySentiment.mockResolvedValue('positive');
    const comment = { id: 'cmt-dup', from: 'user_dup', text: 'Gracias', createdAt: NOW };
    const publisher = makePublisherWithInteractions([comment]);
    mockBuildPublisher.mockReturnValue(publisher);

    const { upsertFn, sb } = buildSimpleSb(
      [makeAccount()],
      [{ id: 'draft-1', published_media_id: 'media-1' }],
    );
    mockCreateAdminClient.mockReturnValue(sb);

    await GET(makeRequest() as never);

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ external_id: 'cmt-dup' }),
      expect.objectContaining({ onConflict: 'external_id,interaction_type', ignoreDuplicates: true }),
    );
  });

  // ── (g) Actualiza last_interaction_check_at en metadata ──────────────────

  it('(g) actualiza last_interaction_check_at en social_accounts.metadata', async () => {
    mockClassifySentiment.mockResolvedValue('neutral');
    const publisher = makePublisherWithInteractions([]);
    mockBuildPublisher.mockReturnValue(publisher);

    const { updateFn, sb } = buildSimpleSb([makeAccount()]);
    mockCreateAdminClient.mockReturnValue(sb);

    await GET(makeRequest() as never);

    // update en social_accounts debe haberse llamado con metadata que incluye last_interaction_check_at
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          last_interaction_check_at: NOW.toISOString(),
        }),
      }),
    );
  });
});
