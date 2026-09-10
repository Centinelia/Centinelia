import { createClient } from '@supabase/supabase-js';

/**
 * Script de grant inicial de pool para la demo Meefi 15-sept.
 *
 * Inserta:
 * - 1000 tareas en ops_ledger (para tools + escalamientos + procesamiento bandeja).
 * - 300 minutos en minutes_ledger asociados a Nelia (chat-only, minutos backup).
 *
 * Motivación: los dry runs pre-demo pueden consumir 50-100 tool calls; el grant
 * garantiza que la demo no se caiga por saldo insuficiente.
 *
 * Idempotencia: verifica si ya existe un grant con el mismo reference_id
 * para no duplicar cuando se corre varias veces.
 *
 * NOTA histórica: el grant inicial 2026-09-10 se aplicó vía Supabase MCP directo
 * (INSERT sin reference_id). Las rows `d40c88fa-...` (ops) y `a0d05bf6-...` (minutes)
 * quedan sin reference_id en la BD real. La idempotencia empieza a funcionar
 * a partir de la 2a corrida del script.
 *
 * Uso:
 *   pnpm tsx scripts/meefi/pool-grant.ts
 *
 * Después de correrlo, verifica los balances desde el portal
 * o vía SQL: SELECT SUM(amount) FROM ops_ledger WHERE portal_email='meefi-demo@centinelia.mx'
 */

const MEEFI_PORTAL_EMAIL = 'meefi-demo@centinelia.mx';
const NELIA_AGENT_ID = 'e17bc13d-8624-4792-89d7-eac00edad051';
const REFERENCE_ID = 'meefi-demo-2026-09-10-t12-pool-grant';
const OPS_GRANT_AMOUNT = 1000;
const MINUTES_GRANT_AMOUNT = 300;
const DESCRIPTION = 'Demo Meefi 15-sept: grant artificial pre-dry-runs (T12)';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: existingOps } = await supabase
    .from('ops_ledger')
    .select('id')
    .eq('reference_id', REFERENCE_ID)
    .maybeSingle();

  if (existingOps) {
    console.warn(`Advertencia: grant ops ya existe con id ${existingOps.id}. No se duplica.`);
  } else {
    const { error: opsErr } = await supabase.from('ops_ledger').insert({
      portal_email: MEEFI_PORTAL_EMAIL,
      amount: OPS_GRANT_AMOUNT,
      kind: 'admin_adjustment',
      source: 'admin_adjustment',
      reference_id: REFERENCE_ID,
      description: DESCRIPTION,
    });
    if (opsErr) throw new Error(`Error en ops_ledger: ${opsErr.message}`);
    console.log(`Grant ops aplicado: +${OPS_GRANT_AMOUNT} tareas.`);
  }

  const { data: existingMin } = await supabase
    .from('minutes_ledger')
    .select('id')
    .eq('reference_id', REFERENCE_ID)
    .maybeSingle();

  if (existingMin) {
    console.warn(`Advertencia: grant minutos ya existe con id ${existingMin.id}. No se duplica.`);
  } else {
    const { error: minErr } = await supabase.from('minutes_ledger').insert({
      portal_email: MEEFI_PORTAL_EMAIL,
      agent_id: NELIA_AGENT_ID,
      amount: MINUTES_GRANT_AMOUNT,
      kind: 'admin_adjustment',
      source: 'admin_adjustment',
      reference_id: REFERENCE_ID,
      description: `${DESCRIPTION} - asignado a Nelia por default (chat-only, minutos backup)`,
    });
    if (minErr) throw new Error(`Error en minutes_ledger: ${minErr.message}`);
    console.log(`Grant minutos aplicado: +${MINUTES_GRANT_AMOUNT} min a Nelia.`);
  }

  const [{ data: opsSum }, { data: minSum }] = await Promise.all([
    supabase.rpc('sum_ops_ledger_for_portal', { p_portal_email: MEEFI_PORTAL_EMAIL }).single(),
    supabase.rpc('sum_minutes_ledger_for_portal', { p_portal_email: MEEFI_PORTAL_EMAIL }).single(),
  ]).catch(() => [{ data: null }, { data: null }]);

  console.log(`\nBalance actual (si el RPC de suma existe):`);
  console.log(`  ops: ${opsSum ?? 'consulta SQL directa'}`);
  console.log(`  minutes: ${minSum ?? 'consulta SQL directa'}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
