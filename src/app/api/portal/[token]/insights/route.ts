export const dynamic   = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { generateLLMInsights, metricKeyToDeepLink } from '@/lib/ai/insights-engine';
import { generateRulesInsights } from '@/lib/ai/insights-rules';
import { consumeAiOp }           from '@/lib/ai/ops-guard';

// Cap duro para evitar bloat contemplativo. Si ya hay N activos, no generar más.
const MAX_ACTIVE_INSIGHTS_PER_ORG = 3;
// Ventana de dedup: no volver a generar un insight con la misma métrica dentro de X días.
const DEDUP_WINDOW_DAYS = 14;

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
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && portalEmail && session.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

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
    mode:        (orgRes.data?.insight_mode ?? 'rules') as 'llm' | 'rules',
    agentCount:  agentsRes.count ?? 1,
    weekStart,
  });
}

// PATCH — update insight_mode for this org
export async function PATCH(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { mode?: string };
  if (!body.mode || !['llm', 'rules'].includes(body.mode))
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && portalEmail && session.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await supabase
    .from('organizations')
    .upsert({ portal_email: portalEmail, insight_mode: body.mode }, { onConflict: 'portal_email' });

  return NextResponse.json({ ok: true });
}

// POST — trigger manual generation for this org (2 ops/agent in LLM mode)
export async function POST(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { supabase, portalEmail } = await resolveOrg(token);
  if (!portalEmail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail && portalEmail && session.portalEmail !== portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const weekStart   = currentWeekStart();
  const now         = new Date();
  const weekAgo     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [orgRes, agentsRes] = await Promise.all([
    supabase.from('organizations').select('insight_mode').eq('portal_email', portalEmail).single(),
    supabase.from('voice_agents').select('id, business_name, role').eq('portal_email', portalEmail).eq('active', true),
  ]);

  const rawMode = orgRes.data?.insight_mode ?? 'rules';
  const mode: 'llm' | 'rules' = rawMode === 'llm' ? 'llm' : 'rules';
  const agents  = agentsRes.data ?? [];

  if (!agents.length) return NextResponse.json({ error: 'sin_agentes' }, { status: 400 });

  // Hard cap: rehusar si ya hay MAX_ACTIVE activos (status 'nueva').
  const { count: activeCount } = await supabase
    .from('agent_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', portalEmail)
    .eq('status', 'nueva');
  if ((activeCount ?? 0) >= MAX_ACTIVE_INSIGHTS_PER_ORG) {
    return NextResponse.json({
      error: 'cap_reached',
      message: `Ya tienes ${activeCount} insights activos. Aplica o descarta los actuales antes de generar más.`,
    }, { status: 409 });
  }

  // Dedup: fetch metric_keys usados recientemente (últimos DEDUP_WINDOW_DAYS)
  // por agente. Se filtran de los nuevos recs antes de insertar.
  const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400000).toISOString();
  const { data: recentRecs } = await supabase
    .from('agent_recommendations')
    .select('agent_id, metric_key')
    .eq('org_id', portalEmail)
    .in('status', ['nueva', 'aplicada'])
    .gte('created_at', dedupCutoff)
    .not('metric_key', 'is', null);
  const dedupSet = new Set(
    (recentRecs ?? []).map(r => `${r.agent_id}::${r.metric_key}`)
  );

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

    let recs: Awaited<ReturnType<typeof generateLLMInsights>>;
    if (mode === 'llm') {
      recs = await generateLLMInsights({ agentId: agent.id, agentName: agent.business_name, agentRole: agent.role ?? '', calls, prevWeekCalls: prevCalls });
    } else {
      recs = await generateRulesInsights({ agentId: agent.id, agentName: agent.business_name, calls, prevWeekCalls: prevCalls });
    }

    for (let j = 0; j < recs.length; j++) {
      const r = recs[j];
      // Dedup: skip si el (agent, metric_key) ya fue emitido dentro de la ventana
      const dedupKey = `${agent.id}::${r.metric_key ?? 'null'}`;
      if (r.metric_key && dedupSet.has(dedupKey)) continue;
      // Respetar cap total: sumar activos existentes + los que planeamos insertar
      if ((activeCount ?? 0) + allRows.length >= MAX_ACTIVE_INSIGHTS_PER_ORG) break;

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
        deep_link:     metricKeyToDeepLink(r.metric_key, token),
      });
    }

    // Solo borrar rows viejos de este agente+semana si vamos a reemplazar
    // (ya no hacemos delete indiscriminado — el ledger histórico se preserva
    // con status 'expirada' vía el cron correspondiente).
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
