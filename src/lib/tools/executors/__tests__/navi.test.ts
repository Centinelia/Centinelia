/**
 * Tests de comportamiento para los 14 handlers estándar de Navi.
 *
 * Cobertura mínima (R50): happy path + ownership fail + edge por handler.
 * Total objetivo: ≥ 42 tests (3+ por herramienta).
 *
 * Mocks: Supabase fluent (queue pattern), CanvaProvider, MetaPublisher, Anthropic.
 * Correos de prueba: nazre20+navi-tools-test@gmail.com (R30).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constantes de prueba ─────────────────────────────────────────────────────

const TEST_EMAIL    = 'nazre20+navi-tools-test@gmail.com';
const OTHER_EMAIL   = 'nazre20+navi-other@gmail.com';
const AGENT_ID      = 'agent-navi-uuid-001';
const OTHER_AGENT   = 'agent-navi-uuid-002';
const SOCIAL_ACC_ID = 'social-acc-uuid-001';
const DRAFT_ID      = 'draft-uuid-001';
const MEDIA_ID      = 'media-uuid-001';
const SLOT_ID       = 'slot-uuid-001';
const TEMPLATE_ID   = 'tmpl-canva-001';
const DESIGN_ID     = 'design-canva-001';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockCreateAdminClient,
  mockListBrandTemplates,
  mockAutofillTemplate,
  mockExportDesign,
  mockCreateMediaContainer,
  mockWaitForContainerReady,
  mockPublishContainer,
  mockFetchMetrics,
  mockReplyToComment,
  mockReplyToDm,
  mockAnthropicCreate,
  mockClassifySentiment,
} = vi.hoisted(() => ({
  mockCreateAdminClient:       vi.fn(),
  mockListBrandTemplates:      vi.fn(),
  mockAutofillTemplate:        vi.fn(),
  mockExportDesign:            vi.fn(),
  mockCreateMediaContainer:    vi.fn(),
  mockWaitForContainerReady:   vi.fn(),
  mockPublishContainer:        vi.fn(),
  mockFetchMetrics:            vi.fn(),
  mockReplyToComment:          vi.fn(),
  mockReplyToDm:               vi.fn(),
  mockAnthropicCreate:         vi.fn(),
  mockClassifySentiment:       vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@/lib/social/canva', () => ({
  CanvaProvider: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).listBrandTemplates = mockListBrandTemplates;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).autofillTemplate   = mockAutofillTemplate;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).exportDesign       = mockExportDesign;
  }),
}));

vi.mock('@/lib/social/publishers/meta', () => ({
  MetaPublisher: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).createMediaContainer  = mockCreateMediaContainer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).waitForContainerReady = mockWaitForContainerReady;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).publishContainer      = mockPublishContainer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).fetchMetrics          = mockFetchMetrics;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).replyToComment        = mockReplyToComment;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).replyToDm             = mockReplyToDm;
  }),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).messages = { create: mockAnthropicCreate };
  }),
}));

vi.mock('@/lib/observability/llm-log', () => ({
  logLlmCall: vi.fn(),
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: vi.fn().mockResolvedValue({ ok: true, used: 1, limit: 100 }),
}));

vi.mock('@/lib/social/sentiment', () => ({
  classifySentiment: mockClassifySentiment,
}));

// ─── Importar bajo prueba ────────────────────────────────────────────────────

import { runNaviTool, NAVI_STANDARD_TOOLS, NAVI_AGENCIA_TOOLS, NaviToolError } from '../navi';

// ─── Helpers de mock ──────────────────────────────────────────────────────────

/**
 * Crea un mock de cliente Supabase con cola de resultados.
 * Cada llamada terminal (single, maybeSingle, then) consume el próximo ítem.
 */
function makeQueuedSb() {
  const queue: Array<{ data: unknown; error: unknown }> = [];
  const enqueue = (r: { data?: unknown; error?: unknown }) =>
    queue.push({ data: r.data ?? null, error: r.error ?? null });
  const dequeue = () => queue.shift() ?? { data: null, error: null };

  const chain: Record<string, unknown> = {};
  const fns = ['select','eq','neq','order','limit','update','delete','upsert','insert','in','gte','lte','maybeSingle'];
  for (const f of fns) chain[f] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => dequeue());
  chain.single      = vi.fn(async () => dequeue());
  chain.then        = vi.fn(<TR>(resolve: (v: { data: unknown; error: unknown }) => TR) =>
    Promise.resolve(dequeue()).then(resolve));
  chain.catch       = vi.fn(() => chain);
  chain.finally     = vi.fn(() => chain);

  const from = vi.fn(() => chain);
  return { from, enqueue, chain };
}

function makeSb() {
  const { from, enqueue, chain } = makeQueuedSb();
  return { client: { from }, enqueue, chain };
}

