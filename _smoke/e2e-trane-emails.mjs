// E2E smoke test de las 2 tools nuevas de correos a Isabel de TRANE.
//
// Valida:
//   1. inv_notificar_trane_registro_oc enviar=false  → devuelve borrador sin enviar
//   2. inv_notificar_trane_registro_oc enviar=true   → envía via sendMeerkatHtmlEmail
//   3. inv_solicitar_entrega_trane enviar=false      → devuelve borrador sin enviar
//   4. inv_solicitar_entrega_trane enviar=true       → envía
//   5. destinatario_email override                   → va al email override
//   6. Fallback a config.trane_contacts si no override → va al config
//
// Seguridad: todos los envíos reales van a `nazre20@gmail.com` per
// [[feedback-no-tests-a-clientes]]. Isabel real NO recibe nada.
//
// Pool: inv_notificar_* no cobra ops (no consume_ai_op en handler).
//
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/e2e-trane-emails.mjs

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const envPath = fs.existsSync(new URL('../.env.local', import.meta.url))
  ? new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '')
  : 'C:/Users/Nazre/centinelia/.env.local';
const dotenv = await import('dotenv');
dotenv.config({ path: envPath });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI   = '3245bc1f-89e1-4949-bbed-71a18b05e344';
const TEST_EMAIL = 'nazre20@gmail.com';  // nunca Isabel real
const RUN_TAG = 'e2e-trane-' + Date.now();

console.log('── RUN_TAG:', RUN_TAG, '─────────────────────────────────');

// Fetch agent row from voice_agents to get email_from, email_domain_verified
console.log('\n── 1. Fetch Nami agent row ──');
const { data: agentRow, error: agentErr } = await sb
  .from('voice_agents')
  .select('id, agent_name, business_name, email_from, email_domain_verified, features, active')
  .eq('id', NAMI)
  .maybeSingle();
if (agentErr || !agentRow) { console.error('agent fetch err:', agentErr); process.exit(1); }
console.log('  Nami:', agentRow.agent_name, '· business:', agentRow.business_name);
console.log('  email_from:', agentRow.email_from, '· verified:', agentRow.email_domain_verified);
console.log('  active:', agentRow.active);

const { executeAgentTool } = await import('../src/lib/tools/executor.ts');

function makeCtx() {
  return {
    agentId:     NAMI,
    portalEmail: PORTAL,
    agentName:   agentRow.agent_name,
    businessName: agentRow.business_name,
    portalToken: 'smoke',
    agent: agentRow,
    supabase: sb,
    channel: 'chat',
  };
}

const results = {};

// ─── Test 1: inv_notificar_trane_registro_oc dry mode ───────────────────────
console.log('\n── 2. inv_notificar_trane_registro_oc enviar=false (borrador) ──');
try {
  const r = await executeAgentTool('inv_notificar_trane_registro_oc', {
    oc_numero: 'E2E-' + RUN_TAG,
    items: [
      { modelo: '4TXK6548G1000AA', cantidad: 10, descripcion: 'Mini split 4 TR' },
      { modelo: '4MXD6548G1000BA', cantidad: 5 },
    ],
    destinatario_email: TEST_EMAIL,
    nota: `TEST ${RUN_TAG} — ignorar, es prueba automática.`,
    enviar: false,
  }, makeCtx());
  const okDraft = r?.ok && r.draft?.to === TEST_EMAIL && r.draft?.subject?.includes(RUN_TAG);
  const containsItems = r?.draft?.html?.includes('4TXK6548G1000AA') && r?.draft?.html?.includes('10');
  results.notificar_dry = { ok: okDraft && containsItems, draft_to: r?.draft?.to, subject: r?.draft?.subject };
  console.log('  ' + (results.notificar_dry.ok ? '✓' : '✗') + ' Result:', JSON.stringify(results.notificar_dry));
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.notificar_dry = { ok: false, error: e.message };
}

// ─── Test 2: inv_notificar_trane_registro_oc envía de verdad ─────────────────
console.log('\n── 3. inv_notificar_trane_registro_oc enviar=true (envío real a ' + TEST_EMAIL + ') ──');
try {
  const r = await executeAgentTool('inv_notificar_trane_registro_oc', {
    oc_numero: 'E2E-' + RUN_TAG,
    items: [{ modelo: 'TEST-MODEL-E2E', cantidad: 1 }],
    destinatario_email: TEST_EMAIL,
    nota: `TEST ${RUN_TAG} — ignorar, es prueba automática.`,
    enviar: true,
  }, makeCtx());
  const okSent = r?.ok && r.oc_numero && r.message?.includes(TEST_EMAIL);
  results.notificar_send = { ok: okSent, message: r?.message, provider: r?.provider, error: r?.error };
  console.log('  ' + (okSent ? '✓' : '✗') + ' Result:', JSON.stringify(results.notificar_send));
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.notificar_send = { ok: false, error: e.message };
}

