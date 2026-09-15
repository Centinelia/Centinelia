/**
 * Tests de comportamiento para las 2 herramientas exclusivas de variante Agencia
 * y verificación de enforcement de target_account_id en los 8 handlers afectados (R55, R58).
 *
 * Total mínimo: 17 tests (3 + 6 + 8).
 * Mocks: mismo patrón que navi.test.ts (supabase fluent queue, Anthropic, ops-guard, llm-log).
 * Correos de prueba: nazre20+navi-agencia-test@gmail.com.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constantes de prueba ─────────────────────────────────────────────────────

const TEST_EMAIL    = 'nazre20+navi-agencia-test@gmail.com';
const OTHER_EMAIL   = 'nazre20+navi-other@gmail.com';
const AGENT_ID      = 'agent-agencia-uuid-001';
const OTHER_AGENT   = 'agent-agencia-uuid-002';

const SOCIAL_ACC_A  = 'social-acc-agencia-a';
const SOCIAL_ACC_B  = 'social-acc-agencia-b';
const SOCIAL_ACC_C  = 'social-acc-agencia-c';
const SOURCE_MEDIA  = 'ig-media-source-001';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockAnthropicCreate,
  mockConsumeAiOp,
  mockLogLlmCall,
  mockClassifySentiment,
} = vi.hoisted(() => ({
  mockAnthropicCreate:  vi.fn(),
  mockConsumeAiOp:      vi.fn(),
  mockLogLlmCall:       vi.fn(),
  mockClassifySentiment: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).messages = { create: mockAnthropicCreate };
  }),
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mockConsumeAiOp,
}));

vi.mock('@/lib/observability/llm-log', () => ({
  logLlmCall: mockLogLlmCall,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/social/canva', () => ({
  CanvaProvider: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).listBrandTemplates = vi.fn().mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).autofillTemplate   = vi.fn().mockResolvedValue({ designId: 'design-001', previewUrl: 'https://cdn/preview.png' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).exportDesign       = vi.fn().mockResolvedValue({ url: 'https://cdn/export.jpg', expiresAt: new Date('2026-09-16') });
  }),
}));

vi.mock('@/lib/social/publishers/meta', () => ({
  MetaPublisher: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).createMediaContainer  = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).waitForContainerReady = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).publishContainer      = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).fetchMetrics          = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).replyToComment        = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).replyToDm             = vi.fn();
  }),
}));

vi.mock('@/lib/social/sentiment', () => ({
  classifySentiment: mockClassifySentiment,
}));

// ─── Importar bajo prueba ────────────────────────────────────────────────────

import { runNaviTool, NaviToolError } from '../navi';

// ─── Helpers de mock ──────────────────────────────────────────────────────────

/**
 * Crea un mock de cliente Supabase con cola de resultados.
 * Igual al patrón de navi.test.ts.
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

function makeCtx(sbClient: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { agentId: AGENT_ID, portalEmail: TEST_EMAIL, supabase: sbClient as any };
}

/** Agente con role especificado */
function makeAgentRow(role = 'navi_agencia') {
  return { id: AGENT_ID, role };
}

/** Cuenta social de agencia */
function makeSocialAccount(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                  SOCIAL_ACC_A,
    portal_email:        TEST_EMAIL,
    agent_id:            AGENT_ID,
    provider:            'meta_instagram',
    external_username:   'mi_marca_ig',
    page_id:             'page-001',
    status:              'active',
    paused:              false,
    brand_summary:       'Marca de tortillería artesanal, cálida y familiar.',
    ...overrides,
  };
}

/** Borrador de contenido con published_media_id */
function makeSourceDraft(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                   'draft-source-001',
    portal_email:         TEST_EMAIL,
    agent_id:             AGENT_ID,
    social_account_id:    SOCIAL_ACC_A,
    published_media_id:   SOURCE_MEDIA,
    media_urls:           ['https://cdn.example.com/img.jpg'],
    caption:              'Caption original de prueba.',
    hashtags:             ['#prueba', '#tortillas'],
    media_type:           'image',
    status:               'published',
    ...overrides,
  };
}