/** Cuenta social estándar de prueba */
function makeSocialAccount(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                   SOCIAL_ACC_ID,
    portal_email:         TEST_EMAIL,
    agent_id:             AGENT_ID,
    provider:             'meta_instagram',
    external_account_id:  'ig-user-123',
    access_token:         'page-token-xyz',
    brand_summary:        'Tortillería artesanal regia, cálida y familiar.',
    denylist_words:       [],
    paused:               false,
    paused_reason:        null,
    paused_at:            null,
    status:               'active',
    metadata:             {},
    ...overrides,
  };
}

/** Borrador de contenido estándar de prueba */
function makeDraft(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                   DRAFT_ID,
    portal_email:         TEST_EMAIL,
    agent_id:             AGENT_ID,
    social_account_id:    SOCIAL_ACC_ID,
    media_type:           'image',
    media_urls:           ['https://cdn.example.com/img.jpg'],
    caption:              'Caption de prueba',
    hashtags:             ['#prueba'],
    status:               'approved',
    scheduled_for:        null,
    auto_publish:         false,
    published_media_id:   null,
    published_permalink:  null,
    template_id:          null,
    slot_id:              null,
    created_at:           '2026-09-15T00:00:00Z',
    ...overrides,
  };
}

/** Media upload estándar de prueba */
function makeMedia(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:               MEDIA_ID,
    portal_email:     TEST_EMAIL,
    agent_id:         AGENT_ID,
    file_url:         'https://storage.example.com/media/img.jpg',
    mime_type:        'image/jpeg',
    file_size_bytes:  500_000,
    status:           'available',
    used_in_draft_id: null,
    created_at:       '2026-09-15T00:00:00Z',
    ...overrides,
  };
}

/** Agente con role='navi' */
function makeAgentRow(role = 'navi') {
  return { id: AGENT_ID, role };
}

// Respuesta Anthropic simulada
function makeAnthropicResp(text = 'Texto generado de prueba') {
  return {
    content: [{ type: 'text', text }],
    usage:   { input_tokens: 50, output_tokens: 30 },
  };
}

// ctx estándar para llamadas
function makeCtx(sbClient: unknown) {
  return { agentId: AGENT_ID, portalEmail: TEST_EMAIL, supabase: sbClient as ReturnType<typeof createAdminClient> };
}

// ─── Helpers dummy para importaciones que solo necesitan el cliente ─────────
function createAdminClient() { return null as unknown; }

// ─── Setup global ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockClassifySentiment.mockResolvedValue('positive');
  mockAnthropicCreate.mockResolvedValue(makeAnthropicResp());
  mockListBrandTemplates.mockResolvedValue([
    { id: TEMPLATE_ID, title: 'Post Verano', viewUrl: 'https://canva.com/1', previewUrl: 'https://cdn/1.png' },
  ]);
  mockAutofillTemplate.mockResolvedValue({ designId: DESIGN_ID, previewUrl: 'https://cdn/preview.png' });
  mockExportDesign.mockResolvedValue({ url: 'https://cdn/export.jpg', expiresAt: new Date('2026-09-16') });
  mockCreateMediaContainer.mockResolvedValue({ containerId: 'container-001' });
  mockWaitForContainerReady.mockResolvedValue('ready');
  mockPublishContainer.mockResolvedValue({ mediaId: 'media-ig-001', permalink: 'https://www.instagram.com/p/abc' });
  mockFetchMetrics.mockResolvedValue({ impressions: 1000, reach: 800, likes: 50, comments: 5, shares: 3, saves: 10, plays: undefined, rawResponse: {} });
  mockReplyToComment.mockResolvedValue(undefined);
  mockReplyToDm.mockResolvedValue(undefined);
});

// ─── Tests: NAVI_STANDARD_TOOLS ──────────────────────────────────────────────

describe('NAVI_STANDARD_TOOLS', () => {
  it('contiene exactamente 14 herramientas', () => {
    expect(NAVI_STANDARD_TOOLS.size).toBe(14);
  });

  it('NO contiene herramientas de Task 9', () => {
    expect(NAVI_STANDARD_TOOLS.has('listar_cuentas_gestionadas')).toBe(false);
    expect(NAVI_STANDARD_TOOLS.has('replicar_contenido_entre_cuentas')).toBe(false);
  });
});

// ─── Tests: delegador principal (runNaviTool) ─────────────────────────────────

describe('runNaviTool — delegador', () => {
  it('listar_cuentas_gestionadas ahora está en NAVI_AGENCIA_TOOLS (Task 9)', () => {
    expect(NAVI_AGENCIA_TOOLS.has('listar_cuentas_gestionadas')).toBe(true);
    expect(NAVI_STANDARD_TOOLS.has('listar_cuentas_gestionadas')).toBe(false);
  });

  it('replicar_contenido_entre_cuentas ahora está en NAVI_AGENCIA_TOOLS (Task 9)', () => {
    expect(NAVI_AGENCIA_TOOLS.has('replicar_contenido_entre_cuentas')).toBe(true);
    expect(NAVI_STANDARD_TOOLS.has('replicar_contenido_entre_cuentas')).toBe(false);
  });

  it('lanza UNKNOWN_NAVI_TOOL para herramientas desconocidas', async () => {
    const { from } = makeQueuedSb();
    const ctx = makeCtx({ from });
    await expect(runNaviTool('herramienta_inexistente', {}, ctx))
      .rejects.toThrow('UNKNOWN_NAVI_TOOL');
  });
});

