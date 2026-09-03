import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure } from '@/lib/cron/alert-partial-failure';
import { todayInMexico, nextResetDateInMexico } from '@/lib/billing/tz';

export const dynamic = 'force-dynamic';

// En el modelo event-sourced, "reset" no borra nada del ledger — sólo
// refresca el cache de account_minutes (minutes_used_30d, balance, cap)
// para que la UI muestre datos frescos incluso en cuentas sin tráfico reciente.
// Agentes legacy standalone (sin portal_email) siguen usando reset directo.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  // Timezone-aware: cliente mexicano ve el día calendario según su reloj local,
  // no UTC (fix H3 audit). Evita boundary de ±1 día en accounts al borde.
  const today    = todayInMexico();
  const nextDate = nextResetDateInMexico();

  // ── 1. Refresh cache de todas las cuentas Stripe ──────────────────────────
  const { data: allAccounts } = await supabase
    .from('account_minutes')
    .select('portal_email');

  const stripeEmails = (allAccounts ?? []).map(a => a.portal_email as string);
  const { data: nonStripeOrgs } = stripeEmails.length
    ? await supabase.from('organizations').select('portal_email').in('portal_email', stripeEmails).neq('billing_model', 'stripe')
    : { data: [] as { portal_email: string }[] };
  const nonStripeSet = new Set((nonStripeOrgs ?? []).map(o => o.portal_email));

  let refreshed = 0;
  let resetDate = 0;
  let renewalGrants = 0;
  const errors: string[] = [];
  // Accounts a procesar = todos menos non-stripe.
  const stripeAccounts = (allAccounts ?? []).filter(a => !nonStripeSet.has(a.portal_email as string));
  for (const acct of stripeAccounts) {
    try {
      const email = acct.portal_email as string;

      // Si el reset_date ya expiró, escribir renewal grant en el ledger ANTES
      // de refrescar el cache. get_pool_cap (refactor 2026-09-02) requiere
      // este grant en el ciclo previo para reconocer rollover legítimo — sin
      // grant, ningún cliente acumula rollover aunque haya pagado. Safety-net:
      // si invoice.paid webhook ya insertó renewal con misma referencia, el
      // ON CONFLICT DO NOTHING de apply_ledger_entry lo hace idempotente.
      const { data: acctMinsRow } = await supabase
        .from('account_minutes')
        .select('minutes_reset_date')
        .eq('portal_email', email)
        .maybeSingle();
      const currentReset = acctMinsRow?.minutes_reset_date as string | null;
      const cycleExpired = currentReset && currentReset <= today;

      if (cycleExpired) {
        const { data: planBase } = await supabase.rpc('get_plan_base_minutes', { p_portal_email: email });
        const planBaseMin = (planBase as number | null) ?? 0;
        const { data: agents } = await supabase
          .from('voice_agents')
          .select('id')
          .eq('portal_email', email)
          .eq('active', true)
          .limit(1);
        const primaryAgentId = (agents?.[0]?.id as string | null) ?? null;

        if (planBaseMin > 0 && primaryAgentId) {
          await supabase.rpc('apply_ledger_entry', {
            p_portal_email: email,
            p_agent_id:     primaryAgentId,
            p_amount:       planBaseMin,
            p_kind:         'renewal',
            p_reference_id: `cron-safety-${currentReset}`,
            p_description:  `Renovación mensual (cron safety-net): ${planBaseMin} min`,
          });
          renewalGrants++;
        }
      }

      // Refresca cache desde ledger (balance, cap, used_30d).
      await supabase.rpc('refresh_pool_cache', { p_portal_email: email });
      refreshed++;
      // Si el reset_date pasó, avanzarlo al siguiente ciclo (metadata solamente).
      await supabase.from('account_minutes')
        .update({ minutes_reset_date: nextDate })
        .eq('portal_email', email)
        .lt('minutes_reset_date', today);
      resetDate++;
      // Limpiar flag de fallback al arrancar el nuevo ciclo (idempotente).
      await supabase.from('organizations')
        .update({ fallback_notified_at: null })
        .eq('portal_email', email)
        .not('fallback_notified_at', 'is', null);
    } catch (err) {
      errors.push(`${acct.portal_email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 2. Reset voice_agents standalone (sin portal_email) legacy path ──────
  const { data: staleAgents, error: agentErr } = await supabase
    .from('voice_agents')
    .select('id')
    .lt('minutes_reset_date', today)
    .eq('billing_status', 'activo')
    .is('portal_email', null);

  if (agentErr) {
    return NextResponse.json({ error: agentErr.message }, { status: 500 });
  }

  let agentReset = 0;
  for (const agent of staleAgents ?? []) {
    await supabase
      .from('voice_agents')
      .update({ minutes_used: 0, minutes_reset_date: nextDate })
      .eq('id', agent.id);
    agentReset++;
  }

  console.log(`[reset-minutes] Refreshed: ${refreshed}, Reset dates: ${resetDate}, Renewal grants: ${renewalGrants}, Agentes legacy: ${agentReset}, Errores: ${errors.length}`);

  // Alerta si hubo procesamiento parcial (H13 fix). No block la respuesta.
  await alertCronPartialFailure(supabase, {
    cronName:  'reset-minutes',
    expected:  stripeAccounts.length,
    processed: refreshed,
    errors,
  });

  return NextResponse.json({
    ok:                true,
    next_date:         nextDate,
    accounts_refreshed: refreshed,
    reset_dates:       resetDate,
    renewal_grants:    renewalGrants,
    agents_legacy:     agentReset,
    errors:            errors.length,
  });
}