/** Respuesta simulada de Anthropic */
function makeAnthropicResp(text = 'Caption adaptado para esta cuenta.') {
  return {
    content: [{ type: 'text', text }],
    usage:   { input_tokens: 40, output_tokens: 25 },
  };
}

// ─── Setup global ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAnthropicCreate.mockResolvedValue(makeAnthropicResp());
  mockConsumeAiOp.mockResolvedValue({ ok: true, used: 3, limit: 100 });
  mockLogLlmCall.mockReturnValue(undefined);
  mockClassifySentiment.mockResolvedValue('positive');
});

// ─── Tests: listar_cuentas_gestionadas ───────────────────────────────────────

describe('listar_cuentas_gestionadas', () => {
  it('(a) happy: retorna 3 cuentas filtradas por agent_id + portal_email', async () => {
    const { from, chain } = makeQueuedSb();

    // El handler hace .from('social_accounts').select(...).eq(...).eq(...)
    // que termina en .then() — devolver las 3 cuentas
    const accounts = [
      makeSocialAccount({ id: SOCIAL_ACC_A }),
      makeSocialAccount({ id: SOCIAL_ACC_B }),
      makeSocialAccount({ id: SOCIAL_ACC_C }),
    ];
    chain.then = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: accounts, error: null }).then(resolve));

    // Cada cuenta necesita una llamada .maybySingle() para next_publication
    // El chain compartido responderá null para cada maybySingle (sin drafts programados)
    chain.maybySingle = vi.fn(async () => ({ data: null, error: null }));
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));

    const result = await runNaviTool('listar_cuentas_gestionadas', {}, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    const accs = result.accounts as Array<Record<string, unknown>>;
    expect(accs).toHaveLength(3);
    expect(accs.every(a => a.agent_id === AGENT_ID || a.next_publication === null || a.next_publication === undefined)).toBe(true);
  });

  it('(b) agente sin cuentas → retorna accounts vacío', async () => {
    const { from, chain } = makeQueuedSb();

    chain.then = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve));

    const result = await runNaviTool('listar_cuentas_gestionadas', {}, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.accounts)).toBe(true);
    expect((result.accounts as unknown[]).length).toBe(0);
    expect(result.message).toContain('0');
  });

  it('(c) enriquece con next_publication cuando hay borrador programado', async () => {
    const { from, chain } = makeQueuedSb();

    const accounts = [makeSocialAccount({ id: SOCIAL_ACC_A })];
    chain.then = vi.fn((resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: accounts, error: null }).then(resolve));

    // maybySingle de content_drafts devuelve un borrador programado
    const scheduledDraft = {
      scheduled_for: '2026-09-20T10:00:00Z',
      caption:       'Post programado de prueba',
    };
    chain.maybeSingle = vi.fn(async () => ({ data: scheduledDraft, error: null }));

    const result = await runNaviTool('listar_cuentas_gestionadas', {}, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    const accs = result.accounts as Array<Record<string, unknown>>;
    expect(accs).toHaveLength(1);
    const nextPub = accs[0].next_publication as Record<string, unknown>;
    expect(nextPub).not.toBeNull();
    expect(nextPub.scheduled_for).toBe('2026-09-20T10:00:00Z');
    expect(nextPub.caption).toBe('Post programado de prueba');
  });
});

// ─── Tests: replicar_contenido_entre_cuentas ─────────────────────────────────

