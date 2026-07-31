export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, weeklyReportHtml } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_email, portal_token, minutes_used, minutes_included, notify_email')
    .eq('active', true)
    .not('client_email', 'is', null);

  if (!agents?.length) return NextResponse.json({ ok: true, sent: 0 });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const HOUR_LABELS = [
    '12am','1am','2am','3am','4am','5am','6am','7am',
    '8am','9am','10am','11am','12pm','1pm','2pm','3pm',
    '4pm','5pm','6pm','7pm','8pm','9pm','10pm','11pm',
  ];

  let sent = 0;
  for (const agent of agents) {
    if (!(agent.notify_email ?? true)) continue;
    if (!agent.client_email)           continue;

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

    await sendEmail({
      to:      agent.client_email,
      subject: `📊 Reporte semanal, ${agent.business_name}`,
      html:    weeklyReportHtml({
        businessName: agent.business_name,
        portalUrl:    `${appUrl}/portal/${agent.portal_token}`,
        period,
        totalCalls:   calls.length,
        leads:        leadsRes.data?.length ?? 0,
        appointments: apptsRes.data?.length ?? 0,
        orders:       ordersRes.data?.length ?? 0,
        minutesUsed:  agent.minutes_used   ?? 0,
        minutesTotal: agent.minutes_included ?? 0,
        peakHour,
      }),
    }).catch(console.error);

    sent++;
  }

  return NextResponse.json({ ok: true, sent });
}
