import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { MONTHLY_CONFIG } from '@/lib/billing/plans';
import type { Plan, MinutesTier } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today    = new Date().toISOString().slice(0, 10);
  const nextResetDate = new Date();
  nextResetDate.setDate(nextResetDate.getDate() + 30);
  const nextResetIso = nextResetDate.toISOString().slice(0, 10);

  // Orgs con reset vencido, agrupadas por billing_model
  const { data: due } = await supabase
    .from('organizations')
    .select('portal_email, pool_reset_date, monthly_ops_used, monthly_ops_pool, billing_model, ops_ledger_enabled, active_contract_id')
    .lte('pool_reset_date', today);

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
        // Stripe safety net: si invoice.paid webhook no llegó, insertamos renewal manual.
        // Sumamos el aiOps del plan de cada agente activo para calcular el crédito total.
        const { data: agents } = await supabase
          .from('voice_agents')
          .select('id, plan, minutes_plan, ai_ops_limit')
          .eq('portal_email', email)
          .eq('active', true);

        let totalOps = 0;
        const primaryAgentId = agents?.[0]?.id ?? null;
        for (const a of agents ?? []) {
          const cfg = MONTHLY_CONFIG[a.plan as Plan]?.[a.minutes_plan as MinutesTier];
          totalOps += cfg?.aiOps ?? (a.ai_ops_limit as number) ?? 0;
        }

        if (totalOps > 0 && primaryAgentId) {
          await supabase.rpc('apply_ops_ledger_entry', {
            p_portal_email: email,
            p_agent_id:     primaryAgentId,
            p_amount:       totalOps,
            p_kind:         'renewal',
            p_reference_id: `cron-safety-${today}`,
            p_description:  `Renovacion (safety-net cron): ${totalOps} tareas`,
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

  return NextResponse.json({
    ok:              true,
    checked:         due?.length ?? 0,
    annualGrants,
    stripeSafetyNets,
    legacyResets,
    errors:          errors.length ? errors : undefined,
  });
}
