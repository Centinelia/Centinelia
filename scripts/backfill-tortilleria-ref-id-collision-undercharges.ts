/**
 * scripts/backfill-tortilleria-ref-id-collision-undercharges.ts
 *
 * Backfill de cobros perdidos por el bug reference_id collision en batch
 * de email_send_jobs (fix 2026-10-06 en process-email-jobs/route.ts:117).
 *
 * El bug: enqueueEmailJobBatch crea N jobs (uno por recipient) con el MISMO
 * reference_id de dominio. El cron cobraba 1 vez por job con ese ref → el
 * 2do+ chocaba contra ops_ledger_portal_ref_kind_uniq → undercharge silent.
 *
 * Afecta: servicioalcliente@tortillasestrella.com.mx (Tortillería),
 * sources incidencia_notif + alta_cliente_notif, desde 2026-09-30.
 *
 * Qué hace este script:
 *   1. Lee ai_ops_log filas count=0 + duplicate key + source ∈ {targets} para
 *      el portal_email de Tortillería.
 *   2. Para cada fila, intenta cobrar count=1 usando consume_pool_ops RPC con
 *      reference_id = `${original_ref}:backfill-{ai_ops_log_id}` para evitar
 *      colisión futura.
 *   3. Imprime antes/después del balance y lista cada backfill.
 *
 * Uso:
 *   npx tsx scripts/backfill-tortilleria-ref-id-collision-undercharges.ts         # dry-run (default)
 *   npx tsx scripts/backfill-tortilleria-ref-id-collision-undercharges.ts --apply # ejecuta cobros
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PORTAL = 'servicioalcliente@tortillasestrella.com.mx';
const SOURCES = ['incidencia_notif', 'alta_cliente_notif'];
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(`\n=== Backfill undercharges Tortillería (mode=${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  // 1) Snapshot balance antes
  const { data: orgBefore } = await sb
    .from('organizations')
    .select('monthly_ops_pool, monthly_ops_used, overage_ops')
    .eq('portal_email', PORTAL)
    .maybeSingle();
  console.log(`Balance antes:`);
  console.log(`  monthly_ops_pool: ${orgBefore?.monthly_ops_pool}`);
  console.log(`  monthly_ops_used: ${orgBefore?.monthly_ops_used}`);
  console.log(`  overage_ops:      ${orgBefore?.overage_ops}`);

  // 2) Fetch undercharges candidatos
  const { data: candidates } = await sb
    .from('ai_ops_log')
    .select('id, created_at, portal_email, agent_id, source, reference_id, label, context')
    .eq('portal_email', PORTAL)
    .eq('count', 0)
    .ilike('context', '%duplicate key%')
    .in('source', SOURCES)
    .order('created_at', { ascending: true });

  console.log(`\nUndercharges a corregir: ${candidates?.length ?? 0}\n`);

  if (!candidates || candidates.length === 0) {
    console.log('Nada que backfillear.');
    return;
  }

  // 3) Backfill cada uno
  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of candidates) {
    const backfillRef = `${row.reference_id}:backfill-${row.id.slice(0, 8)}`;
    console.log(`  ${row.created_at.slice(0, 19)} · ${row.source} · ref=${row.reference_id}`);
    console.log(`    → nuevo ref ledger: ${backfillRef}`);

    if (!APPLY) {
      console.log(`    [dry-run] skip`);
      skipped++;
      continue;
    }

    const description = `${row.label ?? row.source} (backfill ref-id collision bug 2026-10-05)`;
    const { data: rpcData, error: rpcErr } = await sb.rpc('consume_pool_ops', {
      p_portal_email: PORTAL,
      p_agent_id:     row.agent_id,
      p_ops:          1,
      p_reference_id: backfillRef,
      p_description:  description,
    });

    if (rpcErr) {
      console.log(`    FAIL (RPC): ${rpcErr.message}`);
      failed++;
      continue;
    }

    // Audit en ai_ops_log para trazabilidad (consistente con consumeAiOp del path normal)
    const { error: logErr } = await sb.from('ai_ops_log').insert({
      portal_email: PORTAL,
      agent_id:     row.agent_id,
      count:        1,
      source:       row.source,
      reference_id: backfillRef,
      label:        description,
      context:      JSON.stringify({
        backfill: true,
        bug:      'ref-id collision 2026-10-05',
        original_log_id: row.id,
        original_ref:    row.reference_id,
      }),
    });
    if (logErr) {
      console.log(`    PARTIAL: RPC ok (balance=${JSON.stringify(rpcData)}) but audit log fail: ${logErr.message}`);
      failed++;
    } else {
      console.log(`    OK: new balance=${JSON.stringify(rpcData)}`);
      done++;
    }
  }

  console.log(`\n=== Resultado ===`);
  console.log(`  Backfilleados OK: ${done}`);
  console.log(`  Fallidos:         ${failed}`);
  console.log(`  Dry-run skip:     ${skipped}`);

  // 4) Snapshot balance después
  if (APPLY) {
    const { data: orgAfter } = await sb
      .from('organizations')
      .select('monthly_ops_pool, monthly_ops_used, overage_ops')
      .eq('portal_email', PORTAL)
      .maybeSingle();
    console.log(`\nBalance después:`);
    console.log(`  monthly_ops_pool: ${orgAfter?.monthly_ops_pool}`);
    console.log(`  monthly_ops_used: ${orgAfter?.monthly_ops_used} (delta: ${(orgAfter?.monthly_ops_used ?? 0) - (orgBefore?.monthly_ops_used ?? 0)})`);
    console.log(`  overage_ops:      ${orgAfter?.overage_ops} (delta: ${(orgAfter?.overage_ops ?? 0) - (orgBefore?.overage_ops ?? 0)})`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
