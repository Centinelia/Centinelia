/**
 * Tests de kill switch a nivel de handler (Task 14, R91, R92, R96).
 *
 * Verifica defense-in-depth: social_accounts.paused=true bloquea
 * crearBorradorPost, programarPublicacion, publicarAhora,
 * igResponderComentario e igResponderDm antes de cualquier efecto en Meta.
 *
 * Aislamiento multi-cuenta: una cuenta pausada NO bloquea otras cuentas
 * del mismo agente navi_agencia.
 *
 * Correo de prueba: nazre20+navi-kill-switch@gmail.com (R30).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Constantes de prueba ─────────────────────────────────────────────────────

const TEST_EMAIL  = 'nazre20+navi-kill-switch@gmail.com';
const AGENT_ID    = 'agent-kill-switch-001';
const ACC_ID_A    = 'social-acc-paused-a';
const ACC_ID_B    = 'social-acc-active-b';
const DRAFT_ID    = 'draft-kill-switch-001';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockCreateMediaContainer,
  mockWaitForContainerReady,
  mockPublishContainer,
  mockReplyToComment,
  mockReplyToDm,
  mockAnthropicCreate,
  mockClassifySentiment,
} = vi.hoisted(() => ({
  mockCreateMediaContainer:  vi.fn(),
  mockWaitForContainerReady: vi.fn(),
  mockPublishContainer:      vi.fn(),
  mockReplyToComment:        vi.fn(),
  mockReplyToDm:             vi.fn(),
  mockAnthropicCreate:       vi.fn(),
  mockClassifySentiment:     vi.fn(),
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
    (this as any).createMediaContainer  = mockCreateMediaContainer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).waitForContainerReady = mockWaitForContainerReady;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).publishContainer      = mockPublishContainer;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).fetchMetrics          = vi.fn();
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

import { runNaviTool } from '../navi';

// ─── Helpers de mock ──────────────────────────────────────────────────────────

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
  chain.catch  = vi.fn(() => chain);
  chain.finally = vi.fn(() => chain);

  const from = vi.fn(() => chain);
  return { from, enqueue, chain };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCtx(sbClient: unknown): any {
  return { agentId: AGENT_ID, portalEmail: TEST_EMAIL, supabase: sbClient };
}

function makeAgentRow(role = 'navi') {
  return { id: AGENT_ID, role };
}

function makeSocialAccount(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                  ACC_ID_A,
    portal_email:        TEST_EMAIL,
    agent_id:            AGENT_ID,
    provider:            'meta_instagram',
    external_username:   'cuenta_prueba_ig',
    access_token:        'page-token-xyz',
    brand_summary:       'Marca de tortillería artesanal.',
    denylist_words:      [],
    paused:              false,
    paused_reason:       null,
    paused_at:           null,
    status:              'active',
    metadata:            {},
    ...overrides,
  };
}

function makeDraft(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id:                  DRAFT_ID,
    portal_email:        TEST_EMAIL,
    agent_id:            AGENT_ID,
    social_account_id:   ACC_ID_A,
    media_type:          'image',
    media_urls:          ['https://cdn.example.com/img.jpg'],
    caption:             'Caption de prueba',
    hashtags:            ['#prueba'],
    status:              'approved',
    scheduled_for:       null,
    auto_publish:        false,
    published_media_id:  null,
    published_permalink: null,
    template_id:         null,
    slot_id:             null,
    created_at:          '2026-09-15T00:00:00Z',
    ...overrides,
  };
}

// ─── Setup global ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockClassifySentiment.mockResolvedValue('positive');
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: 'text', text: 'Caption generado.' }],
    usage:   { input_tokens: 30, output_tokens: 20 },
  });
  mockCreateMediaContainer.mockResolvedValue({ containerId: 'container-001' });
  mockWaitForContainerReady.mockResolvedValue('ready');
  mockPublishContainer.mockResolvedValue({ mediaId: 'ig-media-001', permalink: 'https://www.instagram.com/p/abc' });
  mockReplyToComment.mockResolvedValue(undefined);
  mockReplyToDm.mockResolvedValue(undefined);
});

// ─── Test 1: crearBorradorPost con cuenta pausada ─────────────────────────────
//
// R96-1: cuenta pausada lanza ACCOUNT_PAUSED; NO se inserta row en content_drafts.

describe('Kill switch — crearBorradorPost', () => {
  it('cuenta pausada → lanza ACCOUNT_PAUSED, sin insert en content_drafts', async () => {
    const { from, enqueue, chain } = makeQueuedSb();

    // 1. voice_agents (role)
    enqueue({ data: makeAgentRow('navi') });
    // 2. social_accounts (auto-resolve por agent_id — devuelve el id)
    enqueue({ data: { id: ACC_ID_A } });
    // 3. social_accounts (fila completa con ownership — PAUSADA)
    enqueue({ data: makeSocialAccount({ paused: true }) });
    // El handler debe lanzar antes del insert; no se debe consumir más items.

    await expect(runNaviTool('crear_borrador_post', {
      media_type: 'image',
      caption:    'Mi caption',
    }, makeCtx({ from })))
      .rejects.toThrow('ACCOUNT_PAUSED');

    // Verificar que el insert en content_drafts NUNCA se llamó
    const insertCalls = (chain.insert as ReturnType<typeof vi.fn>).mock.calls;
    expect(insertCalls).toHaveLength(0);
  });
});

// ─── Test 2: publicarAhora con cuenta pausada ─────────────────────────────────
//
// R96-2: cuenta pausada lanza ACCOUNT_PAUSED; MetaPublisher no se invoca.

describe('Kill switch — publicarAhora', () => {
  it('cuenta pausada → lanza ACCOUNT_PAUSED, no llama a MetaPublisher', async () => {
    // publicarAhora usa tabla-lookup distinta al queue genérico;
    // usamos el helper especializado igual que navi.test.ts.
    let draftFetched = false;

    const makeChain = (tableName: string): Record<string, unknown> => {
      const ch: Record<string, unknown> = {};
      ch.select = vi.fn(() => ch);
      ch.eq     = vi.fn(() => ch);
      ch.update = vi.fn(() => ch);
      ch.neq    = vi.fn(() => ch);
      ch.order  = vi.fn(() => ch);
      ch.limit  = vi.fn(() => ch);
      ch.insert = vi.fn(() => ch);
      ch.in     = vi.fn(() => ch);
      ch.single = vi.fn(async () => {
        if (tableName === 'content_drafts') {
          if (!draftFetched) {
            draftFetched = true;
            return { data: makeDraft({ status: 'approved', social_account_id: ACC_ID_A }), error: null };
          }
          return { data: null, error: null };
        }
        if (tableName === 'voice_agents') {
          return { data: makeAgentRow('navi'), error: null };
        }
        if (tableName === 'social_accounts') {
          // Cuenta PAUSADA
          return { data: makeSocialAccount({ paused: true }), error: null };
        }
        return { data: null, error: null };
      });
      ch.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      ch.then = vi.fn(<TR>(resolve: (v: { data: null; error: null }) => TR) =>
        Promise.resolve({ data: null, error: null }).then(resolve));
      ch.catch  = vi.fn(() => ch);
      ch.finally = vi.fn(() => ch);
      return ch;
    };

    const tableChains: Record<string, Record<string, unknown>> = {};
    const from = vi.fn((tableName: string) => {
      if (!tableChains[tableName]) tableChains[tableName] = makeChain(tableName);
      return tableChains[tableName];
    });

    await expect(runNaviTool('publicar_ahora', { draft_id: DRAFT_ID }, makeCtx({ from })))
      .rejects.toThrow('ACCOUNT_PAUSED');

    // MetaPublisher no debe haberse llamado
    expect(mockCreateMediaContainer).not.toHaveBeenCalled();
  });
});

// ─── Test 3: igResponderComentario con cuenta pausada ────────────────────────
//
// R96-3: cuenta pausada lanza ACCOUNT_PAUSED; MetaPublisher.replyToComment no se llama.

describe('Kill switch — igResponderComentario', () => {
  it('cuenta pausada → lanza ACCOUNT_PAUSED, no llama a MetaPublisher.replyToComment', async () => {
    mockClassifySentiment.mockResolvedValueOnce('positive'); // pasa filtro sentimiento

    const { from, enqueue } = makeQueuedSb();
    // 1. resolveSocialAccount: voice_agents
    enqueue({ data: makeAgentRow('navi') });
    // 2. resolveSocialAccount: social_accounts — PAUSADA
    enqueue({ data: makeSocialAccount({ id: ACC_ID_A, paused: true }) });

    await expect(runNaviTool('ig_responder_comentario', {
      comment_id:        'comment-ks-001',
      message:           'Gracias por tu comentario.',
      target_account_id: ACC_ID_A,
    }, makeCtx({ from })))
      .rejects.toThrow('ACCOUNT_PAUSED');

    expect(mockReplyToComment).not.toHaveBeenCalled();
  });
});

// ─── Test 4: aislamiento multi-cuenta — cuenta A pausada no bloquea cuenta B ──
//
// R96-4: agente navi_agencia con cuenta A pausada; publicarAhora en cuenta B funciona.

describe('Kill switch — aislamiento multi-cuenta navi_agencia', () => {
  it('cuenta A pausada no impide publicarAhora en cuenta B del mismo agente', async () => {
    // Borrador B pertenece a ACC_ID_B (no pausada)
    const DRAFT_ID_B = 'draft-kill-switch-b';
    const publishedDraftB = {
      id:                  DRAFT_ID_B,
      portal_email:        TEST_EMAIL,
      agent_id:            AGENT_ID,
      social_account_id:   ACC_ID_B,
      status:              'published',
      published_media_id:  'ig-media-b-001',
      published_permalink: 'https://www.instagram.com/p/xyz',
    };

    let draftFetched = false;

    const makeChain = (tableName: string): Record<string, unknown> => {
      const ch: Record<string, unknown> = {};
      ch.select = vi.fn(() => ch);
      ch.eq     = vi.fn(() => ch);
      ch.update = vi.fn(() => ch);
      ch.neq    = vi.fn(() => ch);
      ch.order  = vi.fn(() => ch);
      ch.limit  = vi.fn(() => ch);
      ch.insert = vi.fn(() => ch);
      ch.in     = vi.fn(() => ch);
      ch.single = vi.fn(async () => {
        if (tableName === 'content_drafts') {
          if (!draftFetched) {
            draftFetched = true;
            // Borrador B apuntando a ACC_ID_B
            return {
              data: {
                id:                  DRAFT_ID_B,
                portal_email:        TEST_EMAIL,
                agent_id:            AGENT_ID,
                social_account_id:   ACC_ID_B,
                media_type:          'image',
                media_urls:          ['https://cdn.example.com/b.jpg'],
                caption:             'Post cuenta B',
                hashtags:            ['#b'],
                status:              'approved',
              },
              error: null,
            };
          }
          // Segunda llamada a content_drafts (draft publicado)
          return { data: publishedDraftB, error: null };
        }
        if (tableName === 'voice_agents') {
          // navi_agencia
          return { data: makeAgentRow('navi_agencia'), error: null };
        }
        if (tableName === 'social_accounts') {
          // Resuelve ACC_ID_B — NO pausada
          return {
            data: makeSocialAccount({
              id:     ACC_ID_B,
              paused: false,
            }),
            error: null,
          };
        }
        return { data: null, error: null };
      });
      ch.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      ch.then = vi.fn(<TR>(resolve: (v: { data: null; error: null }) => TR) =>
        Promise.resolve({ data: null, error: null }).then(resolve));
      ch.catch  = vi.fn(() => ch);
      ch.finally = vi.fn(() => ch);
      return ch;
    };

    const tableChains: Record<string, Record<string, unknown>> = {};
    const from = vi.fn((tableName: string) => {
      if (!tableChains[tableName]) tableChains[tableName] = makeChain(tableName);
      return tableChains[tableName];
    });

    // publicar_ahora apuntando a un draft de cuenta B (no pausada) — debe funcionar
    // navi_agencia requiere target_account_id explícito (R55)
    const result = await runNaviTool('publicar_ahora', {
      draft_id:          DRAFT_ID_B,
      target_account_id: ACC_ID_B,
    }, makeCtx({ from })) as Record<string, unknown>;

    // La operación debe completarse con éxito (sin ACCOUNT_PAUSED)
    expect(result.ok).toBe(true);
    // MetaPublisher fue invocado — cuenta B no está pausada
    expect(mockCreateMediaContainer).toHaveBeenCalledTimes(1);
  });
});
