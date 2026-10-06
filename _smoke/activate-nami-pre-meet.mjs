// Reactiva Nami + corre el pre-check completo del runbook en una sola corrida.
// Uso: ALLOW_PROD_SMOKE=true npx tsx _smoke/activate-nami-pre-meet.mjs

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

console.log('── 1. Estado actual de Nami ──');
const { data: pre } = await sb.from('voice_agents')
  .select('agent_name, active, features')
  .eq('id', NAMI).maybeSingle();
console.log('  agent_name:', pre.agent_name);
console.log('  active:', pre.active);
console.log('  inventory_write_enabled:', pre.features?.inventory_write_enabled);
console.log('  paused_reason:', pre.features?.paused_reason ?? '(ninguna)');

if (pre.active) {
  console.log('\n  ⚠ Nami YA está activa. Skip reactivación.');
} else {
  console.log('\n── 2. Reactivando Nami ──');
  const newFeatures = { ...pre.features };
  delete newFeatures.paused_reason;
  const { error } = await sb.from('voice_agents')
    .update({ active: true, features: newFeatures })
    .eq('id', NAMI);
  if (error) { console.error('  ✗ Update falló:', error); process.exit(1); }
  console.log('  ✓ UPDATE aplicado');
}

console.log('\n── 3. Verificar post-update ──');
const { data: post } = await sb.from('voice_agents')
  .select('agent_name, active, features')
  .eq('id', NAMI).maybeSingle();
console.log('  active:', post.active);
console.log('  inventory_write_enabled:', post.features?.inventory_write_enabled);
console.log('  paused_reason:', post.features?.paused_reason ?? '(ninguna)');
const okNami = post.active === true && post.features?.inventory_write_enabled === true && !post.features?.paused_reason;
console.log(' ', okNami ? '✓ Nami lista' : '✗ Nami NO quedó bien, revisar');

console.log('\n── 4. Config AC: BACKLOG + trane_contacts ──');
const { data: org } = await sb.from('organizations')
  .select('inventory_excel_config')
  .eq('portal_email', PORTAL).maybeSingle();
console.log('  backlog_cfg:', JSON.stringify(org.inventory_excel_config.sheets.backlog));
console.log('  trane_contacts:', JSON.stringify(org.inventory_excel_config.trane_contacts));
const okConfig = org.inventory_excel_config.sheets.backlog.name === 'BACKLOG' &&
                 org.inventory_excel_config.trane_contacts?.registro_oc === 'isabel.galvan@trane.com' &&
                 org.inventory_excel_config.trane_contacts?.solicitar_entrega === 'isabel.galvan@trane.com';
console.log(' ', okConfig ? '✓ Config correcto' : '✗ Config NO cuadra, revisar');

console.log('\n── 5. Baseline audit log (última hora) ──');
const { count: auditCount } = await sb.from('inventory_mutations_log')
  .select('*', { count: 'exact', head: true })
  .eq('portal_email', PORTAL)
  .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
console.log('  Rows última hora:', auditCount ?? 0);

console.log('\n── 6. Pool AC (ops en organizations) ──');
const { data: poolRow } = await sb.from('organizations')
  .select('plan, monthly_ops_used, monthly_ops_pool, overage_ops, pool_reset_date, account_status, suspended_at')
  .eq('portal_email', PORTAL).maybeSingle();
console.log('  plan:', poolRow.plan);
console.log('  monthly_ops_pool (cap):', poolRow.monthly_ops_pool ?? '(null = sin cap específico)');
console.log('  monthly_ops_used:', poolRow.monthly_ops_used);
console.log('  overage_ops:', poolRow.overage_ops);
console.log('  pool_reset_date:', poolRow.pool_reset_date);
console.log('  account_status:', poolRow.account_status);
const okPool = poolRow.account_status === 'active' && !poolRow.suspended_at;
console.log(' ', okPool ? '✓ Account activo, demo puede correr' : '⚠ Account no está activo');

console.log('\n══════════════════════════════════════════');
console.log(okNami && okConfig ? '✓ TODO LISTO PARA EL MEET' : '✗ Hay algo que revisar antes del Meet');
console.log('══════════════════════════════════════════');
