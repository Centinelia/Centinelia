import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure } from '@/lib/cron/alert-partial-failure';
import { todayInMexico } from '@/lib/billing/tz';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  // Timezone-aware (fix H4 audit): "today" en México, no UTC. Boundary correcto
  // para clientes al borde del mes calendario.
  const today    = todayInMexico();
  const nextResetDate = new Date();
  nextResetDate.setDate(nextResetDate.getDate() + 30);
  const nextResetIso = nextResetDate.toISOString().slice(0, 10);

  // Orgs con reset vencido O sin pool_reset_date inicializado. Antes el filtro
  // `.lte(pool_reset_date, today)` excluía rows con null → clientes recién
  // activados (Tortillería, test-followup) nunca recibían renewal grant y
  // get_pool_cap (refactor 2026-09-02) no podía detectar rollover legítimo.
  const { data: due } = await supabase
    .from('organizations')
    .select('portal_email, pool_reset_date, monthly_ops_used, monthly_ops_pool, billing_model, ops_ledger_enabled, active_contract_id')
    .or(`pool_reset_date.is.null,pool_reset_date.lte.${today}`);

  let annualGrants = 0;
  let stripeSafetyNets = 0;
  let legacyResets = 0;
  const errors: string[] = [];

  for (const org of due ?? []) {
    const email = org.portal_email as string;
    const model = org.billing_model as string;
    const ledgerOn = !!org.ops_ledger_enabled;

    try {
      if (ledgerOn && model === 'annual_prepaid' && org.active_contract_id) {
        // Annual: cierra ciclo con unused_forfeited + abre con annual_grant
        await supabase.rpc('apply_ops_annual_grant', { p_portal_email: email });
        annualGrants++;
      } else if (ledgerOn && (model === 'stripe' || !model)) {
        // Idempotency (fix 2026-09-04): antes solo se protegía contra doble
        // ejecución del cron via `reference_id=cron-safety-{today}` (ON CONFLICT
        // DO NOTHING en apply_ops_ledger_entry). Pero si un backfill manual o el
        // webhook de Stripe ya insertaron un renewal con OTRO reference_id en el
        // ciclo actual, el cron insertaba UN SEGUNDO renewal — disparaba
        // rollover_cap y descartaba tareas del cliente. Incidencia real:
        // Tortillería Estrella 2026-09-03 (backfill +520 a 00:38 + cron +520 a
        // 06:00 → cap descartó 496). Ahora skipeamos si YA existe cualquier
        // renewal en los últimos 25 días para este org.
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 25);
        const { data: existingRenewal } = await supabase
          .from('ops_ledger')
          .select('id')
          .eq('portal_email', email)
          .eq('kind', 'renewal')
          .gte('created_at', cutoff.toISOString())
          .limit(1);
        if (existingRenewal && existingRenewal.length > 0) {
          console.warn(`[reset-ops-pool] skip ${email}: renewal ya existe en los últimos 25 días (idempotency guard)`);
          // Igual actualizamos pool_reset_date para no reprocesarlo cada tick.
          await supabase.from('organizations')
            .update({ pool_reset_date: nextResetIso })
            .eq('portal_email', email);
          continue;
        }

        // Stripe safety net: si invoice.paid webhook no llegó, insertamos
        // renewal manual. Usamos get_plan_base_ops (mismo cálculo que
        // get_ops_pool_cap sin rollover) — antes se sumaba
        // MONTHLY_CONFIG[plan][tier].aiOps que daba 300 para pro-scale cuando
        // JORNADA_CONFIG dice 520 para jornada combinada.
        const { data: agents } = await supabase
          .from('voice_agents')
          .select('id')
          .eq('portal_email', email)
          .eq('active', true)
          .limit(1);
        const primaryAgentId = (agents?.[0]?.id as string | null) ?? null;
        const { data: planBase } = await supabase.rpc('get_plan_base_ops', { p_portal_email: email });
        const totalOps = (planBase as number | null) ?? 0;

        if (totalOps > 0 && primaryAgentId) {
          await supabase.rpc('apply_ops_ledger_entry', {
            p_portal_email: email,
            p_agent_id:     primaryAgentId,
            p_amount:       totalOps,
            p_kind:         'renewal',
            p_reference_id: `cron-safety-${today}`,
            p_description:  `Renovación (safety-net cron): ${totalOps} tareas`,
          });
          stripeSafetyNets++;
        }
      } else {
        // LEGACY path (flag off): comportamiento actual sin cambios
        await Promise.all([
          supabase.from('organizations').update({ monthly_ops_used: 0, pool_reset_date: nextResetIso }).eq('portal_email', email),
          supabase.from('voice_agents').update({ ai_ops_used: 0 }).eq('portal_email', email),
        ]);
        legacyResets++;
        continue;
      }

      // En path ledger-enabled también actualizamos pool_reset_date
      await supabase.from('organizations')
        .update({ pool_reset_date: nextResetIso })
        .eq('portal_email', email);

    } catch (err) {
      errors.push(`${email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalProcessed = annualGrants + stripeSafetyNets + legacyResets;
  await alertCronPartialFailure(supabase, {
    cronName:  'reset-ops-pool',
    expected:  due?.length ?? 0,
    processed: totalProcessed,
    errors,
  });

  return NextResponse.json({
    ok:              true,
    checked:         due?.length ?? 0,
    annualGrants,
    stripeSafetyNets,
    legacyResets,
    errors:          errors.length ? errors : undefined,
  });
}