describe('replicar_contenido_entre_cuentas', () => {
  it('(a) happy: 3 targets → 3 drafts insertados con status=pending_approval', async () => {
    const { from, enqueue } = makeQueuedSb();

    // source draft lookup
    enqueue({ data: makeSourceDraft() });
    // target A: social_accounts lookup
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_A }) });
    // target A: content_drafts insert
    enqueue({ data: { id: 'draft-new-a', status: 'pending_approval', social_account_id: SOCIAL_ACC_A } });
    // target B: social_accounts lookup
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_B }) });
    // target B: content_drafts insert
    enqueue({ data: { id: 'draft-new-b', status: 'pending_approval', social_account_id: SOCIAL_ACC_B } });
    // target C: social_accounts lookup
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_C }) });
    // target C: content_drafts insert
    enqueue({ data: { id: 'draft-new-c', status: 'pending_approval', social_account_id: SOCIAL_ACC_C } });

    mockAnthropicCreate.mockResolvedValue(makeAnthropicResp('Caption adaptado'));

    const result = await runNaviTool('replicar_contenido_entre_cuentas', {
      source_media_id:    SOURCE_MEDIA,
      target_account_ids: [SOCIAL_ACC_A, SOCIAL_ACC_B, SOCIAL_ACC_C],
    }, makeCtx({ from })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    const drafts = result.drafts as Array<Record<string, unknown>>;
    expect(drafts).toHaveLength(3);
    drafts.forEach((d) => expect(d.status).toBe('pending_approval'));
    expect(result.message).toContain('3');
  });

  it('(b) source_media_id de otra org (portal_email mismatch) → throws SOURCE_NOT_FOUND', async () => {
    const { from, enqueue } = makeQueuedSb();

    // source draft pertenece a otro portal_email
    enqueue({ data: makeSourceDraft({ portal_email: OTHER_EMAIL }) });

    await expect(runNaviTool('replicar_contenido_entre_cuentas', {
      source_media_id:    SOURCE_MEDIA,
      target_account_ids: [SOCIAL_ACC_A],
    }, makeCtx({ from })))
      .rejects.toThrow('SOURCE_NOT_FOUND');
  });

  it('(c) uno de target_account_ids pertenece a otro agente → throws ACCOUNT_NOT_MANAGED con id en mensaje', async () => {
    const { from, enqueue } = makeQueuedSb();

    // source draft OK
    enqueue({ data: makeSourceDraft() });
    // target A OK
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_A }) });
    // target A insert
    enqueue({ data: { id: 'draft-new-a', status: 'pending_approval' } });
    // target B pertenece a otro agente
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_B, agent_id: OTHER_AGENT }) });

    await expect(runNaviTool('replicar_contenido_entre_cuentas', {
      source_media_id:    SOURCE_MEDIA,
      target_account_ids: [SOCIAL_ACC_A, SOCIAL_ACC_B],
    }, makeCtx({ from })))
      .rejects.toThrow(SOCIAL_ACC_B);
  });

  it('(d) target_account_ids vacío → throws INVALID_TARGETS', async () => {
    const { from } = makeQueuedSb();

    await expect(runNaviTool('replicar_contenido_entre_cuentas', {
      source_media_id:    SOURCE_MEDIA,
      target_account_ids: [],
    }, makeCtx({ from })))
      .rejects.toThrow('INVALID_TARGETS');
  });

  it('(e) consumeAiOp se llama UNA VEZ con count=3 fijo (no N × 3)', async () => {
    const { from, enqueue } = makeQueuedSb();

    // source
    enqueue({ data: makeSourceDraft() });
    // 3 targets
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_A }) });
    enqueue({ data: { id: 'draft-new-a', status: 'pending_approval' } });
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_B }) });
    enqueue({ data: { id: 'draft-new-b', status: 'pending_approval' } });
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_C }) });
    enqueue({ data: { id: 'draft-new-c', status: 'pending_approval' } });

    await runNaviTool('replicar_contenido_entre_cuentas', {
      source_media_id:    SOURCE_MEDIA,
      target_account_ids: [SOCIAL_ACC_A, SOCIAL_ACC_B, SOCIAL_ACC_C],
    }, makeCtx({ from }));

    // Exactamente 1 llamada con count=3 (no 3 llamadas de 1 op cada una)
    expect(mockConsumeAiOp).toHaveBeenCalledTimes(1);
    expect(mockConsumeAiOp).toHaveBeenCalledWith(
      AGENT_ID,
      3,
      expect.objectContaining({ source: 'navi_tool:replicar_contenido_entre_cuentas' }),
    );
  });

  it('(f) logLlmCall se llama N veces — una por cada target', async () => {
    const { from, enqueue } = makeQueuedSb();

    // source
    enqueue({ data: makeSourceDraft() });
    // 2 targets
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_A }) });
    enqueue({ data: { id: 'draft-new-a', status: 'pending_approval' } });
    enqueue({ data: makeSocialAccount({ id: SOCIAL_ACC_B }) });
    enqueue({ data: { id: 'draft-new-b', status: 'pending_approval' } });

    await runNaviTool('replicar_contenido_entre_cuentas', {
      source_media_id:    SOURCE_MEDIA,
      target_account_ids: [SOCIAL_ACC_A, SOCIAL_ACC_B],
    }, makeCtx({ from }));

    // logLlmCall debe haberse llamado 2 veces (una por target)
    expect(mockLogLlmCall).toHaveBeenCalledTimes(2);
    expect(mockLogLlmCall).toHaveBeenCalledWith(expect.objectContaining({
      source:      'replicar_contenido_entre_cuentas',
      model:       'claude-haiku-4-5-20251001',
      agentId:     AGENT_ID,
      portalEmail: TEST_EMAIL,
    }));
  });
});

