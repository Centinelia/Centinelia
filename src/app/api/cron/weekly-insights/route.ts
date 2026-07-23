export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateLLMInsights, type InsightRec } from '@/lib/ai/insights-engine';
import { generateRulesInsights }                from '@/lib/ai/insights-rules';

function currentWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase    = createAdminClient();
  const weekStart   = currentWeekStart();
  const now         = new Date();
  const weekAgo     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // All active agents
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, role, portal_email')
    .eq('active', true)
    .not('portal_email', 'is', null);

  if (!agents?.length) return NextResponse.json({ ok: true, totalRecs: 0 });

  // insight_mode per org
  const emails = [...new Set(agents.map(a => a.portal_email as string))];
  const { data: orgs } = await supabase
    .from('organizations')
    .select('portal_email, insight_mode')
    .in('portal_email', emails);

  const modeByOrg: Record<string, string> = {};
  const orgList = orgs ?? [];
  for (let oi = 0; oi < orgList.length; oi++) {
    modeByOrg[orgList[oi].portal_email] = orgList[oi].insight_mode ?? 'llm';
  }

  let totalRecs = 0;

  for (let i = 0; i < agents.length; i++) {
    const agent    = agents[i];
    const orgEmail = agent.portal_email as string;
    const rawMode  = modeByOrg[orgEmail] ?? 'llm';
    const mode: 'llm' | 'rules' = rawMode === 'rules' ? 'rules' : 'llm';

    const [thisRes, prevRes] = await Promise.all([
      supabase
        .from('voice_calls')
        .select('outcome, self_eval_score, self_eval_notes, ces_data')
        .eq('agent_id', agent.id)
        .gte('created_at', weekAgo),
      supabase
        .from('voice_calls')
        .select('outcome, self_eval_score, ces_data')
        .eq('agent_id', agent.id)
        .gte('created_at', twoWeeksAgo)
        .lt('created_at', weekAgo),
    ]);

    const calls     = thisRes.data ?? [];
    const prevCalls = prevRes.data ?? [];

    let recs: InsightRec[] = [];
    if (mode === 'llm') {
      recs = await generateLLMInsights({
        agentId:       agent.id,
        agentName:     agent.business_name,
        agentRole:     agent.role ?? '',
        calls,
        prevWeekCalls: prevCalls,
      });
    } else {
      recs = await generateRulesInsights({
        agentId:       agent.id,
        agentName:     agent.business_name,
        calls,
        prevWeekCalls: prevCalls,
      });
    }

    if (!recs.length) continue;

    const rows = recs.map(r => ({
      org_id:        orgEmail,
      agent_id:      agent.id,
      agent_name:    agent.business_name,
      agent_role:    agent.role ?? null,
      week_start:    weekStart,
      title:         r.title,
      body:          r.body,
      metric_key:    r.metric_key ?? null,
      current_value: r.current_value ?? null,
      priority:      r.priority,
      mode,
    }));

    // Delete previous recs for this agent+week (idempotent)
    await supabase
      .from('agent_recommendations')
      .delete()
      .eq('agent_id', agent.id)
      .eq('week_start', weekStart);

    await supabase.from('agent_recommendations').insert(rows);
    totalRecs += rows.length;
  }

  return NextResponse.json({ ok: true, weekStart, totalRecs });
}
