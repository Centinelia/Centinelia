import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const NELIA_ID = 'e17bc13d-8624-4792-89d7-eac00edad051';
const PORTAL_EMAIL = 'meefi-demo@centinelia.mx';

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? 'OK ' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function checkEnvVar() {
  const hasAgentId = !!process.env.MEEFI_NELIA_AGENT_ID;
  const valueOk = process.env.MEEFI_NELIA_AGENT_ID === NELIA_ID;
  record(
    'Env MEEFI_NELIA_AGENT_ID',
    hasAgentId && valueOk,
    hasAgentId ? (valueOk ? 'valor correcto en .env.local' : 'valor NO coincide con Nelia real') : 'no seteada localmente',
  );
}

async function checkNeliaExists() {
  const { data, error } = await supabase
    .from('voice_agents')
    .select('id, agent_name, active, role, LENGTH_HINT:role_knowledge_base')
    .eq('id', NELIA_ID)
    .maybeSingle();
  if (error || !data) {
    record('Nelia existe en DB', false, error?.message || 'no encontrada');
    return;
  }
  record(
    'Nelia existe en DB',
    data.active === true,
    `${data.agent_name} · ${data.role} · active=${data.active}`,
  );

  const { data: rowRaw } = await supabase
    .from('voice_agents')
    .select('role_knowledge_base')
    .eq('id', NELIA_ID)
    .single();
  const kbLen = (rowRaw?.role_knowledge_base || '').length;
  record('KB operativa Nelia cargada', kbLen >= 3000, `${kbLen} chars`);
}

async function checkPoolBalance() {
  const { data: opsRows } = await supabase
    .from('ops_ledger')
    .select('amount')
    .eq('portal_email', PORTAL_EMAIL);
  const opsBalance = (opsRows || []).reduce((a, r) => a + r.amount, 0);
  record('Pool ops (tareas) suficiente', opsBalance >= 200, `${opsBalance} tareas`);

  const { data: minRows } = await supabase
    .from('minutes_ledger')
    .select('amount')
    .eq('portal_email', PORTAL_EMAIL);
  const minBalance = (minRows || []).reduce((a, r) => a + r.amount, 0);
  record('Pool minutos', minBalance >= 60, `${minBalance} min`);
}

async function checkKbArticles() {
  const { count } = await supabase
    .from('knowledge_base_articles')
    .select('*', { count: 'exact', head: true })
    .eq('source', 'meefi_help_center');
  record('KB Help Center ingerida', (count || 0) >= 15, `${count} artículos`);
}

async function checkKbRpc() {
  const { data, error } = await supabase.rpc('search_meefi_help_center', {
    q: 'SPEI',
    top_k: 3,
  });
  const hits = data?.length || 0;
  record('RPC search_meefi_help_center funcional', !error && hits > 0, error?.message || `${hits} hits para "SPEI"`);
}

async function checkTools() {
  const expected = [
    'meefi_lookup_user_account',
    'meefi_check_transfer_status',
    'meefi_search_help_center',
    'meefi_send_password_reset_link',
    'meefi_initiate_2fa_recovery',
    'meefi_capture_bug_report',
    'meefi_escalate_to_human',
  ];
  const { data } = await supabase
    .from('voice_agents')
    .select('features')
    .eq('id', NELIA_ID)
    .single();
  const roleId = data?.features?.meerkat_role_id;
  record('Nelia con meerkat_role_id=nelia', roleId === 'nelia', roleId || 'sin role_id');
  console.log(`      Tools esperadas en preset Nelia: ${expected.length} (verificable en runtime)`);
}

async function checkEndpoint() {
  const port = process.env.PORT || 3000;
  const url = `http://localhost:${port}/api/demo/meefi/chat`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'ping',
        session_id: `preflight_${Date.now()}`,
        user_email: 'demo3@meefi.io',
        scenario: 2,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 500) {
      record('Endpoint /api/demo/meefi/chat local', false, 'HTTP 500 — probable MEEFI_NELIA_AGENT_ID falta en runtime');
      return;
    }
    record('Endpoint /api/demo/meefi/chat local', res.ok, `HTTP ${res.status}`);
  } catch (err) {
    record('Endpoint /api/demo/meefi/chat local', false, `no responde — ¿pnpm dev corriendo? (${err.message})`);
  }
}

async function main() {
  console.log('\n=== Preflight demo Meefi 15-sept ===\n');
  await checkEnvVar();
  await checkNeliaExists();
  await checkPoolBalance();
  await checkKbArticles();
  await checkKbRpc();
  await checkTools();
  await checkEndpoint();

  const fails = results.filter(r => !r.ok);
  console.log(`\n=== Resumen: ${results.length - fails.length}/${results.length} OK ===\n`);
  if (fails.length > 0) {
    console.log('FALLOS a resolver antes del dry run:');
    for (const f of fails) console.log(`  · ${f.name}: ${f.detail}`);
    console.log('\nAcciones sugeridas:');
    console.log('  - Env var faltante: pnpm dev muere sin ella; revisa .env.local y Vercel.');
    console.log('  - Pool bajo: corre scripts/meefi/pool-grant.ts para reforzar.');
    console.log('  - KB < 15: revisa help-center-fallback.json y re-ingiere.');
    console.log('  - Endpoint no responde: arranca pnpm dev en otra terminal y reintenta.\n');
    process.exit(1);
  }
  console.log('Stack técnico listo para dry run. Pendientes offline:');
  console.log('  - MEEFI_NELIA_AGENT_ID seteado en Vercel (Production + Preview).');
  console.log('  - Gmail OAuth conectado a Nelia desde portal /oficina/empleados/nelia.');
  console.log('  - Aliases Gmail +ashley +emilio +jaime configurados (opcional).\n');
}

main().catch(err => {
  console.error('Preflight error inesperado:', err);
  process.exit(1);
});
