import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextResetDate } from '@/lib/billing/plans';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today    = new Date().toISOString().slice(0, 10);
  const nextDate = nextResetDate();

  // ── 1. Reset account_minutes rows with stale reset dates ──────────────────
  const { data: staleAccounts, error: acctErr } = await supabase
    .from('account_minutes')
    .select('portal_email, minutes_used, minutes_included')
    .lt('minutes_reset_date', today);

  if (acctErr) {
    return NextResponse.json({ error: acctErr.message }, { status: 500 });
  }

  let acctReset = 0;
  for (const acct of staleAccounts ?? []) {
    await supabase
      .from('account_minutes')
      .update({ minutes_used: 0, minutes_reset_date: nextDate, updated_at: new Date().toISOString() })
      .eq('portal_email', acct.portal_email);
    acctReset++;
  }

  // ── 2. Reset voice_agents that have a stale reset date and no account pool ─
  // (agents that use account_minutes will have their minutes synced from there)
  const stalePortalEmails = (staleAccounts ?? []).map(a => a.portal_email);

  let agentQuery = supabase
    .from('voice_agents')
    .select('id')
    .lt('minutes_reset_date', today)
    .eq('billing_status', 'activo');

  if (stalePortalEmails.length > 0) {
    agentQuery = agentQuery.not('portal_email', 'in', `(${stalePortalEmails.map(e => `"${e}"`).join(',')})`);
  }

  const { data: staleAgents, error: agentErr } = await agentQuery;

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

  console.log(`[reset-minutes] Cuentas: ${acctReset}, Agentes individuales: ${agentReset}`);

  return NextResponse.json({
    ok:           true,
    next_date:    nextDate,
    acct_reset:   acctReset,
    agent_reset:  agentReset,
  });
}
