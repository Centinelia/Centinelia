/**
 * Smoke integration test — Task 11 publish-scheduled-posts cron
 *
 * Estrategia: Supabase REAL via createAdminClient. buildPublisher se mockea
 * (no hay creds Meta reales en CI) pero la lógica de DB (draft status, retry,
 * skip logic) se verifica contra el esquema real.
 *
 * Bugs que este smoke podría detectar (los mocks callan):
 *   - Columnas incorrectas en el SELECT (ej. JOIN que no existe)
 *   - Campo inexistente en UPDATE (ej. 'published_at' renombrado)
 *   - Cambio en check constraint de status (valores no aceptados)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── Mocks hoisted ────────────────────────────────────────────────────────────

const { mockBuildPublisher, mockVerifyCronAuth } = vi.hoisted(() => ({
  mockBuildPublisher: vi.fn(),
  mockVerifyCronAuth: vi.fn(),
}));

// buildPublisher → publisher falso que simula publicación exitosa
vi.mock('@/lib/social/publishers', () => ({
  buildPublisher: mockBuildPublisher,
}));

vi.mock('@/lib/auth/cron-auth', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}));

// createAdminClient → REAL (punto central del smoke)
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

// Importar handler DESPUÉS de los mocks
import { GET } from '../../src/app/api/cron/publish-scheduled-posts/route';

// ─── Estado compartido ────────────────────────────────────────────────────────

const sb = createAdminClient();
const TS = Date.now();

const PORTAL_EMAIL = `nazre20+navi-publish-smoke-${TS}@gmail.com`;

let agentId:          string;
let socialAccountId:  string;
let draftId:          string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Org (account_status defaults a 'active' — no pasar features, vive en voice_agents)
  const { error: orgErr } = await sb.from('organizations').insert({
    portal_email: PORTAL_EMAIL,
    name:         'Smoke Publish Org',
  });
  if (orgErr) throw new Error(`Org insert: ${orgErr.message}`);

  // 2. Agente navi — features.social_publishing.enabled=true habilita la publicación
  const { data: ag, error: agErr } = await sb.from('voice_agents').insert({
    portal_email:  PORTAL_EMAIL,
    role:          'navi',
    agent_name:    'Smoke Navi Publish',
    client_name:   'Smoke Client',
    business_name: 'Smoke Business',
    plan:          'pro',
    features:      { social_publishing: { enabled: true } },
  }).select('id').single();
  if (agErr) throw new Error(`Agent insert: ${agErr.message}`);
  agentId = ag!.id;

  // 3. Cuenta social activa, no pausada
  const { data: sa, error: saErr } = await sb.from('social_accounts').insert({
    portal_email:       PORTAL_EMAIL,
    agent_id:           agentId,
    provider:           'meta_instagram',
    external_account_id: `smoke-publish-ig-${TS}`,
    access_token:       'smoke-access-tok',
    status:             'active',
    paused:             false,
  }).select('id').single();
  if (saErr) throw new Error(`Social account insert: ${saErr.message}`);
  socialAccountId = sa!.id;

  // 4. Draft en estado 'scheduled' con scheduled_for en el pasado
  const scheduledFor = new Date(Date.now() - 60 * 1000).toISOString(); // hace 1 minuto
  const { data: dr, error: drErr } = await sb.from('content_drafts').insert({
    portal_email:       PORTAL_EMAIL,
    agent_id:           agentId,
    social_account_id:  socialAccountId,
    media_type:         'image',
    media_urls:         ['https://example.com/test-image.jpg'],
    caption:            'Post de prueba smoke',
    hashtags:           ['#smoke', '#test'],
    status:             'scheduled',
    scheduled_for:      scheduledFor,
    retry_count:        0,
  }).select('id').single();
  if (drErr) throw new Error(`Draft insert: ${drErr.message}`);
  draftId = dr!.id;
}, 30_000);

afterAll(async () => {
  // Cascade en organizations debería limpiar todo
  await sb.from('organizations').delete().eq('portal_email', PORTAL_EMAIL);
}, 30_000);

// ─── Publisher mock que simula publicación exitosa ────────────────────────────

function setupSuccessPublisher() {
  const fakePublisher = {
    createMediaContainer:  vi.fn().mockResolvedValue({ containerId: 'smoke-container-1' }),
    waitForContainerReady: vi.fn().mockResolvedValue('ready'),
    publishContainer:      vi.fn().mockResolvedValue({
      mediaId:   'smoke-media-id-123',
      permalink: 'https://www.instagram.com/p/smoke123/',
    }),
    fetchMetrics:          vi.fn(),
    replyToComment:        vi.fn(),
    replyToDm:             vi.fn(),
    listRecentComments:    vi.fn(),
    listRecentDms:         vi.fn(),
  };
  mockBuildPublisher.mockReturnValue(fakePublisher);
  return fakePublisher;
}

// ─── Test 1: Happy path — draft scheduled se publica ─────────────────────────

it('publica draft scheduled exitosamente → status=published, published_media_id, permalink en DB real', async () => {
  mockVerifyCronAuth.mockReturnValue(true);
  const publisher = setupSuccessPublisher();

  const req = new Request('http://localhost/api/cron/publish-scheduled-posts', {
    headers: { authorization: 'Bearer smoke-test-secret' },
  });

  const res = await GET(req as never);
  const body = await res.json() as Record<string, unknown>;

  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);

  // Verificar que el publisher se llamó correctamente
  expect(publisher.createMediaContainer).toHaveBeenCalledOnce();
  expect(publisher.waitForContainerReady).toHaveBeenCalledWith('smoke-container-1');
  expect(publisher.publishContainer).toHaveBeenCalledWith('smoke-container-1');

  // Verificar en DB REAL que el draft fue actualizado
  const { data: row, error } = await sb
    .from('content_drafts')
    .select('status, published_media_id, published_permalink, published_at, error_message')
    .eq('id', draftId)
    .single();

  expect(error).toBeNull();
  expect(row?.status).toBe('published');
  expect(row?.published_media_id).toBe('smoke-media-id-123');
  expect(row?.published_permalink).toBe('https://www.instagram.com/p/smoke123/');
  expect(row?.published_at).toBeTruthy();
  expect(row?.error_message).toBeNull();

  // Metadata del cron debe reportar 1 publicado
  expect((body.metadata as Record<string, number>).published).toBeGreaterThanOrEqual(1);
  expect((body.metadata as Record<string, number>).failed).toBe(0);
}, 30_000);
