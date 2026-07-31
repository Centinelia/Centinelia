import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Called daily by Vercel cron. Vercel automatically sends
// Authorization: Bearer {CRON_SECRET} on cron invocations.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase  = createAdminClient();
  const period    = new Date().toISOString().slice(0, 7); // YYYY-MM
  const monthStart = `${period}-01`;

  const [
    { data: agents },
    { data: calls },
    { data: leads },
  ] = await Promise.all([
    supabase.from('voice_agents').select('id, minutes_used'),
    supabase.from('voice_calls').select('agent_id, duration_seconds').gte('created_at', monthStart),
    supabase.from('leads_voice').select('agent_id').gte('created_at', monthStart),
  ]);

  if (!agents) return NextResponse.json({ ok: false, error: 'no agents' });

  const stats: Record<string, { calls: number; duration: number; leads: number }> = {};
  for (const c of calls ?? []) {
    if (!stats[c.agent_id]) stats[c.agent_id] = { calls: 0, duration: 0, leads: 0 };
    stats[c.agent_id].calls++;
    stats[c.agent_id].duration += c.duration_seconds ?? 0;
  }
  for (const l of leads ?? []) {
    if (!stats[l.agent_id]) stats[l.agent_id] = { calls: 0, duration: 0, leads: 0 };
    stats[l.agent_id].leads++;
  }

  const rows = agents.map(a => ({
    agent_id:         a.id,
    period,
    calls:            stats[a.id]?.calls    ?? 0,
    leads:            stats[a.id]?.leads    ?? 0,
    duration_seconds: stats[a.id]?.duration ?? 0,
    minutes_used:     a.minutes_used,
    updated_at:       new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('agent_monthly_stats')
    .upsert(rows, { onConflict: 'agent_id,period' });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, period, agents: rows.length });
}
