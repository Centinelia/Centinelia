/**
 * El portal usa pool-status.ts ladder:
 *   aiOpsLimit = organizations.monthly_ops_pool  (si != null, gana siempre)
 *   aiOpsUsed  = account_ops.ops_used  (si ops_ledger_enabled)
 *              o organizations.monthly_ops_used
 *
 * Camila ve "0 rest." → monthly_ops_pool - monthly_ops_used <= 0.
 * Fix: bumpear monthly_ops_pool y resetear monthly_ops_used + account_ops.ops_used
 * para que vea 500 tareas disponibles YA en el demo.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const PORTAL_EMAIL = 'camila@acproyectos.com';

async function main() {
  const { data: before } = await sb
    .from('organizations')
    .select('id, monthly_ops_pool, monthly_ops_used, ops_ledger_enabled')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  console.log('ORG BEFORE:', before);

  const { data: acctBefore } = await sb
    .from('account_ops')
    .select('*')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  console.log('ACCT_OPS BEFORE:', acctBefore);

  // Target: 500 tareas disponibles para el demo.
  // Si ops_ledger_enabled: usa account_ops.ops_used. Entonces reset ops_used=0.
  // Si no: usa organizations.monthly_ops_used. Entonces reset ese.
  // Hazlo en ambos para estar seguro.
  const newPool = 1000;  // generoso para el demo
  const newUsed = 0;

  // Update organizations
  const { error: e1 } = await sb
    .from('organizations')
    .update({ monthly_ops_pool: newPool, monthly_ops_used: newUsed })
    .eq('portal_email', PORTAL_EMAIL);
  if (e1) throw e1;

  // Update account_ops (reset used)
  const { error: e2 } = await sb
    .from('account_ops')
    .update({ ops_used: newUsed, ops_included: newPool, ops_balance: newPool, updated_at: new Date().toISOString() })
    .eq('portal_email', PORTAL_EMAIL);
  if (e2) console.warn('account_ops update:', e2);

  const { data: after } = await sb
    .from('organizations')
    .select('monthly_ops_pool, monthly_ops_used, ops_ledger_enabled')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  console.log('ORG AFTER:', after);

  const { data: acctAfter } = await sb
    .from('account_ops')
    .select('*')
    .eq('portal_email', PORTAL_EMAIL)
    .maybeSingle();
  console.log('ACCT_OPS AFTER:', acctAfter);

  console.log(`\nPortal debería mostrar: ${newPool - newUsed} tareas rest. de ${newPool}`);
  console.log('Camila debe refrescar su página (F5) para ver el cambio.');
}

main().catch(e => { console.error(e); process.exit(1); });