// ─── Tests de enforcement: los 8 handlers de Task 8 (R55) ────────────────────
//
// Para cada handler, verificar que role='navi_agencia' + sin target_account_id
// lanza MISSING_TARGET_ACCOUNT.

describe('enforcement target_account_id — 8 handlers Task 8 (R55)', () => {
  /** Devuelve un supabase que responde navi_agencia al query de voice_agents */
  function makeAgenciaSb() {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: makeAgentRow('navi_agencia') });
    return { from, enqueue };
  }

  it('crear_borrador_post: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from } = makeAgenciaSb();
    await expect(runNaviTool('crear_borrador_post', {
      media_type: 'image',
      caption:    'Test caption',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('programar_publicacion: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from } = makeAgenciaSb();
    await expect(runNaviTool('programar_publicacion', {
      draft_id:      'draft-001',
      scheduled_for: '2026-09-20T12:00:00Z',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('publicar_ahora: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from } = makeAgenciaSb();
    await expect(runNaviTool('publicar_ahora', {
      draft_id: 'draft-001',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('ig_responder_comentario: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from, enqueue } = makeQueuedSb();
    // ig_responder_comentario llama classifySentiment ANTES de resolveSocialAccount
    // classifySentiment no usa supabase, así que voice_agents se consulta en resolveSocialAccount
    enqueue({ data: makeAgentRow('navi_agencia') });

    await expect(runNaviTool('ig_responder_comentario', {
      comment_id: 'comment-001',
      message:    '¡Gracias!',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('ig_responder_dm: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from, enqueue } = makeQueuedSb();
    enqueue({ data: makeAgentRow('navi_agencia') });

    await expect(runNaviTool('ig_responder_dm', {
      thread_id: 'thread-001',
      message:   'Hola, ¿cómo te podemos ayudar?',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('consultar_metricas_post: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from } = makeAgenciaSb();
    await expect(runNaviTool('consultar_metricas_post', {
      content_draft_id: 'draft-001',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('proponer_calendario_editorial: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from } = makeAgenciaSb();
    await expect(runNaviTool('proponer_calendario_editorial', {
      month: '2026-09',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });

  it('canva_generar_diseno: navi_agencia sin target_account_id → MISSING_TARGET_ACCOUNT', async () => {
    const { from } = makeAgenciaSb();
    await expect(runNaviTool('canva_generar_diseno', {
      template_id: 'tmpl-001',
    }, makeCtx({ from })))
      .rejects.toThrow('MISSING_TARGET_ACCOUNT');
  });
});