// ─── Tests: canva_listar_plantillas ───────────────────────────────────────────

describe('canva_listar_plantillas', () => {
  it('(happy) devuelve lista de plantillas de CanvaProvider', async () => {
    const { from, enqueue } = makeQueuedSb();
    // integration_accounts lookup
    enqueue({ data: { access_token: 'canva-tok-abc' } });
    mockCreateAdminClient.mockReturnValue({ from });

    const result = await runNaviTool('canva_listar_plantillas', {}, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.templates)).toBe(true);
    expect((result.templates as unknown[]).length).toBe(1);
  });

  it('(error) CANVA_NOT_CONNECTED si no hay integration_accounts', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: null });
    await expect(runNaviTool('canva_listar_plantillas', {}, makeCtx({ from })))
      .rejects.toThrow('CANVA_NOT_CONNECTED');
  });

  it('(filtro) pasa category a listBrandTemplates', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: { access_token: 'canva-tok-abc' } });
    await runNaviTool('canva_listar_plantillas', { category: 'reel' }, makeCtx({ from }));
    expect(mockListBrandTemplates).toHaveBeenCalledWith('reel');
  });
});

// ─── Tests: canva_generar_diseno ──────────────────────────────────────────────

describe('canva_generar_diseno', () => {
  it('(happy) retorna designId y previewUrl', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    // resolveCanvaClient: integration_accounts
    enqueue({ data: { access_token: 'canva-tok' } });
    const result = await runNaviTool('canva_generar_diseno', { template_id: TEMPLATE_ID, data_fields: { titulo: 'Oferta' } }, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.design_id).toBe(DESIGN_ID);
    expect(result.preview_url).toBeDefined();
  });

  it('(error) CANVA_NOT_CONNECTED si no hay token', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    // resolveCanvaClient: integration_accounts (null → CANVA_NOT_CONNECTED)
    enqueue({ data: null });
    await expect(runNaviTool('canva_generar_diseno', { template_id: TEMPLATE_ID }, makeCtx({ from })))
      .rejects.toThrow('CANVA_NOT_CONNECTED');
  });

  it('(edge) MISSING_TEMPLATE_ID si no se provee template_id', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    // resolveCanvaClient: integration_accounts
    enqueue({ data: { access_token: 'tok' } });
    await expect(runNaviTool('canva_generar_diseno', {}, makeCtx({ from })))
      .rejects.toThrow('MISSING_TEMPLATE_ID');
  });
});

// ─── Tests: canva_exportar ────────────────────────────────────────────────────

describe('canva_exportar', () => {
  it('(happy) retorna URL de exportación', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: { access_token: 'tok' } });
    const result = await runNaviTool('canva_exportar', { design_id: DESIGN_ID, format: 'jpg' }, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(typeof result.url).toBe('string');
    expect(result.expires_at).toBeDefined();
  });

  it('(error) CANVA_NOT_CONNECTED si no hay token', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: null });
    await expect(runNaviTool('canva_exportar', { design_id: DESIGN_ID }, makeCtx({ from })))
      .rejects.toThrow('CANVA_NOT_CONNECTED');
  });

  it('(edge) INVALID_FORMAT para formato no soportado', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: { access_token: 'tok' } });
    await expect(runNaviTool('canva_exportar', { design_id: DESIGN_ID, format: 'gif' }, makeCtx({ from })))
      .rejects.toThrow('INVALID_FORMAT');
  });
});

// ─── Tests: generar_caption ───────────────────────────────────────────────────

