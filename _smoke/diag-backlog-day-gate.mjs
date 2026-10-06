// Verifica que el gate miércoles/viernes del handler inv_importar_backlog
// funciona hoy: rechaza si no es miércoles/viernes, procesa con force=true.
// NO escribe al Excel (dry_run default). NO modifica DB.

import { createClient } from '@supabase/supabase-js';

if (process.env.ALLOW_PROD_SMOKE !== 'true') { console.error('Requiere ALLOW_PROD_SMOKE=true'); process.exit(1); }
const dotenv = await import('dotenv');
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

const dia = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Monterrey' }).format(new Date());
console.log('── Día actual MX:', dia, '─────────────────');
console.log('   (esperado skip: Mon/Tue/Thu/Sat/Sun. esperado procesar: Wed/Fri)\n');

const { executeAgentTool } = await import('../src/lib/tools/executor.ts');
const { data: agentRow } = await sb.from('voice_agents').select('*').eq('id', NAMI).maybeSingle();
const nameCtx = {
  agentId: NAMI, portalEmail: PORTAL, agentName: agentRow.agent_name, businessName: agentRow.business_name,
  portalToken: 'smoke', agent: agentRow, supabase: sb, channel: 'chat',
};

// Caso 1: sin force, pdf_url bogus (handler debería rechazar ANTES de intentar fetch si no es mi/vi)
console.log('── Caso 1: sin force (default behavior) ──');
const r1 = await executeAgentTool('inv_importar_backlog', {
  pdf_url: 'https://example.com/bogus.pdf',
  dry_run: true,
}, nameCtx);
console.log('   Result:', JSON.stringify(r1).slice(0, 300));

if (dia === 'Wed' || dia === 'Fri') {
  if (r1.code === 'pdf_fetch_failed') console.log('   ✓ Hoy es', dia, '→ handler intentó procesar (falló en fetch del PDF bogus, esperado)');
  else console.log('   ✗ Hoy es', dia, 'esperado que intente procesar; got code:', r1.code);
} else {
  if (r1.skipped === true && r1.code === 'wrong_day_of_week') console.log('   ✓ Hoy es', dia, '→ handler rechazó con wrong_day_of_week ✓');
  else console.log('   ✗ Hoy es', dia, 'esperado skip; got:', JSON.stringify(r1).slice(0, 200));
}

// Caso 2: con force=true (debería intentar procesar independiente del día)
console.log('\n── Caso 2: force=true (override) ──');
const r2 = await executeAgentTool('inv_importar_backlog', {
  pdf_url: 'https://example.com/bogus.pdf',
  dry_run: true,
  force: true,
}, nameCtx);
console.log('   Result:', JSON.stringify(r2).slice(0, 300));
if (r2.code === 'pdf_fetch_failed' || r2.code === 'parse_failed') {
  console.log('   ✓ force=true bypass el gate; intentó procesar (falló en fetch/parse del PDF bogus, esperado)');
} else {
  console.log('   ✗ force=true no funcionó como esperado; got:', JSON.stringify(r2).slice(0, 200));
}

console.log('\n✓ Diag completo.');
