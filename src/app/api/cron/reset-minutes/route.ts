import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextResetDate } from '@/lib/billing/plans';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

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
  const today    = new Date().toISOString().slice(0, 10);
  const nextDate = nextResetDate();

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
  for (const acct of allAccounts ?? []) {
    if (nonStripeSet.has(acct.portal_email as string)) continue;
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

  console.log(`[reset-minutes] Refreshed: ${refreshed}, Reset dates: ${resetDate}, Agentes legacy: ${agentReset}`);

  return NextResponse.json({
    ok:                true,
    next_date:         nextDate,
    accounts_refreshed: refreshed,
    reset_dates:       resetDate,
    agents_legacy:     agentReset,
  });
}