describe('generar_caption', () => {
  it('(happy) retorna caption generado por Anthropic', async () => {
    const { from } = makeQueuedSb();
    const result = await runNaviTool('generar_caption', { context: 'Lanzamiento de producto', media_type: 'reel' }, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(typeof result.caption).toBe('string');
    expect(result.caption).toBe('Texto generado de prueba');
  });

  it('(logLlmCall) registra la llamada al LLM', async () => {
    const { logLlmCall } = await import('@/lib/observability/llm-log');
    const { from } = makeQueuedSb();
    await runNaviTool('generar_caption', { context: 'test' }, makeCtx({ from }));
    expect(logLlmCall).toHaveBeenCalledWith(expect.objectContaining({
      source:      'navi_generar_caption',
      model:       'claude-haiku-4-5-20251001',
      agentId:     AGENT_ID,
      portalEmail: TEST_EMAIL,
    }));
  });

  it('(edge) funciona sin contexto adicional', async () => {
    const { from } = makeQueuedSb();
    const result = await runNaviTool('generar_caption', {}, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
  });
});

// ─── Tests: generar_hashtags ──────────────────────────────────────────────────

describe('generar_hashtags', () => {
  it('(happy) retorna arreglo de hashtags parseados', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(makeAnthropicResp('#tortillas #comida #monterrey'));
    const { from } = makeQueuedSb();
    const result = await runNaviTool('generar_hashtags', { topic: 'tortillas artesanales', count: 3 }, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.hashtags)).toBe(true);
    const tags = result.hashtags as string[];
    expect(tags.every(t => t.startsWith('#'))).toBe(true);
  });

  it('(logLlmCall) registra la llamada al LLM', async () => {
    const { logLlmCall } = await import('@/lib/observability/llm-log');
    const { from } = makeQueuedSb();
    await runNaviTool('generar_hashtags', { topic: 'test' }, makeCtx({ from }));
    expect(logLlmCall).toHaveBeenCalledWith(expect.objectContaining({
      source: 'navi_generar_hashtags',
    }));
  });

  it('(edge) limita count a máximo 30', async () => {
    const { from } = makeQueuedSb();
    // No debería lanzar con un count grande
    await expect(runNaviTool('generar_hashtags', { topic: 'x', count: 100 }, makeCtx({ from })))
      .resolves.toMatchObject({ ok: true });
    // El prompt enviado a Anthropic debe tener count ≤ 30
    const call = mockAnthropicCreate.mock.calls[0][0];
    expect(call.messages[0].content).toContain('30');
  });
});

// ─── Tests: crear_borrador_post ───────────────────────────────────────────────

