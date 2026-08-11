import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure } from '@/lib/cron/alert-partial-failure';

export const dynamic = 'force-dynamic';

// Fix T11 audit 2026-08-10: retention policy para logs analíticos.
// LFPDPPP art. 14 exige "no más del tiempo necesario". Antes: ai_ops_log,
// llm_call_log, tool_call_log, platform_incidents crecían indefinidamente.
//
// Política definida:
// - ai_ops_log: 7 años (audit trail de consumo — cliente puede pedir historial)
// - llm_call_log: 1 año (observability, no legal-required)
// - tool_call_log: 90 días (per comment en migration — solo debug)
// - platform_incidents resolved/closed: 1 año post-resolución
// - stripe_webhook_events: 90 días (dedupe expira, ya no útil para retry protection)
//
// Corre semanal. Delete en batches para no lockear tabla.

const BATCH_SIZE = 5000;

interface CleanupRule {
  table:      string;
  column:     string;
  age_days:   number;
  extra_where?: string;
  label:      string;
}

const RULES: CleanupRule[] = [
  { table: 'llm_call_log',           column: 'created_at', age_days: 365,   label: 'LLM call observability (1 año)' },
  { table: 'tool_call_log',          column: 'created_at', age_days: 90,    label: 'Tool call debug (90 días)' },
  { table: 'platform_incidents',     column: 'updated_at', age_days: 365, extra_where: `status IN ('resolved','closed')`, label: 'Incidents resueltos (1 año)' },
  { table: 'stripe_webhook_events',  column: 'processed_at', age_days: 90,  label: 'Stripe webhook dedupe (90 días)' },
  { table: 'ai_ops_log',             column: 'created_at', age_days: 365 * 7, label: 'AI ops log (7 años retention Municipio)' },
];

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: Array<{ table: string; deleted: number; error?: string }> = [];
  const errors: string[] = [];

  for (const rule of RULES) {
    const cutoff = new Date(Date.now() - rule.age_days * 24 * 60 * 60 * 1000).toISOString();
    try {
      let totalDeleted = 0;

      // Fix V2 audit: ai_ops_log tiene trigger tamper-protection. Usar RPC
      // dedicada que setea SET LOCAL ledger.allow_delete='true' + DELETE.
      if (rule.table === 'ai_ops_log') {
        while (true) {
          const { data, error } = await supabase.rpc('purge_ai_ops_log_older_than', {
            p_cutoff: cutoff,
            p_batch_size: BATCH_SIZE,
          });
          if (error) throw error;
          const deleted = (data as number) ?? 0;
          totalDeleted += deleted;
          if (deleted < BATCH_SIZE) break;
        }
        results.push({ table: rule.table, deleted: totalDeleted });
        continue;
      }

      // Batched delete para tablas SIN tamper-protection trigger.
      while (true) {
        const selectQuery = supabase.from(rule.table).select('id').lt(rule.column, cutoff).limit(BATCH_SIZE);
        const { data: rowsToDelete, error: selErr } = await selectQuery;
        if (selErr) throw selErr;
        if (!rowsToDelete || rowsToDelete.length === 0) break;

        const ids = rowsToDelete.map(r => r.id as string);
        let deleteQuery = supabase.from(rule.table).delete().in('id', ids);
        if (rule.table === 'platform_incidents') {
          deleteQuery = deleteQuery.in('status', ['resolved', 'closed']);
        }
        const { error: delErr } = await deleteQuery;
        if (delErr) throw delErr;
        totalDeleted += rowsToDelete.length;
        if (rowsToDelete.length < BATCH_SIZE) break;
      }
      results.push({ table: rule.table, deleted: totalDeleted });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ table: rule.table, deleted: 0, error: msg });
      errors.push(`${rule.table}: ${msg}`);
    }
  }

  await alertCronPartialFailure(supabase, {
    cronName:  'cleanup-analytics',
    expected:  RULES.length,
    processed: results.filter(r => !r.error).length,
    errors,
  });

  return NextResponse.json({ ok: true, results, errors: errors.length });
}