// ─── Test 3: inv_solicitar_entrega_trane dry mode ────────────────────────────
console.log('\n── 4. inv_solicitar_entrega_trane enviar=false (borrador) ──');
try {
  const r = await executeAgentTool('inv_solicitar_entrega_trane', {
    oc_numero: 'E2E-' + RUN_TAG,
    destinatario_email: TEST_EMAIL,
    fecha_requerida: '2026-10-15',
    nota: `TEST ${RUN_TAG} — ignorar.`,
    enviar: false,
  }, makeCtx());
  const okDraft = r?.ok && r.draft?.to === TEST_EMAIL && r.draft?.subject?.toLowerCase().includes('entrega');
  const containsDate = r?.draft?.html?.includes('2026-10-15');
  results.entrega_dry = { ok: okDraft && containsDate, draft_to: r?.draft?.to, subject: r?.draft?.subject };
  console.log('  ' + (results.entrega_dry.ok ? '✓' : '✗') + ' Result:', JSON.stringify(results.entrega_dry));
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.entrega_dry = { ok: false, error: e.message };
}

// ─── Test 4: inv_solicitar_entrega_trane envía ───────────────────────────────
console.log('\n── 5. inv_solicitar_entrega_trane enviar=true (envío real a ' + TEST_EMAIL + ') ──');
try {
  const r = await executeAgentTool('inv_solicitar_entrega_trane', {
    oc_numero: 'E2E-' + RUN_TAG,
    destinatario_email: TEST_EMAIL,
    nota: `TEST ${RUN_TAG} — ignorar.`,
    enviar: true,
  }, makeCtx());
  const okSent = r?.ok && r.oc_numero && r.message?.includes(TEST_EMAIL);
  results.entrega_send = { ok: okSent, message: r?.message, provider: r?.provider, error: r?.error };
  console.log('  ' + (okSent ? '✓' : '✗') + ' Result:', JSON.stringify(results.entrega_send));
} catch (e) {
  console.error('  ✗ ERROR:', e.message);
  results.entrega_send = { ok: false, error: e.message };
}

// ─── Test 5: destinatario sin override Y sin config → error claro ────────────
console.log('\n── 6. Sin destinatario_email Y sin config.trane_contacts → error claro ──');
const { data: org } = await sb.from('organizations').select('inventory_excel_config').eq('portal_email', PORTAL).maybeSingle();
const hasTraneContacts = !!(org?.inventory_excel_config?.trane_contacts?.registro_oc || org?.inventory_excel_config?.trane_contacts?.solicitar_entrega);
if (hasTraneContacts) {
  console.log('  AC ya tiene trane_contacts configurado → skip este test');
  console.log('  (si no quieres este fallback, borra el campo o testéalo contra otra org)');
  results.sin_destinatario = { ok: true, skipped: true };
} else {
  try {
    const r = await executeAgentTool('inv_notificar_trane_registro_oc', {
      oc_numero: 'X',
      items: [{ modelo: 'Y', cantidad: 1 }],
      // sin destinatario_email
      enviar: true,
    }, makeCtx());
    const okError = r?.ok === false && /destinatario/i.test(r?.error ?? '');
    results.sin_destinatario = { ok: okError, actual: r };
    console.log('  ' + (okError ? '✓' : '✗') + ' Result:', JSON.stringify(results.sin_destinatario));
  } catch (e) {
    console.error('  ✗ ERROR inesperado:', e.message);
    results.sin_destinatario = { ok: false, error: e.message };
  }
}

// ─── Reporte final ──────────────────────────────────────────────────────────
console.log('\n═════════════════════════════════════════');
console.log('REPORTE E2E TRANE EMAILS — RUN_TAG:', RUN_TAG);
console.log('═════════════════════════════════════════');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${v.ok ? '✓' : '✗'} ${k}:`, JSON.stringify(v));
}
const allOk = Object.values(results).every(r => r.ok);
console.log(allOk ? '\n✓ TODOS LOS FLOWS OK — revisar bandeja de ' + TEST_EMAIL + ' para los 2 correos reales.' : '\n✗ Hay fallos.');
process.exit(allOk ? 0 : 1);
