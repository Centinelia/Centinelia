/**
 * Smoke integration tests — Task 6 portal endpoints
 *
 * Estrategia: Supabase REAL via createAdminClient. Los módulos que bloquean
 * las rutas del portal (verifySession, resolveOrgFromToken, requireSocialFeature)
 * se mockean para que el guard pase, pero todas las lecturas/escrituras en DB
 * son reales. Esto prueba que el flujo Supabase de cada endpoint funciona
 * contra el esquema real, sin depender de la lógica de sesión/token.
 *
 * Bugs descubiertos por estas pruebas (mocks los ignoraban):
 *   BUG-1: editorial_calendars no tiene columna updated_at — la ruta de approve
 *          enviaba esa columna y recibía un 500. CORREGIDO en route.ts.
 *
 * Tests:
 *   1. PATCH drafts approve happy path
 *   2. PATCH drafts approve IDOR fail
 *   3. POST pause con social_account_id
 *   4. POST pause con agent_id (agencia, multi-cuenta)
 *   5. POST calendar approve
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── Mocks hoisted — solo para el guard (sesión, token, feature flag) ──────────
// La operación real de DB la hace la ruta usando su propio createAdminClient.

const {
  mockVerifySession,
  mockResolveOrg,
  mockCreateAdminClient,
} = vi.hoisted(() => ({
  mockVerifySession:        vi.fn(),
  mockResolveOrg:           vi.fn(),
  mockCreateAdminClient:    vi.fn(),
}));

vi.mock('@/lib/portal/auth', () => ({
  verifySession: mockVerifySession,
  PORTAL_COOKIE: 'Centinelia_portal',
}));

vi.mock('@/lib/portal/org-token', () => ({
  resolveOrgFromToken: mockResolveOrg,
}));

// requireSocialFeature NO se mockea — hitea Supabase real para validar el fix
// de BUG-SCHEMA-FEATURES-ORG (Round 9). Ambas orgs tienen features.social_publishing.enabled=true.

// createAdminClient → devuelve el cliente REAL (no mock)
vi.mock('@/lib/supabase/admin', () => {
  const { createClient } = require('@supabase/supabase-js');
  function realAdminClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return {
    createAdminClient: () => {
      mockCreateAdminClient();
      return realAdminClient();
    },
  };
});

// Importar rutas DESPUÉS de los mocks
import { PATCH as patchDraft } from '@/app/api/portal/[token]/social/drafts/[id]/route';
import { POST  as pausePost  } from '@/app/api/portal/[token]/social/pause/route';
import { POST  as calApprove } from '@/app/api/portal/[token]/social/calendar/[month]/approve/route';

// ─── Estado compartido del test ──────────────────────────────────────────────

const sb = createAdminClient();

const TS = Date.now();

// Org A — la org "propietaria"
const ORG_A_EMAIL = `nazre20+navi-smoke-portal-a-${TS}@gmail.com`;
const ORG_A_TOKEN = `smoke-tok-a-${TS}`;

// Org B — IDOR attacker
const ORG_B_EMAIL = `nazre20+navi-smoke-portal-b-${TS}@gmail.com`;
const ORG_B_TOKEN = `smoke-tok-b-${TS}`;

let agentAId:   string;
let agentBId:   string;
let accountAId: string;
let accountB1:  string;
let accountB2:  string;
let accountB3:  string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Crear Org A
  const orgA = await sb.from('organizations').insert({
    portal_email: ORG_A_EMAIL,
    name:         'Smoke Portal A',
    portal_token: ORG_A_TOKEN,
    features:     { social_publishing: { enabled: true } },
  }).select('portal_email').single();
  if (orgA.error) throw new Error(`Org A insert: ${orgA.error.message}`);

  // Crear Org B (attacker en IDOR test — con features tambien habilitadas, el 403 viene del session mismatch antes)
  const orgB = await sb.from('organizations').insert({
    portal_email: ORG_B_EMAIL,
    name:         'Smoke Portal B',
    portal_token: ORG_B_TOKEN,
    features:     { social_publishing: { enabled: true } },
  }).select('portal_email').single();
  if (orgB.error) throw new Error(`Org B insert: ${orgB.error.message}`);

  // Agente Org A (navi estándar — 1 cuenta)
  const { data: agA, error: agAErr } = await sb.from('voice_agents').insert({
    portal_email:  ORG_A_EMAIL,
    role:          'navi',
    agent_name:    'Smoke Navi A',
    client_name:   'Smoke Client',
    business_name: 'Smoke Business',
    plan:          'pro',
  }).select('id').single();
  if (agAErr) throw new Error(`Agent A: ${agAErr.message}`);
  agentAId = agA!.id;

  // Agente Org B (navi_agencia — 3 cuentas para test pause-all)
  const { data: agB, error: agBErr } = await sb.from('voice_agents').insert({
    portal_email:  ORG_B_EMAIL,
    role:          'navi_agencia',
    agent_name:    'Smoke Navi B',
    client_name:   'Smoke Client B',
    business_name: 'Smoke Business B',
    plan:          'pro',
  }).select('id').single();
  if (agBErr) throw new Error(`Agent B: ${agBErr.message}`);
  agentBId = agB!.id;

  // Cuenta social Org A
  const { data: saA, error: saAErr } = await sb.from('social_accounts').insert({
    portal_email:       ORG_A_EMAIL,
    agent_id:           agentAId,
    provider:           'meta_instagram',
    external_account_id: `smoke-ig-a-${TS}`,
    access_token:       'x-smoke-a',
  }).select('id').single();
  if (saAErr) throw new Error(`Social account A: ${saAErr.message}`);
  accountAId = saA!.id;

  // Cuentas Org B (x3)
  const b1 = await sb.from('social_accounts').insert({
    portal_email:       ORG_B_EMAIL,
    agent_id:           agentBId,
    provider:           'meta_instagram',
    external_account_id: `smoke-ig-b1-${TS}`,
    access_token:       'x-b1',
  }).select('id').single();
  if (b1.error) throw new Error(`SA B1: ${b1.error.message}`);
  accountB1 = b1.data!.id;

  const b2 = await sb.from('social_accounts').insert({
    portal_email:       ORG_B_EMAIL,
    agent_id:           agentBId,
    provider:           'meta_instagram',
    external_account_id: `smoke-ig-b2-${TS}`,
    access_token:       'x-b2',
  }).select('id').single();
  if (b2.error) throw new Error(`SA B2: ${b2.error.message}`);
  accountB2 = b2.data!.id;

  const b3 = await sb.from('social_accounts').insert({
    portal_email:       ORG_B_EMAIL,
    agent_id:           agentBId,
    provider:           'meta_facebook',
    external_account_id: `smoke-fb-b3-${TS}`,
    access_token:       'x-b3',
  }).select('id').single();
  if (b3.error) throw new Error(`SA B3: ${b3.error.message}`);
  accountB3 = b3.data!.id;
}, 30_000);

afterAll(async () => {
  // Borrar orgs — el cascade limpia voice_agents, social_accounts, content_drafts, etc.
  await sb.from('organizations').delete().eq('portal_email', ORG_A_EMAIL);
  await sb.from('organizations').delete().eq('portal_email', ORG_B_EMAIL);
}, 30_000);

// ─── Helper: simular sesión de portal OK ─────────────────────────────────────

function setupGuard(
  sessionEmail: string,
  orgEmail: string,
  orgToken:     string,
): void {
  mockVerifySession.mockResolvedValue({
    portalEmail: sessionEmail,
    isSubUser:   false,
  });
  mockResolveOrg.mockResolvedValue({
    portalEmail: orgEmail,
    orgToken,
    legacy:      false,
  });
  // requireSocialFeature ya no se mockea — lee organizations.features real.
}

function makeJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method:  'PATCH',
    headers: {
      cookie:         'Centinelia_portal=smoke-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method:  'POST',
    headers: {
      cookie:         'Centinelia_portal=smoke-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// ─── Test 1: PATCH drafts approve happy path ─────────────────────────────────

it('PATCH drafts approve → status=approved, approved_by=session.portalEmail, approved_at set', async () => {
  // Crear borrador real en DB
  const { data: draft, error: draftErr } = await sb.from('content_drafts').insert({
    portal_email:      ORG_A_EMAIL,
    agent_id:          agentAId,
    social_account_id: accountAId,
    media_type:        'image',
    status:            'pending_approval',
    caption:           'Smoke test caption',
  }).select('id').single();
  expect(draftErr).toBeNull();

  const draftId = draft!.id;

  setupGuard(ORG_A_EMAIL, ORG_A_EMAIL, ORG_A_TOKEN);

  const req = makeJsonRequest(
    `http://localhost/api/portal/${ORG_A_TOKEN}/social/drafts/${draftId}`,
    { action: 'approve' },
  );

  const res = await patchDraft(
    req,
    { params: Promise.resolve({ token: ORG_A_TOKEN, id: draftId }) },
  );

  expect(res.status).toBe(200);
  const json = await res.json() as { ok: boolean; data: Record<string, unknown> };
  expect(json.ok).toBe(true);

  // Verificar el row real en DB
  const { data: row } = await sb
    .from('content_drafts')
    .select('status, approved_by, approved_at')
    .eq('id', draftId)
    .single();

  expect(row?.status).toBe('approved');
  expect(row?.approved_by).toBe(ORG_A_EMAIL);
  expect(row?.approved_at).not.toBeNull();
}, 30_000);

// ─── Test 2: PATCH drafts approve IDOR fail ───────────────────────────────────

it('PATCH drafts approve IDOR → 403, row no cambia', async () => {
  // Borrador de Org A
  const { data: draft } = await sb.from('content_drafts').insert({
    portal_email:      ORG_A_EMAIL,
    agent_id:          agentAId,
    social_account_id: accountAId,
    media_type:        'image',
    status:            'pending_approval',
    caption:           'IDOR test caption',
  }).select('id, status').single();

  const draftId = draft!.id;

  // Guardar status inicial
  const statusBefore = draft!.status;

  // Sesión de Org B intentando aprobar borrador de Org A
  mockVerifySession.mockResolvedValue({
    portalEmail: ORG_B_EMAIL,
    isSubUser:   false,
  });
  // resolveOrgFromToken devuelve ORG_B (el token de Org B)
  mockResolveOrg.mockResolvedValue({
    portalEmail: ORG_B_EMAIL,
    orgToken:    ORG_B_TOKEN,
    legacy:      false,
  });

  const req = makeJsonRequest(
    `http://localhost/api/portal/${ORG_B_TOKEN}/social/drafts/${draftId}`,
    { action: 'approve' },
  );

  const res = await patchDraft(
    req,
    { params: Promise.resolve({ token: ORG_B_TOKEN, id: draftId }) },
  );

  // La ruta busca el borrador filtrado por resolved.portalEmail (= ORG_B_EMAIL)
  // → no encuentra nada (borrador pertenece a ORG_A) → 403
  expect(res.status).toBe(403);

  // Verificar que el row NO cambió en DB
  const { data: row } = await sb
    .from('content_drafts')
    .select('status, approved_by')
    .eq('id', draftId)
    .single();

  expect(row?.status).toBe(statusBefore);
  expect(row?.approved_by).toBeNull();
}, 30_000);

// ─── Test 3: POST pause con social_account_id ─────────────────────────────────

it('POST pause con social_account_id → paused=true en esa cuenta, otras sin cambio', async () => {
  // Usar una de las cuentas de Org B
  // Primero asegurarse que las 3 estén en paused=false
  await sb.from('social_accounts').update({ paused: false }).in('id', [accountB1, accountB2, accountB3]);

  setupGuard(ORG_B_EMAIL, ORG_B_EMAIL, ORG_B_TOKEN);

  const req = makePostRequest(
    `http://localhost/api/portal/${ORG_B_TOKEN}/social/pause`,
    { social_account_id: accountB1 },
  );

  const res = await pausePost(
    req,
    { params: Promise.resolve({ token: ORG_B_TOKEN }) },
  );

  expect(res.status).toBe(200);
  const json = await res.json() as { ok: boolean; paused: number };
  expect(json.ok).toBe(true);
  expect(json.paused).toBe(1);

  // Verificar en DB: accountB1 paused=true, accountB2 y B3 sin cambio
  const { data: rows } = await sb
    .from('social_accounts')
    .select('id, paused')
    .in('id', [accountB1, accountB2, accountB3]);

  const byId: Record<string, boolean> = {};
  for (const r of rows ?? []) byId[r.id] = r.paused;

  expect(byId[accountB1]).toBe(true);
  expect(byId[accountB2]).toBe(false);
  expect(byId[accountB3]).toBe(false);
}, 30_000);

// ─── Test 4: POST pause con agent_id (agencia, pausa todas) ──────────────────

it('POST pause con agent_id → todas las cuentas del agente pausadas, paused=3', async () => {
  // Reset: asegurarse que las 3 cuentas están sin pausar
  await sb.from('social_accounts').update({ paused: false, paused_reason: null, paused_at: null })
    .in('id', [accountB1, accountB2, accountB3]);

  setupGuard(ORG_B_EMAIL, ORG_B_EMAIL, ORG_B_TOKEN);

  const req = makePostRequest(
    `http://localhost/api/portal/${ORG_B_TOKEN}/social/pause`,
    { agent_id: agentBId, reason: 'vacaciones' },
  );

  const res = await pausePost(
    req,
    { params: Promise.resolve({ token: ORG_B_TOKEN }) },
  );

  expect(res.status).toBe(200);
  const json = await res.json() as { ok: boolean; paused: number };
  expect(json.ok).toBe(true);
  expect(json.paused).toBe(3);

  // Verificar en DB: las 3 cuentas con paused=true
  const { data: rows } = await sb
    .from('social_accounts')
    .select('id, paused, paused_reason')
    .in('id', [accountB1, accountB2, accountB3]);

  expect(rows?.every(r => r.paused === true)).toBe(true);
  expect(rows?.every(r => r.paused_reason === 'vacaciones')).toBe(true);
}, 30_000);

// ─── Test 5: POST calendar approve ───────────────────────────────────────────

it('POST calendar approve → status=approved, approved_by y approved_at set', async () => {
  const MONTH = '2099-11';

  // Crear calendario real en DB
  const { data: cal, error: calErr } = await sb.from('editorial_calendars').insert({
    portal_email: ORG_A_EMAIL,
    month:        `${MONTH}-01`,
    status:       'draft',
  }).select('id').single();
  expect(calErr).toBeNull();

  setupGuard(ORG_A_EMAIL, ORG_A_EMAIL, ORG_A_TOKEN);

  const req = makePostRequest(
    `http://localhost/api/portal/${ORG_A_TOKEN}/social/calendar/${MONTH}/approve`,
    {},
  );

  const res = await calApprove(
    req,
    { params: Promise.resolve({ token: ORG_A_TOKEN, month: MONTH }) },
  );

  expect(res.status).toBe(200);
  const json = await res.json() as { ok: boolean; data: Record<string, unknown> };
  expect(json.ok).toBe(true);

  // Verificar en DB
  const { data: row } = await sb
    .from('editorial_calendars')
    .select('status, approved_by, approved_at')
    .eq('id', cal!.id)
    .single();

  expect(row?.status).toBe('approved');
  expect(row?.approved_by).toBe(ORG_A_EMAIL);
  expect(row?.approved_at).not.toBeNull();
}, 30_000);
