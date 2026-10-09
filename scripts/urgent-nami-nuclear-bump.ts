/**
 * NUCLEAR: Nami lee ops_limit/used desde consumeAiOp (que resuelve a account_ops
 * o voice_agents). El trigger de Postgres mantiene account_ops.ops_used=628 (del ledger).
 * Bumpear ai_ops_limit a 5000 asegura que remain = 5000-628 = 4372 >> umbral de 20.
 * Y el aviso de "pool agotado" en el system prompt no se dispara.
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
  const { error: e1 } = await sb
    .from('voice_agents')
    .update({ ai_ops_limit: 5000, ai_ops_used: 0 })
    .eq('portal_email', PORTAL_EMAIL)
    .eq('agent_name', 'Nami');
  if (e1) throw e1;

  // Insertar grant +5000 en el ledger para que account_ops.ops_balance refleje y
  // account_ops.ops_included/used queden en estado consistente post-trigger.
  const { data: agent } = await sb
    .from('voice_agents').select('id').eq('portal_email', PORTAL_EMAIL).eq('agent_name', 'Nami').maybeSingle();
  const { error: e2 } = await sb.from('ops_ledger').insert({
    portal_email: PORTAL_EMAIL,
    agent_id: (agent as any)?.id,
    amount: 5000,
    kind: 'manual_grant',
    source: 'manual_grant',
    description: 'Demo Camila 2026-10-07 nuclear bump: compensar leak self-notif + buffer',
  });
  if (e2) console.warn(e2);

  // También actualizar organizations monthly_ops_pool a 5000 por si Nami lee de ahí
  const { error: e3 } = await sb
    .from('organizations')
    .update({ monthly_ops_pool: 5000, monthly_ops_used: 0 })
    .eq('portal_email', PORTAL_EMAIL);
  if (e3) console.warn(e3);

  // Verificar
  const { data: after } = await sb
    .from('voice_agents').select('agent_name, ai_ops_used, ai_ops_limit, active').eq('portal_email', PORTAL_EMAIL);
  console.log('AGENTS AFTER:', after);
  const { data: acctAfter } = await sb.from('account_ops').select('*').eq('portal_email', PORTAL_EMAIL).maybeSingle();
  console.log('ACCT_OPS AFTER:', acctAfter);
  const { data: orgAfter } = await sb.from('organizations').select('monthly_ops_pool, monthly_ops_used').eq('portal_email', PORTAL_EMAIL).maybeSingle();
  console.log('ORG AFTER:', orgAfter);
}

main().catch(e => { console.error(e); process.exit(1); });