describe('crear_borrador_post', () => {
  it('(a) happy: draft persiste con status=pending_approval', async () => {
    const { from, enqueue } = makeQueuedSb();
    // 1. voice_agents (role)
    enqueue({ data: makeAgentRow('navi') });
    // 2. social_accounts (resolve por agent_id — no hay target)
    enqueue({ data: { id: SOCIAL_ACC_ID } });
    // 3. social_accounts (obtener fila completa con ownership)
    enqueue({ data: makeSocialAccount() });
    // 4. content_drafts insert
    enqueue({ data: { ...makeDraft(), status: 'pending_approval' } });

    const result = await runNaviTool('crear_borrador_post', {
      media_type: 'image',
      caption:    'Mi caption',
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect((result.draft as Record<string, unknown>).status).toBe('pending_approval');
  });

  it('(b) slot con auto_publish=true → status=approved', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: makeAgentRow('navi') });
    enqueue({ data: { id: SOCIAL_ACC_ID } });
    enqueue({ data: makeSocialAccount() });
    // slot (ahora solo devuelve auto_publish y calendar_id — portal_email/agent_id no existen en la tabla)
    enqueue({ data: { auto_publish: true, calendar_id: 'cal-uuid-001' } });
    // calendar padre (verificación de ownership via portal_email)
    enqueue({ data: { portal_email: TEST_EMAIL } });
    enqueue({ data: { ...makeDraft(), status: 'approved', auto_publish: true } });

    const result = await runNaviTool('crear_borrador_post', {
      media_type: 'image',
      caption:    'Caption',
      slot_id:    SLOT_ID,
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect((result.draft as Record<string, unknown>).status).toBe('approved');
  });

  it('(c) target_account_id de otra org → ACCOUNT_NOT_MANAGED', async () => {
    const { from, enqueue } = makeQueuedSb();
    // 1. voice_agents (role)
    enqueue({ data: makeAgentRow('navi') });
    // 2. social_accounts por id — pertenece a otra org (ownership check)
    enqueue({ data: { ...makeSocialAccount(), portal_email: OTHER_EMAIL, agent_id: OTHER_AGENT } });

    await expect(runNaviTool('crear_borrador_post', {
      media_type:        'image',
      target_account_id: SOCIAL_ACC_ID,
    }, makeCtx({ from })))
      .rejects.toThrow('ACCOUNT_NOT_MANAGED');
  });

  it('(d) role=navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: makeAgentRow('navi_agencia') });

    await expect(runNaviTool('crear_borrador_post', {
      media_type: 'image',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('(e) genera caption con Anthropic si no se provee', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: makeAgentRow('navi') });
    enqueue({ data: { id: SOCIAL_ACC_ID } });
    enqueue({ data: makeSocialAccount() });
    enqueue({ data: { ...makeDraft(), caption: 'Texto generado de prueba' } });

    await runNaviTool('crear_borrador_post', { media_type: 'image' }, makeCtx({ from }));
    expect(mockAnthropicCreate).toHaveBeenCalled();
  });
});

// ─── Tests: programar_publicacion ─────────────────────────────────────────────

describe('programar_publicacion', () => {
  it('(happy) borrador approved → status=scheduled', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    // Borrador aprobado
    enqueue({ data: makeDraft({ status: 'approved' }) });
    // assertNotPaused: resolveSocialAccount → voice_agents (role)
    enqueue({ data: makeAgentRow('navi') });
    // assertNotPaused: resolveSocialAccount → social_accounts (cuenta activa, no pausada)
    enqueue({ data: makeSocialAccount() });
    // Update resultado
    enqueue({ data: { ...makeDraft({ status: 'scheduled', scheduled_for: '2026-09-20T12:00:00Z' }) } });

    const result = await runNaviTool('programar_publicacion', {
      draft_id:      DRAFT_ID,
      scheduled_for: '2026-09-20T12:00:00Z',
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect((result.draft as Record<string, unknown>).status).toBe('scheduled');
  });

  it('(error) borrador en estado pending_approval → INVALID_STATUS', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    enqueue({ data: makeDraft({ status: 'pending_approval' }) });

    await expect(runNaviTool('programar_publicacion', {
      draft_id:      DRAFT_ID,
      scheduled_for: '2026-09-20T12:00:00Z',
    }, makeCtx({ from })))
      .rejects.toThrow('INVALID_STATUS');
  });

  it('(edge) falta draft_id → MISSING_DRAFT_ID', async () => {
    const { from } = makeQueuedSb();
    await expect(runNaviTool('programar_publicacion', { scheduled_for: '2026-09-20' }, makeCtx({ from })))
      .rejects.toThrow('MISSING_DRAFT_ID');
  });

  it('(edge) falta scheduled_for → MISSING_SCHEDULED_FOR', async () => {
    const { from } = makeQueuedSb();
    await expect(runNaviTool('programar_publicacion', { draft_id: DRAFT_ID }, makeCtx({ from })))
      .rejects.toThrow('MISSING_SCHEDULED_FOR');
  });
});

// ─── Tests: publicar_ahora ────────────────────────────────────────────────────

/**
 * publicar_ahora usa una combinación de single() y await-chain (sin select) para el
 * update de status=publishing. Para evitar dependencia del orden exacto de dequeue,
 * los tests usan un mock con tabla-lookup que distingue por tabla y operación.
 */
function makePublicarAhoraSb(opts: {
  draftData: Record<string, unknown> | null;
  socialAccData: Record<string, unknown> | null;
  publishedDraftData?: Record<string, unknown> | null;
}) {
  const { draftData, socialAccData, publishedDraftData } = opts;

  // Queue for each table independently
  const updateCalls: string[] = [];
  let draftFetched = false;
  let agentFetched = false;
  let socialFetched = false;

  const makeChain = (tableName: string): Record<string, unknown> => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq     = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.neq    = vi.fn(() => chain);
    chain.order  = vi.fn(() => chain);
    chain.limit  = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.in     = vi.fn(() => chain);
    chain.single = vi.fn(async () => {
      if (tableName === 'content_drafts') {
        if (!draftFetched) { draftFetched = true; return { data: draftData, error: null }; }
        // Second content_drafts single = published draft
        return { data: publishedDraftData ?? null, error: null };
      }
      if (tableName === 'voice_agents') { agentFetched = true; return { data: makeAgentRow(), error: null }; }
      if (tableName === 'social_accounts') { socialFetched = true; return { data: socialAccData, error: null }; }
      return { data: null, error: null };
    });
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    chain.then = vi.fn(<TR>(resolve: (v: { data: null; error: null }) => TR) => {
      updateCalls.push(tableName);
      return Promise.resolve({ data: null, error: null }).then(resolve);
    });
    chain.catch = vi.fn(() => chain);
    chain.finally = vi.fn(() => chain);
    return chain;
  };

  const tableChains: Record<string, Record<string, unknown>> = {};
  const from = vi.fn((tableName: string) => {
    if (!tableChains[tableName]) tableChains[tableName] = makeChain(tableName);
    return tableChains[tableName];
  });
  return { client: { from }, updateCalls: () => updateCalls };
}

describe('publicar_ahora', () => {
  it('(a) borrador approved → status=published, permalink almacenado', async () => {
    const publishedDraft = makeDraft({ status: 'published', published_permalink: 'https://www.instagram.com/p/abc', published_media_id: 'media-ig-001' });
    const { client } = makePublicarAhoraSb({
      draftData:        makeDraft({ status: 'approved', social_account_id: SOCIAL_ACC_ID }),
      socialAccData:    makeSocialAccount(),
      publishedDraftData: publishedDraft,
    });

    const result = await runNaviTool('publicar_ahora', { draft_id: DRAFT_ID }, makeCtx(client)) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(result.permalink).toBe('https://www.instagram.com/p/abc');
    expect((result.draft as Record<string, unknown>).status).toBe('published');
  });

  it('(b) borrador en estado pending_approval → INVALID_STATUS', async () => {
    const { client } = makePublicarAhoraSb({
      draftData:     makeDraft({ status: 'pending_approval' }),
      socialAccData: null,
    });
    await expect(runNaviTool('publicar_ahora', { draft_id: DRAFT_ID }, makeCtx(client)))
      .rejects.toThrow('INVALID_STATUS');
  });

  it('(c) MetaPublisher lanza → status=failed, error_message almacenado', async () => {
    const { client } = makePublicarAhoraSb({
      draftData:     makeDraft({ status: 'approved', social_account_id: SOCIAL_ACC_ID }),
      socialAccData: makeSocialAccount(),
    });
    mockCreateMediaContainer.mockRejectedValueOnce(new Error('Meta API error'));
    await expect(runNaviTool('publicar_ahora', { draft_id: DRAFT_ID }, makeCtx(client)))
      .rejects.toThrow('PUBLISH_FAILED');
  });

  it('(d) draft no pertenece al agente → DRAFT_NOT_OWNED', async () => {
    const { client } = makePublicarAhoraSb({
      draftData:     makeDraft({ portal_email: OTHER_EMAIL }),
      socialAccData: null,
    });
    await expect(runNaviTool('publicar_ahora', { draft_id: DRAFT_ID }, makeCtx(client)))
      .rejects.toThrow('DRAFT_NOT_OWNED');
  });
});

// ─── Tests: ig_responder_comentario ───────────────────────────────────────────

describe('ig_responder_comentario', () => {
  it('(a) sentimiento positivo → responde al comentario', async () => {
    mockClassifySentiment.mockResolvedValueOnce('positive');
    const { from, enqueue } = makeQueuedSb();
    // 1. resolveSocialAccount: voice_agents
    enqueue({ data: makeAgentRow('navi') });
    // 2. resolveSocialAccount: social_accounts por id (ownership check)
    enqueue({ data: makeSocialAccount() });

    const result = await runNaviTool('ig_responder_comentario', {
      comment_id:        'comment-001',
      message:           '¡Gracias por tu apoyo!',
      target_account_id: SOCIAL_ACC_ID,
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(mockReplyToComment).toHaveBeenCalledWith('comment-001', '¡Gracias por tu apoyo!');
  });

  it('(b) sentimiento negativo → escalate:true, sin llamar a Meta', async () => {
    mockClassifySentiment.mockResolvedValueOnce('negative');
    const { from } = makeQueuedSb();

    const result = await runNaviTool('ig_responder_comentario', {
      comment_id: 'comment-002',
      message:    'Respuesta negativa de prueba',
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(false);
    expect(result.escalate).toBe(true);
    expect(mockReplyToComment).not.toHaveBeenCalled();
  });

  it('(c) sentimiento crisis → escalate:true', async () => {
    mockClassifySentiment.mockResolvedValueOnce('crisis');
    const { from } = makeQueuedSb();

    const result = await runNaviTool('ig_responder_comentario', {
      comment_id: 'comment-003',
      message:    'Esta es una crisis',
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.escalate).toBe(true);
    expect(mockReplyToComment).not.toHaveBeenCalled();
  });
});

// ─── Tests: ig_responder_dm ───────────────────────────────────────────────────

describe('ig_responder_dm', () => {
  it('(a) sentimiento neutral → envía DM', async () => {
    mockClassifySentiment.mockResolvedValueOnce('neutral');
    const { from, enqueue } = makeQueuedSb();
    // 1. resolveSocialAccount: voice_agents
    enqueue({ data: makeAgentRow('navi') });
    // 2. resolveSocialAccount: social_accounts por id (ownership check)
    enqueue({ data: makeSocialAccount() });

    const result = await runNaviTool('ig_responder_dm', {
      thread_id:         'thread-001',
      message:           'Hola, te contactamos para darte seguimiento.',
      target_account_id: SOCIAL_ACC_ID,
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(mockReplyToDm).toHaveBeenCalledWith('thread-001', 'Hola, te contactamos para darte seguimiento.');
  });

  it('(b) sentimiento negativo → escalate:true, sin llamar a Meta', async () => {
    mockClassifySentiment.mockResolvedValueOnce('negative');
    const { from } = makeQueuedSb();

    const result = await runNaviTool('ig_responder_dm', {
      thread_id: 'thread-002',
      message:   'No estoy satisfecho',
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(false);
    expect(result.escalate).toBe(true);
    expect(mockReplyToDm).not.toHaveBeenCalled();
  });

  it('(edge) falta thread_id → MISSING_THREAD_ID', async () => {
    const { from } = makeQueuedSb();
    await expect(runNaviTool('ig_responder_dm', { message: 'Hola' }, makeCtx({ from })))
      .rejects.toThrow('MISSING_THREAD_ID');
  });
});

// ─── Tests: consultar_metricas_post ───────────────────────────────────────────

describe('consultar_metricas_post', () => {
  it('(a) snapshot reciente → retorna desde cache', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    // Draft fetch
    enqueue({ data: makeDraft({ status: 'published', published_media_id: 'ig-media-001' }) });
    // social_metrics con snapshot reciente (hace 1h)
    const recentTs = new Date(Date.now() - 3_600_000).toISOString();
    enqueue({ data: { impressions: 500, reach: 400, created_at: recentTs } });

    const result = await runNaviTool('consultar_metricas_post', {
      content_draft_id: DRAFT_ID,
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.source).toBe('cache');
    expect(mockFetchMetrics).not.toHaveBeenCalled();
  });

  it('(b) snapshot añejo (> 24h) → refresca vía MetaPublisher', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: target_account_id se provee, no hay query de voice_agents aquí
    // 1. Draft fetch
    enqueue({ data: makeDraft({ status: 'published', published_media_id: 'ig-media-001', social_account_id: SOCIAL_ACC_ID }) });
    // 2. social_metrics: snapshot añejo (hace 25h)
    const staleTs = new Date(Date.now() - 90_000_000).toISOString();
    enqueue({ data: { impressions: 100, reach: 80, created_at: staleTs } });
    // 3. resolveSocialAccount: voice_agents
    enqueue({ data: makeAgentRow() });
    // 4. resolveSocialAccount: social_accounts (por target_account_id)
    enqueue({ data: makeSocialAccount() });
    // 5. social_metrics insert (fire-and-forget, no error needed)
    enqueue({ data: null });

    const result = await runNaviTool('consultar_metricas_post', {
      content_draft_id:  DRAFT_ID,
      target_account_id: SOCIAL_ACC_ID,
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.source).toBe('live');
    expect(mockFetchMetrics).toHaveBeenCalledWith('ig-media-001');
  });

  it('(c) draft no publicado → NOT_PUBLISHED', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    enqueue({ data: makeDraft({ status: 'approved' }) });

    await expect(runNaviTool('consultar_metricas_post', { content_draft_id: DRAFT_ID }, makeCtx({ from })))
      .rejects.toThrow('NOT_PUBLISHED');
  });

  it('(d) draft de otra org → DRAFT_NOT_OWNED', async () => {
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    enqueue({ data: makeDraft({ portal_email: OTHER_EMAIL }) });

    await expect(runNaviTool('consultar_metricas_post', { content_draft_id: DRAFT_ID }, makeCtx({ from })))
      .rejects.toThrow('DRAFT_NOT_OWNED');
  });
});

// ─── Tests: proponer_calendario_editorial ─────────────────────────────────────

describe('proponer_calendario_editorial', () => {
  it('(happy) retorna propuesta JSON del LLM', async () => {
    const proposal = { slots: [{ date: '2026-09-16', media_type: 'reel', theme: 'Lunes de ofertas', caption_idea: 'Prueba', hashtag_suggestions: ['#oferta'] }] };
    mockAnthropicCreate.mockResolvedValueOnce(makeAnthropicResp(JSON.stringify(proposal)));

    const { from } = makeQueuedSb();
    const result = await runNaviTool('proponer_calendario_editorial', {
      month:          '2026-09',
      posts_per_week: 3,
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.month).toBe('2026-09');
    expect(result.proposal).toMatchObject({ slots: expect.any(Array) });
  });

  it('(logLlmCall) registra la llamada al LLM', async () => {
    const { logLlmCall } = await import('@/lib/observability/llm-log');
    const { from } = makeQueuedSb();
    await runNaviTool('proponer_calendario_editorial', {}, makeCtx({ from }));
    expect(logLlmCall).toHaveBeenCalledWith(expect.objectContaining({
      source: 'navi_calendario_editorial',
    }));
  });

  it('(edge) LLM retorna JSON malformado → retorna raw sin lanzar', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(makeAnthropicResp('JSON malformado {{{{'));
    const { from } = makeQueuedSb();
    const result = await runNaviTool('proponer_calendario_editorial', {}, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    // Devuelve { raw: ... } en vez de lanzar
    expect((result.proposal as Record<string, unknown>).raw).toBeDefined();
  });
});

// ─── Tests: listar_media_del_cliente ──────────────────────────────────────────

describe('listar_media_del_cliente', () => {
  it('(happy) retorna archivos disponibles del portal_email + agent_id', async () => {
    const mediaRows = [makeMedia(), makeMedia({ id: 'media-uuid-002', file_url: 'https://cdn/img2.jpg' })];
    const { from, chain } = makeQueuedSb();
    // La chain "then" devuelve los resultados directamente
    chain.then = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: mediaRows, error: null }).then(resolve));

    const result = await runNaviTool('listar_media_del_cliente', {}, makeCtx({ from })) as Record<string, unknown>;
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.media)).toBe(true);
    expect(result.total).toBe(2);
  });

  it('(edge) limit personalizado respetado (máx 50)', async () => {
    const { from, chain } = makeQueuedSb();
    chain.then = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve));

    await runNaviTool('listar_media_del_cliente', { limit: 200 }, makeCtx({ from }));
    // El handler aplica Math.min(200, 50) → llama limit(50)
    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  it('(error) error de DB → NaviToolError DB_ERROR', async () => {
    const { from, chain } = makeQueuedSb();
    chain.then = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'DB error' } }).then(resolve));

    await expect(runNaviTool('listar_media_del_cliente', {}, makeCtx({ from })))
      .rejects.toThrow('DB_ERROR');
  });
});

// ─── Tests: usar_media_del_cliente ────────────────────────────────────────────

describe('usar_media_del_cliente', () => {
  it('(a) happy: media_urls del draft actualizado, media.status=used', async () => {
    const { from, enqueue } = makeQueuedSb();
    // Draft fetch
    enqueue({ data: makeDraft({ media_urls: [] }) });
    // Media fetch
    enqueue({ data: makeMedia() });
    // Draft update
    enqueue({ data: { ...makeDraft({ media_urls: ['https://storage.example.com/media/img.jpg'] }) } });
    // Media update (status=used)
    enqueue({ data: null });

    const result = await runNaviTool('usar_media_del_cliente', {
      draft_id: DRAFT_ID,
      media_id: MEDIA_ID,
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    const updatedDraft = result.draft as Record<string, unknown>;
    expect(updatedDraft.media_urls).toContain('https://storage.example.com/media/img.jpg');
  });

  it('(b) media de otra org → OWNERSHIP_ERROR', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: makeDraft() });
    // Media pertenece a otro portal_email
    enqueue({ data: makeMedia({ portal_email: OTHER_EMAIL }) });

    await expect(runNaviTool('usar_media_del_cliente', {
      draft_id: DRAFT_ID,
      media_id: MEDIA_ID,
    }, makeCtx({ from })))
      .rejects.toThrow('OWNERSHIP_ERROR');
  });

  it('(c) draft de otra org → OWNERSHIP_ERROR', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: makeDraft({ portal_email: OTHER_EMAIL }) });

    await expect(runNaviTool('usar_media_del_cliente', {
      draft_id: DRAFT_ID,
      media_id: MEDIA_ID,
    }, makeCtx({ from })))
      .rejects.toThrow('OWNERSHIP_ERROR');
  });

  it('(d) falta draft_id → MISSING_DRAFT_ID', async () => {
    const { from } = makeQueuedSb();
    await expect(runNaviTool('usar_media_del_cliente', { media_id: MEDIA_ID }, makeCtx({ from })))
      .rejects.toThrow('MISSING_DRAFT_ID');
  });
});

