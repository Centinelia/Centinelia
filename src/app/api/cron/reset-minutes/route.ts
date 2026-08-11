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
  const errors: string[] = [];
  // Accounts a procesar = todos menos non-stripe.
  const stripeAccounts = (allAccounts ?? []).filter(a => !nonStripeSet.has(a.portal_email as string));
  for (const acct of stripeAccounts) {
    try {
      // Refresca cache desde ledger (balance, cap, used_30d).
      await supabase.rpc('refresh_pool_cache', { p_portal_email: acct.portal_email });
      refreshed++;
      // Si el reset_date pasó, avanzarlo al siguiente ciclo (metadata solamente).
      await supabase.from('account_minutes')
        .update({ minutes_reset_date: nextDate })
        .eq('portal_email', acct.portal_email)
        .lt('minutes_reset_date', today);
      resetDate++;
      // Limpiar flag de fallback al arrancar el nuevo ciclo (idempotente).
      await supabase.from('organizations')
        .update({ fallback_notified_at: null })
        .eq('portal_email', acct.portal_email)
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

  console.log(`[reset-minutes] Refreshed: ${refreshed}, Reset dates: ${resetDate}, Agentes legacy: ${agentReset}, Errores: ${errors.length}`);

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
    agents_legacy:     agentReset,
    errors:            errors.length,
  });
}
