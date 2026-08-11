export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, weeklyReportHtml } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { getOrgToken } from '@/lib/portal/org-token';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  // Atomic claim — deploy race Monday 14:00 UTC doblaba email a cada cliente.
  const claim = await claimCronRun(supabase, 'weekly-summary', 30 * 60 * 1000); // 30min window
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_email, portal_email, portal_token, minutes_used, minutes_included, notify_email')
    .eq('active', true)
    .not('client_email', 'is', null);

  if (!agents?.length) return NextResponse.json({ ok: true, sent: 0 });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const HOUR_LABELS = [
    '12am','1am','2am','3am','4am','5am','6am','7am',
    '8am','9am','10am','11am','12pm','1pm','2pm','3pm',
    '4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
  ];

  const orgTokenCache = new Map<string, string | null>();
  // Cache de pool por portal_email — el reporte semanal debe mostrar los
  // números del pool (source of truth post-migración), no los per-agente
  // que quedaron stale. Ver [[feedback-audit-read-path-fidelity]]: cliente
  // veía "0 de 0 min" en el email semanal aunque su pool tuviera minutos.
  const poolCache = new Map<string, { minutesUsed: number; minutesIncluded: number }>();
  async function getPoolMinutes(portalEmail: string): Promise<{ minutesUsed: number; minutesIncluded: number }> {
    const cached = poolCache.get(portalEmail);
    if (cached) return cached;
    const { data: acctMins } = await supabase
      .from('account_minutes')
      .select('minutes_used, minutes_included')
      .eq('portal_email', portalEmail)
      .maybeSingle();
    // Fallback ladder: pool > 0 → pool; else SUM per-agente activos; else 0.
    let minutesIncluded = 0;
    let minutesUsed     = 0;
    if (typeof acctMins?.minutes_included === 'number' && acctMins.minutes_included > 0) {
      minutesIncluded = acctMins.minutes_included;
      minutesUsed     = acctMins.minutes_used ?? 0;
    } else {
      const { data: peers } = await supabase
        .from('voice_agents')
        .select('minutes_used, minutes_included')
        .eq('portal_email', portalEmail)
        .eq('active', true);
      const sumInc = (peers ?? []).reduce((s, a: any) => s + ((a.minutes_included as number) ?? 0), 0);
      const sumUsed = (peers ?? []).reduce((s, a: any) => s + ((a.minutes_used as number) ?? 0), 0);
      minutesIncluded = sumInc;
      minutesUsed     = sumUsed;
    }
    const val = { minutesUsed, minutesIncluded };
    poolCache.set(portalEmail, val);
    return val;
  }

  let sent = 0;
  for (const agent of agents) {
    if (!(agent.notify_email ?? true)) continue;
    if (!agent.client_email)           continue;

    let orgToken: string | null = null;
    if (agent.portal_email) {
      if (orgTokenCache.has(agent.portal_email)) {
        orgToken = orgTokenCache.get(agent.portal_email) ?? null;
      } else {
        orgToken = await getOrgToken(agent.portal_email, supabase);
        orgTokenCache.set(agent.portal_email, orgToken);
      }
    }
    const tokenForUrl = orgToken ?? agent.portal_token;

    const [callsRes, leadsRes, apptsRes, ordersRes] = await Promise.all([
      supabase.from('voice_calls').select('id, outcome, created_at').eq('agent_id', agent.id).gte('created_at', weekAgo),
      supabase.from('leads_voice').select('id').eq('agent_id', agent.id).gte('created_at', weekAgo),
      supabase.from('appointments_voice').select('id').eq('agent_id', agent.id).gte('created_at', weekAgo),
      supabase.from('orders_voice').select('id').eq('agent_id', agent.id).gte('created_at', weekAgo),
    ]);

    const calls = callsRes.data ?? [];
    if (calls.length === 0) continue;

    const hourBuckets = new Array(24).fill(0);
    for (const c of calls) {
      hourBuckets[new Date(c.created_at).getHours()]++;
    }
    const peakH    = hourBuckets.indexOf(Math.max(...hourBuckets));
    const peakHour = hourBuckets[peakH] > 0 ? HOUR_LABELS[peakH] : null;

    const today     = new Date();
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt       = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    const period    = `${fmt(weekStart)} – ${fmt(today)}`;

    // Fetch pool minutes (org-scoped) o fallback a per-agent para standalone
    const poolMins = agent.portal_email
      ? await getPoolMinutes(agent.portal_email)
      : { minutesUsed: agent.minutes_used ?? 0, minutesIncluded: agent.minutes_included ?? 0 };

    await sendEmail({
      to:      agent.client_email,
      subject: `📊 Reporte semanal, ${agent.business_name}`,
      html:    weeklyReportHtml({
        businessName: agent.business_name,
        portalUrl:    `${appUrl}/portal/${tokenForUrl}`,
        period,
        totalCalls:   calls.length,
        leads:        leadsRes.data?.length ?? 0,
        appointments: apptsRes.data?.length ?? 0,
        orders:       ordersRes.data?.length ?? 0,
        minutesUsed:  poolMins.minutesUsed,
        minutesTotal: poolMins.minutesIncluded,
        peakHour,
      }),
    }).catch(console.error);

    sent++;
  }

  await releaseCronRun(supabase, 'weekly-summary');
  return NextResponse.json({ ok: true, sent });
}
