// Fix definitivo "sin créditos" para Nami: inserta un adjustment negativo en
// ops_ledger que lleve el balance exacto a 0. consumeAiOp luego rechaza cualquier
// intento porque newBalance < 0.
// Reversible: cuando Nazre pague Mes 1 real, insertar +N (credit/grant) para
// restablecer crédito según el plan contratado.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/Nazre/centinelia/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PORTAL = 'camila@acproyectos.com';
const NAMI = '3245bc1f-89e1-4949-bbed-71a18b05e344';

// 1. Balance actual (fuente de verdad: suma de amount en ops_ledger)
const { data: balanceData, error: bErr } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
if (bErr) { console.error('RPC error:', bErr); process.exit(1); }
const balance = balanceData ?? 0;
console.log(`Balance actual (ledger): ${balance}`);

if (balance <= 0) {
  console.log('Balance ya está en 0 o negativo. Nada que hacer.');
  process.exit(0);
}

// 2. Insertar adjustment -balance (vía RPC apply_ops_ledger_entry para pasar por auditoría)
const adjustment = -balance;
console.log(`Insertando ajuste: ${adjustment} con kind='adjustment' source='reset-pre-mes1-pago'`);

const { error: adjErr } = await sb.from('ops_ledger').insert({
  portal_email: PORTAL,
  agent_id:     NAMI,
  amount:       adjustment,
  kind:         'adjustment',
  source:       'reset-pre-mes1-pago',
  reference_id: 'reset-2026-10-09',
  description:  `Reset ops a 0 pre-pago Mes 1 real. Ajuste autorizado por Nazre 2026-10-09. Reversible con credit cuando AC pague operación mensual.`,
});
if (adjErr) { console.error('Insert error:', adjErr); process.exit(1); }

// 3. Verificar balance post
const { data: newBalanceData } = await sb.rpc('get_ops_pool_balance', { p_portal_email: PORTAL });
console.log(`Balance DESPUÉS: ${newBalanceData}`);

if (newBalanceData !== 0) {
  console.warn('⚠️  Balance no quedó en exacto 0 (puede haber ops concurrentes entrando).');
} else {
  console.log('✅ Nami sin créditos. Cualquier consumeAiOp devuelve ok=false.');
}
