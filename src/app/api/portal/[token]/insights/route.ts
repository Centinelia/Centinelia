export const dynamic   = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { generateLLMInsights, type InsightRec } from '@/lib/ai/insights-engine';
import { generateRulesInsights }                from '@/lib/ai/insights-rules';
import { consumeAiOp }           from '@/lib/ai/ops-guard';

interface Params { params: Promise<{ token: string }> }

async function resolveOrg(token: string) {
  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  return { supabase, portalEmail: agent?.portal_email ?? null };
}

function currentWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// GET — fetch this week's recommendations + current insight_mode
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? ''))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const weekStart = currentWeekStart();

  const [recsRes, orgRes, agentsRes] = await Promise.all([
    supabase
      .from('agent_recommendations')
      .select('id, agent_id, agent_name, agent_role, title, body, metric_key, current_value, priority, status, mode, created_at')
      .eq('org_id', portalEmail)
      .eq('week_start', weekStart)
      .neq('status', 'descartada')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('organizations')
      .select('insight_mode')
      .eq('portal_email', portalEmail)
      .single(),
    supabase
      .from('voice_agents')
      .select('id', { count: 'exact', head: true })
      .eq('portal_email', portalEmail)
      .eq('active', true),
  ]);

  return NextResponse.json({
    recs:        recsRes.data ?? [],
    mode:        (orgRes.data?.insight_mode ?? 'llm') as 'llm' | 'rules',
    agentCount:  agentsRes.count ?? 1,
    weekStart,
  });
}

// PATCH — update insight_mode for this org
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? ''))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { mode?: string };
  if (!body.mode || !['llm', 'rules'].includes(body.mode))
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await supabase
    .from('organizations')
    .upsert({ portal_email: portalEmail, insight_mode: body.mode }, { onConflict: 'portal_email' });

  return NextResponse.json({ ok: true });
}

// POST — trigger manual generation for this org (2 ops/agent in LLM mode)
export async function POST(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? ''))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const weekStart   = currentWeekStart();
  const now         = new Date();
  const weekAgo     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [orgRes, agentsRes] = await Promise.all([
    supabase.from('organizations').select('insight_mode').eq('portal_email', portalEmail).single(),
    supabase.from('voice_agents').select('id, business_name, role').eq('portal_email', portalEmail).eq('active', true),
  ]);

  const rawMode = orgRes.data?.insight_mode ?? 'llm';
  const mode: 'llm' | 'rules' = rawMode === 'rules' ? 'rules' : 'llm';
  const agents  = agentsRes.data ?? [];

  if (!agents.length) return NextResponse.json({ error: 'sin_agentes' }, { status: 400 });

  // For LLM mode: consume 2 ops per agent upfront (sequential — atomic check)
  if (mode === 'llm') {
    let failedAgent: string | null = null;
    for (let i = 0; i < agents.length && failedAgent === null; i++) {
      const result = await consumeAiOp(agents[i].id, 2);
      if (!result.ok) failedAgent = agents[i].business_name;
    }
    if (failedAgent !== null) {
      return NextResponse.json({ error: 'sin_tareas', agentName: failedAgent }, { status: 402 });
    }
  }

  const allRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const [thisRes, prevRes] = await Promise.all([
      supabase.from('voice_calls').select('outcome, self_eval_score, self_eval_notes, ces_data').eq('agent_id', agent.id).gte('created_at', weekAgo),
      supabase.from('voice_calls').select('outcome, self_eval_score, ces_data').eq('agent_id', agent.id).gte('created_at', twoWeeksAgo).lt('created_at', weekAgo),
    ]);

    const calls     = thisRes.data ?? [];
    const prevCalls = prevRes.data ?? [];

    let recs: InsightRec[] = [];
    if (mode === 'llm') {
      recs = await generateLLMInsights({ agentId: agent.id, agentName: agent.business_name, agentRole: agent.role ?? '', calls, prevWeekCalls: prevCalls });
    } else {
      recs = await generateRulesInsights({ agentId: agent.id, agentName: agent.business_name, calls, prevWeekCalls: prevCalls });
    }

    for (let j = 0; j < recs.length; j++) {
      const r = recs[j];
      allRows.push({
        org_id:        portalEmail,
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
      });
    }

    await supabase.from('agent_recommendations').delete().eq('agent_id', agent.id).eq('week_start', weekStart);
  }

  if (allRows.length > 0) await supabase.from('agent_recommendations').insert(allRows);

  // Return fresh recs
  const { data: fresh } = await supabase
    .from('agent_recommendations')
    .select('id, agent_id, agent_name, agent_role, title, body, metric_key, current_value, priority, status, mode, created_at')
    .eq('org_id', portalEmail)
    .eq('week_start', weekStart)
    .neq('status', 'descartada')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  return NextResponse.json({ ok: true, recs: fresh ?? [], generated: allRows.length });
}
