/**
 * Smoke integration tests — Task 8 Navi tool handlers
 *
 * Estrategia: Supabase REAL via createAdminClient. Anthropic, CanvaProvider,
 * MetaPublisher y los guards de consumo (consumeAiOp, logLlmCall) se mockean
 * porque su comportamiento ya está cubierto por los unit tests de Task 8.
 * El objetivo aquí es verificar que los handlers escriben correctamente
 * en el esquema real de Supabase.
 *
 * Bugs descubiertos por estas pruebas (mocks los ignoraban):
 *   BUG-2: editorial_calendar_slots no tiene portal_email ni agent_id —
 *          el handler consultaba esas columnas para verificar ownership del slot,
 *          lo que resultaba en un error silencioso (slot siempre era null → SLOT_NOT_OWNED).
 *          CORREGIDO en navi.ts: ahora verifica ownership a través del calendar padre.
 *   BUG-3: social_metrics.insert incluía agent_id y portal_email (columnas inexistentes)
 *          y omitía snapshot_type (requerido). CORREGIDO en navi.ts.
 *
 * Tests:
 *   1. crear_borrador_post happy sin slot
 *   2. crear_borrador_post con slot auto_publish=true
 *   3. crear_borrador_post ACCOUNT_NOT_MANAGED cross-org
 *   4. usar_media_del_cliente happy
 *   5. listar_media_del_cliente filtering (solo available)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const {
  mockAnthropicCreate,
  mockConsumeAiOp,
  mockLogLlmCall,
} = vi.hoisted(() => ({
  mockAnthropicCreate: vi.fn(),
  mockConsumeAiOp:     vi.fn(),
  mockLogLlmCall:      vi.fn(),
}));

// Anthropic → caption canned
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).messages = { create: mockAnthropicCreate };
  }),
}));

// CanvaProvider y MetaPublisher — no se usan en los handlers que probamos
vi.mock('@/lib/social/canva', () => ({
  CanvaProvider: vi.fn(function (this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).listBrandTemplates = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).autofillTemplate   = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).exportDesign       = vi.fn();
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
  classifySentiment: vi.fn().mockResolvedValue('positive'),
}));

vi.mock('@/lib/observability/llm-log', () => ({
  logLlmCall: mockLogLlmCall,
}));

vi.mock('@/lib/ai/ops-guard', () => ({
  consumeAiOp: mockConsumeAiOp.mockResolvedValue({ ok: true, used: 1, limit: 100 }),
}));

// createAdminClient → REAL (no mock — este es el punto del smoke)
vi.mock('@/lib/supabase/admin', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  function realAdmin() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return { createAdminClient: realAdmin };
});

// Importar DESPUÉS de los mocks
import { runNaviTool, NaviToolError } from '@/lib/tools/executors/navi';

// ─── Estado compartido ────────────────────────────────────────────────────────

const sb = createAdminClient();
const TS = Date.now();

// Org propia
const ORG_EMAIL   = `nazre20+navi-smoke-tools-${TS}@gmail.com`;
// Org ajena (para IDOR cross-org)
const OTHER_EMAIL = `nazre20+navi-smoke-other-${TS}@gmail.com`;

let agentId:         string;
let otherAgentId:    string;
let socialAccountId: string;
let otherAccountId:  string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Org propia
  const org = await sb.from('organizations').insert({
    portal_email: ORG_EMAIL,
    name:         'Smoke Navi Tools',
  }).select('portal_email').single();
  if (org.error) throw new Error(`Org insert: ${org.error.message}`);

  // Org ajena
  const other = await sb.from('organizations').insert({
    portal_email: OTHER_EMAIL,
    name:         'Smoke Other Org',
  }).select('portal_email').single();
  if (other.error) throw new Error(`Other org insert: ${other.error.message}`);

  // Agente propio (navi)
  const { data: ag, error: agErr } = await sb.from('voice_agents').insert({
    portal_email:  ORG_EMAIL,
    role:          'navi',
    agent_name:    'Smoke Navi',
    client_name:   'Smoke Client',
    business_name: 'Smoke Business',
    plan:          'pro',
  }).select('id').single();
  if (agErr) throw new Error(`Agent insert: ${agErr.message}`);
  agentId = ag!.id;

  // Agente ajeno (navi)
  const { data: otherAg, error: otherAgErr } = await sb.from('voice_agents').insert({
    portal_email:  OTHER_EMAIL,
    role:          'navi',
    agent_name:    'Smoke Other Navi',
    client_name:   'Other Client',
    business_name: 'Other Business',
    plan:          'pro',
  }).select('id').single();
  if (otherAgErr) throw new Error(`Other agent insert: ${otherAgErr.message}`);
  otherAgentId = otherAg!.id;

  // Cuenta social propia
  const { data: sa, error: saErr } = await sb.from('social_accounts').insert({
    portal_email:       ORG_EMAIL,
    agent_id:           agentId,
    provider:           'meta_instagram',
    external_account_id: `smoke-tools-ig-${TS}`,
    access_token:       'x-smoke-tools',
  }).select('id').single();
  if (saErr) throw new Error(`Social account insert: ${saErr.message}`);
  socialAccountId = sa!.id;

  // Cuenta social ajena (pertenece a otra org)
  const { data: otherSa, error: otherSaErr } = await sb.from('social_accounts').insert({
    portal_email:       OTHER_EMAIL,
    agent_id:           otherAgentId,
    provider:           'meta_instagram',
    external_account_id: `smoke-other-ig-${TS}`,
    access_token:       'x-other',
  }).select('id').single();
  if (otherSaErr) throw new Error(`Other social account: ${otherSaErr.message}`);
  otherAccountId = otherSa!.id;
}, 30_000);

afterAll(async () => {
  await sb.from('organizations').delete().eq('portal_email', ORG_EMAIL);
  await sb.from('organizations').delete().eq('portal_email', OTHER_EMAIL);
}, 30_000);

// ─── Helper: respuesta Anthropic canned ──────────────────────────────────────

function mockCannedCaption(text = 'Caption generado por Navi smoke test') {
  mockAnthropicCreate.mockResolvedValueOnce({
    content: [{ type: 'text', text }],
    usage:   { input_tokens: 50, output_tokens: 30 },
  });
}

// ─── Test 1: crear_borrador_post happy sin slot ───────────────────────────────

it('crear_borrador_post sin slot → row con status=pending_approval, caption, portal_email, agent_id', async () => {
  mockCannedCaption('Visita nuestra tienda este fin de semana');

  const result = await runNaviTool(
    'crear_borrador_post',
    {
      media_type: 'image',
      media_urls: ['https://example.com/img1.jpg'],
    },
    { agentId, portalEmail: ORG_EMAIL },
  ) as { ok: boolean; draft: Record<string, unknown> };

  expect(result.ok).toBe(true);
  expect(result.draft).not.toBeNull();

  const draftId = result.draft.id as string;
  expect(draftId).toBeTruthy();

  // Verificar en DB real
  const { data: row, error } = await sb
    .from('content_drafts')
    .select('status, caption, portal_email, agent_id, social_account_id, auto_publish')
    .eq('id', draftId)
    .single();

  expect(error).toBeNull();
  expect(row?.status).toBe('pending_approval');
  expect(row?.caption).toBeTruthy();
  expect(row?.portal_email).toBe(ORG_EMAIL);
  expect(row?.agent_id).toBe(agentId);
  expect(row?.social_account_id).toBe(socialAccountId);
  expect(row?.auto_publish).toBe(false);
}, 30_000);

// ─── Test 2: crear_borrador_post con slot auto_publish=true ───────────────────

it('crear_borrador_post con slot auto_publish=true → status=approved, auto_publish=true', async () => {
  // Crear calendario y slot reales
  const { data: cal, error: calErr } = await sb.from('editorial_calendars').insert({
    portal_email: ORG_EMAIL,
    month:        '2099-12-01',
    status:       'draft',
  }).select('id').single();
  expect(calErr).toBeNull();

  const { data: slot, error: slotErr } = await sb.from('editorial_calendar_slots').insert({
    calendar_id:   cal!.id,
    scheduled_for: '2099-12-20T15:00:00Z',
    theme:         'Navidad promo smoke',
    auto_publish:  true,
  }).select('id').single();
  expect(slotErr).toBeNull();

  mockCannedCaption('¡Felices fiestas! Visítanos estas fiestas');

  const result = await runNaviTool(
    'crear_borrador_post',
    {
      media_type: 'image',
      slot_id:    slot!.id,
    },
    { agentId, portalEmail: ORG_EMAIL },
  ) as { ok: boolean; draft: Record<string, unknown> };

  expect(result.ok).toBe(true);

  // Verificar en DB real
  const { data: row, error } = await sb
    .from('content_drafts')
    .select('status, auto_publish, slot_id')
    .eq('id', result.draft.id as string)
    .single();

  expect(error).toBeNull();
  expect(row?.status).toBe('approved');
  expect(row?.auto_publish).toBe(true);
  expect(row?.slot_id).toBe(slot!.id);
}, 30_000);

// ─── Test 3: crear_borrador_post ACCOUNT_NOT_MANAGED cross-org ───────────────

it('crear_borrador_post con target_account_id de otra org → NaviToolError ACCOUNT_NOT_MANAGED, sin draft insertado', async () => {
  const beforeCount = await sb
    .from('content_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', ORG_EMAIL);
  const countBefore = beforeCount.count ?? 0;

  await expect(
    runNaviTool(
      'crear_borrador_post',
      {
        media_type:        'image',
        target_account_id: otherAccountId,   // cuenta de otra org
      },
      { agentId, portalEmail: ORG_EMAIL },
    ),
  ).rejects.toThrow('ACCOUNT_NOT_MANAGED');

  // Verificar que no se insertó ningún draft nuevo en nuestra org
  const afterCount = await sb
    .from('content_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('portal_email', ORG_EMAIL);
  const countAfter = afterCount.count ?? 0;

  expect(countAfter).toBe(countBefore);
}, 30_000);

// ─── Test 4: usar_media_del_cliente happy ─────────────────────────────────────

it('usar_media_del_cliente → draft.media_urls actualizado, media.status=used, used_in_draft_id set', async () => {
  // Crear draft y media reales
  const { data: draft, error: draftErr } = await sb.from('content_drafts').insert({
    portal_email:      ORG_EMAIL,
    agent_id:          agentId,
    social_account_id: socialAccountId,
    media_type:        'image',
    status:            'pending_approval',
    media_urls:        [],
    caption:           'Draft para smoke usar_media',
  }).select('id').single();
  expect(draftErr).toBeNull();

  const { data: media, error: mediaErr } = await sb.from('user_media_uploads').insert({
    portal_email: ORG_EMAIL,
    agent_id:     agentId,
    source:       'portal_upload',
    file_url:     `https://storage.example.com/smoke-${TS}.jpg`,
    file_type:    'image/jpeg',
    status:       'available',
  }).select('id').single();
  expect(mediaErr).toBeNull();

  const result = await runNaviTool(
    'usar_media_del_cliente',
    {
      draft_id: draft!.id,
      media_id: media!.id,
    },
    { agentId, portalEmail: ORG_EMAIL },
  ) as { ok: boolean; draft: Record<string, unknown> };

  expect(result.ok).toBe(true);

  // Verificar draft en DB: media_urls contiene la url
  const { data: draftRow } = await sb
    .from('content_drafts')
    .select('media_urls')
    .eq('id', draft!.id)
    .single();

  expect(Array.isArray(draftRow?.media_urls)).toBe(true);
  expect((draftRow?.media_urls as string[]).length).toBeGreaterThan(0);
  expect((draftRow?.media_urls as string[])[0]).toContain(`smoke-${TS}`);

  // Verificar media en DB: status=used, used_in_draft_id set
  const { data: mediaRow } = await sb
    .from('user_media_uploads')
    .select('status, used_in_draft_id')
    .eq('id', media!.id)
    .single();

  expect(mediaRow?.status).toBe('used');
  expect(mediaRow?.used_in_draft_id).toBe(draft!.id);
}, 30_000);

// ─── Test 5: listar_media_del_cliente filtering (solo available) ──────────────

it('listar_media_del_cliente → devuelve solo los uploads con status=available', async () => {
  const subTS = Date.now();

  // Insertar 2 available + 1 used
  const uploads = await sb.from('user_media_uploads').insert([
    {
      portal_email: ORG_EMAIL,
      agent_id:     agentId,
      source:       'portal_upload',
      file_url:     `https://example.com/avail1-${subTS}.jpg`,
      file_type:    'image/jpeg',
      status:       'available',
    },
    {
      portal_email: ORG_EMAIL,
      agent_id:     agentId,
      source:       'portal_upload',
      file_url:     `https://example.com/avail2-${subTS}.jpg`,
      file_type:    'image/jpeg',
      status:       'available',
    },
    {
      portal_email: ORG_EMAIL,
      agent_id:     agentId,
      source:       'email',
      file_url:     `https://example.com/used1-${subTS}.jpg`,
      file_type:    'image/jpeg',
      status:       'used',
    },
  ]).select('id');
  expect(uploads.error).toBeNull();

  const result = await runNaviTool(
    'listar_media_del_cliente',
    { limit: 50 },
    { agentId, portalEmail: ORG_EMAIL },
  ) as { ok: boolean; media: Array<Record<string, unknown>>; total: number };

  expect(result.ok).toBe(true);

  // Todos los items devueltos deben tener status='available'
  const allAvailable = result.media.every(m => m.status === 'available');
  expect(allAvailable).toBe(true);

  // Ningún item devuelto tiene la url del 'used'
  const urls = result.media.map(m => m.file_url as string);
  expect(urls.some(u => u.includes(`used1-${subTS}`))).toBe(false);

  // Los 2 available recién insertados sí deben aparecer
  const availUrls = urls.filter(u => u.includes(`avail1-${subTS}`) || u.includes(`avail2-${subTS}`));
  expect(availUrls.length).toBe(2);
}, 30_000);
