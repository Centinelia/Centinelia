/**
 * Unit tests — cron navi-publish-scheduled-posts
 *
 * Estrategia: supabase + buildPublisher mockeados. Verifica lógica de
 * skip/cancel/publish/retry sin tocar APIs externas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks hoisted ───────────────────────────────────────────────────────────

const {
  mockSbFrom,
  mockBuildPublisher,
  mockVerifyCronAuth,
  mockCreateAdminClient,
} = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockBuild = vi.fn();
  const mockVerify = vi.fn();
  const mockCreate = vi.fn();
  return {
    mockSbFrom:           mockFrom,
    mockBuildPublisher:   mockBuild,
    mockVerifyCronAuth:   mockVerify,
    mockCreateAdminClient: mockCreate,
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}));

vi.mock('@/lib/social/publishers', () => ({
  buildPublisher: mockBuildPublisher,
}));

// Importar DESPUÉS de los mocks
import { GET } from '../publish-scheduled-posts/route';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(auth = true): Request {
  return new Request('http://localhost/api/cron/publish-scheduled-posts', {
    headers: auth ? { authorization: 'Bearer test-cron-secret' } : {},
  });
}

// Construye un social_account mínimo
function makeSocialAccount(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                  'acct-1',
    portal_email:        'nazre20@gmail.com',
    agent_id:            'agent-1',
    provider:            'meta_instagram',
    external_account_id: 'ig-123',
    external_username:   'test_handle',
    page_id:             null,
    brand_summary:       null,
    denylist_words:      [],
    paused:              false,
    status:              'active',
    metadata:            {},
    access_token:        'tok-1',
    refresh_token:       null,
    expires_at:          null,
    ...overrides,
  };
}

// Construye un draft mínimo
function makeDraft(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                 'draft-1',
    caption:            'Texto del post',
    hashtags:           ['#test'],
    media_type:         'image',
    media_urls:         ['https://example.com/img.jpg'],
    retry_count:        0,
    social_account_id:  'acct-1',
    social_accounts:    makeSocialAccount(),
    organizations:      { account_status: 'active' },
    voice_agents:       { features: { social_publishing: { enabled: true } } },
    ...overrides,
  };
}

// Construye la cadena de supabase mock fluent
function buildSelectChain(data: unknown[], error: unknown = null) {
  const chain = {
    in:     vi.fn().mockReturnThis(),
    not:    vi.fn().mockReturnThis(),
    lte:    vi.fn().mockReturnThis(),
    limit:  vi.fn().mockResolvedValue({ data, error }),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return chain;
}

function buildUpdateChain(error: unknown = null) {
  return {
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockResolvedValue({ data: null, error }),
  };
}

// supabase mock que retorna update chain para content_drafts
function buildSupaMock(draftRows: unknown[], updateError: unknown = null) {
  const selectChain = buildSelectChain(draftRows);
  const updateChain = buildUpdateChain(updateError);

  const cron_runs = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybySingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const sb = {
    from: vi.fn((table: string) => {
      if (table === 'content_drafts') {
        // Primer llamado = select con filter chain; resto = update chains
        let callCount = 0;
        const t = {
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn().mockReturnValue({
            ...updateChain,
            eq: vi.fn().mockResolvedValue({ data: null, error: updateError }),
          }),
        };
        return t;
      }
      // cron_runs
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'run-id' }, error: null }),
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  };
  return sb;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('navi-publish-scheduled-posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyCronAuth.mockReturnValue(true);
  });

  // ── (a) Happy path: publica 1 draft scheduled ────────────────────────────

  it('(a) publica un draft scheduled exitosamente', async () => {
    const mockPublisher = {
      createMediaContainer:  vi.fn().mockResolvedValue({ containerId: 'ctr-1' }),
      waitForContainerReady: vi.fn().mockResolvedValue('ready'),
      publishContainer:      vi.fn().mockResolvedValue({ mediaId: 'media-123', permalink: 'https://ig.com/p/abc' }),
    };
    mockBuildPublisher.mockReturnValue(mockPublisher);

    const draft = makeDraft();

    // Supabase: selecta 1 draft; todos los updates exitosos
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
    const selectChain = {
      in:    vi.fn().mockReturnThis(),
      not:   vi.fn().mockReturnThis(),
      lte:   vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
    };

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: updateFn,
          };
        }
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'run-1' }, error: null }),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect((body.metadata as Record<string, number>).published).toBe(1);
    expect((body.metadata as Record<string, number>).failed).toBe(0);
    expect(mockPublisher.createMediaContainer).toHaveBeenCalledOnce();
    expect(mockPublisher.waitForContainerReady).toHaveBeenCalledWith('ctr-1');
    expect(mockPublisher.publishContainer).toHaveBeenCalledWith('ctr-1');
  });

  // ── (b) Cuenta pausada → skip, draft no se cancela ───────────────────────

  it('(b) skip draft cuya social_account está pausada', async () => {
    const draft = makeDraft({
      social_accounts: makeSocialAccount({ paused: true }),
    });

    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });
    const selectChain = {
      in:    vi.fn().mockReturnThis(),
      not:   vi.fn().mockReturnThis(),
      lte:   vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
    };

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return { select: vi.fn().mockReturnValue(selectChain), update: updateFn };
        }
        return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect((body.metadata as Record<string, number>).skipped).toBe(1);
    expect((body.metadata as Record<string, number>).published).toBe(0);
    // update no debe haberse llamado para 'cancelled' ni 'publishing'
    expect(updateFn).not.toHaveBeenCalled();
    expect(mockBuildPublisher).not.toHaveBeenCalled();
  });

  // ── (c) Org inactiva → cancela draft con 'org_inactive' ──────────────────

  it('(c) cancela draft si org.account_status !== active', async () => {
    const draft = makeDraft({
      organizations: { account_status: 'suspended' },
      voice_agents:  { features: { social_publishing: { enabled: true } } },
    });

    const updateEqFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateFn   = vi.fn().mockReturnValue({ eq: updateEqFn });
    const selectChain = {
      in:    vi.fn().mockReturnThis(),
      not:   vi.fn().mockReturnThis(),
      lte:   vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
    };

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return { select: vi.fn().mockReturnValue(selectChain), update: updateFn };
        }
        return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect((body.metadata as Record<string, number>).cancelled).toBe(1);
    // update debe haberse llamado con status: 'cancelled' y error_message: 'org_inactive'
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled', error_message: 'org_inactive' }),
    );
    expect(mockBuildPublisher).not.toHaveBeenCalled();
  });

  // ── (d) Feature disabled → skip (sin cancelar) ───────────────────────────

  it('(d) skip draft si social_publishing.enabled !== true', async () => {
    const draft = makeDraft({
      organizations: { account_status: 'active' },
      voice_agents:  { features: { social_publishing: { enabled: false } } },
    });

    const updateFn = vi.fn();
    const selectChain = {
      in:    vi.fn().mockReturnThis(),
      not:   vi.fn().mockReturnThis(),
      lte:   vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
    };

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return { select: vi.fn().mockReturnValue(selectChain), update: updateFn };
        }
        return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect((body.metadata as Record<string, number>).skipped).toBe(1);
    expect((body.metadata as Record<string, number>).cancelled).toBe(0);
    expect(updateFn).not.toHaveBeenCalled();
    expect(mockBuildPublisher).not.toHaveBeenCalled();
  });

  // ── (e) Fallo 1er intento → retry_count=1, status='scheduled' ────────────

  it('(e) fallo primer intento → retry_count=1, status=scheduled, error_message set', async () => {
    const mockPublisher = {
      createMediaContainer: vi.fn().mockRejectedValue(new Error('API timeout')),
      waitForContainerReady: vi.fn(),
      publishContainer: vi.fn(),
    };
    mockBuildPublisher.mockReturnValue(mockPublisher);

    const draft = makeDraft({ retry_count: 0 });

    const updateEqFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateFn   = vi.fn().mockReturnValue({ eq: updateEqFn });
    const selectChain = {
      in:    vi.fn().mockReturnThis(),
      not:   vi.fn().mockReturnThis(),
      lte:   vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
    };

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return { select: vi.fn().mockReturnValue(selectChain), update: updateFn };
        }
        return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect((body.metadata as Record<string, number>).failed).toBe(1);
    // El segundo update (con retry info) debe tener status=scheduled y retry_count=1
    const updateCalls = updateFn.mock.calls as Array<[Record<string, unknown>]>;
    const retryCall = updateCalls.find(([args]) => args.retry_count !== undefined);
    expect(retryCall?.[0]).toMatchObject({ status: 'scheduled', retry_count: 1 });
    expect(typeof retryCall?.[0].error_message).toBe('string');
  });

  // ── (f) Fallo en 3er intento → status='failed' ───────────────────────────

  it('(f) fallo tercer intento (retry_count=2) → status=failed', async () => {
    const mockPublisher = {
      createMediaContainer: vi.fn().mockRejectedValue(new Error('Límite excedido')),
      waitForContainerReady: vi.fn(),
      publishContainer: vi.fn(),
    };
    mockBuildPublisher.mockReturnValue(mockPublisher);

    const draft = makeDraft({ retry_count: 2 });

    const updateEqFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateFn   = vi.fn().mockReturnValue({ eq: updateEqFn });
    const selectChain = {
      in:    vi.fn().mockReturnThis(),
      not:   vi.fn().mockReturnThis(),
      lte:   vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [draft], error: null }),
    };

    mockCreateAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'content_drafts') {
          return { select: vi.fn().mockReturnValue(selectChain), update: updateFn };
        }
        return { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r' }, error: null }), update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }),
    });

    const res = await GET(makeRequest() as never);
    const body = await res.json() as Record<string, unknown>;

    expect((body.metadata as Record<string, number>).failed).toBe(1);
    const updateCalls = updateFn.mock.calls as Array<[Record<string, unknown>]>;
    const retryCall = updateCalls.find(([args]) => args.retry_count !== undefined);
    expect(retryCall?.[0]).toMatchObject({ status: 'failed', retry_count: 3 });
  });
});