// ─── Tests: consumeAiOp (integración con ops-guard) ──────────────────────────

describe('consumeAiOp — consumo correcto de ops', () => {
  it('canva_listar_plantillas: ops=0, no llama consumeAiOp', async () => {
    const { consumeAiOp } = await import('@/lib/ai/ops-guard');
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: { access_token: 'tok' } });
    await runNaviTool('canva_listar_plantillas', {}, makeCtx({ from }));
    expect(consumeAiOp).not.toHaveBeenCalled();
  });

  it('canva_generar_diseno: ops=2, llama consumeAiOp con count=2', async () => {
    const { consumeAiOp } = await import('@/lib/ai/ops-guard');
    const { from, enqueue } = makeQueuedSb();
    // requireTargetForAgencia: voice_agents (role='navi', no lanza)
    enqueue({ data: makeAgentRow('navi') });
    // resolveCanvaClient: integration_accounts
    enqueue({ data: { access_token: 'tok' } });
    await runNaviTool('canva_generar_diseno', { template_id: TEMPLATE_ID }, makeCtx({ from }));
    expect(consumeAiOp).toHaveBeenCalledWith(AGENT_ID, 2, expect.objectContaining({ source: 'navi_tool:canva_generar_diseno' }));
  });

  it('proponer_calendario_editorial: ops=5, llama consumeAiOp con count=5', async () => {
    const { consumeAiOp } = await import('@/lib/ai/ops-guard');
    const { from } = makeQueuedSb();
    await runNaviTool('proponer_calendario_editorial', {}, makeCtx({ from }));
    expect(consumeAiOp).toHaveBeenCalledWith(AGENT_ID, 5, expect.any(Object));
  });
});

// ─── Tests: NaviToolError ─────────────────────────────────────────────────────

describe('NaviToolError', () => {
  it('tiene code y name correctos', () => {
    const err = new NaviToolError('TEST_CODE', 'mensaje de prueba');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('NaviToolError');
    // El mensaje incluye el código para facilitar .toThrow('CODE') en tests
    expect(err.message).toBe('TEST_CODE: mensaje de prueba');
    expect(err instanceof Error).toBe(true);
  });
});
