export const dynamic   = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';
import { generateLLMInsights, metricKeyToDeepLink } from '@/lib/ai/insights-engine';
import { generateRulesInsights } from '@/lib/ai/insights-rules';
import { consumeAiOp }           from '@/lib/ai/ops-guard';

// Cap por empleado — cada empleado puede tener hasta N insights activos.
// Antes era global por org, lo que hacía que el primer agente en el loop
// llenara el cap y los demás no aparecieran (bug visible en portal).
const MAX_ACTIVE_INSIGHTS_PER_AGENT = 3;

interface Params { params: Promise<{ token: string }> }

async function resolveOrg(token: string) {
  const supabase = createAdminClient();
  const resolved = await resolveOrgFromToken(token);
  return { supabase, portalEmail: resolved?.portalEmail ?? null };
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
      .select(`
        id, agent_id, agent_name, agent_role, title, body, metric_key, current_value, priority, status, mode, created_at,
        voice_agents!agent_id(agent_name, features)
      `)
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
    // Incluye agent_name + features (meerkat_role_id) para que el insight
    // muestre 'Noah' en vez de 'Pneuma Studio' y colorée por rol.
    supabase.from('voice_agents').select('id, agent_name, business_name, role, features').eq('portal_email', portalEmail).eq('active', true),
  ]);

  const rawMode = orgRes.data?.insight_mode ?? 'rules';
  const mode: 'llm' | 'rules' = rawMode === 'llm' ? 'llm' : 'rules';
  const agents  = agentsRes.data ?? [];

  if (!agents.length) return NextResponse.json({ error: 'sin_agentes' }, { status: 400 });

  // Cap por agente: contamos activos actuales por agent_id para respetar
  // el límite individual sin bloquear a otros empleados.
  const { data: activeByAgentRows } = await supabase
    .from('agent_recommendations')
    .select('agent_id')
    .eq('org_id', portalEmail)
    .eq('status', 'nueva');
  const activeByAgent = new Map<string, number>();
  for (const row of activeByAgentRows ?? []) {
    activeByAgent.set(row.agent_id, (activeByAgent.get(row.agent_id) ?? 0) + 1);
  }
  // Solo rechazar si TODOS los agentes ya están al tope (nada por hacer).
  const anyRoom = agents.some(a => (activeByAgent.get(a.id) ?? 0) < MAX_ACTIVE_INSIGHTS_PER_AGENT);
  if (!anyRoom) {
    return NextResponse.json({
      error: 'cap_reached',
      message: 'Todos tus empleados ya tienen sus insights activos al tope. Aplica o descarta algunos antes de generar más.',
    }, { status: 409 });
  }

  // NOTA: en generación MANUAL no aplicamos dedup por metric_key.
  // El usuario pidió refresh explícito y ya pagó las ops — silenciar recs
  // porque comparten metric_key con la semana pasada oculta empleados enteros
  // (bug real con Sofía: 4 metric_keys previos hicieron que sus 4 recs nuevos
  // se filtraran todos y no apareciera en la lista).
  // El dedup sigue vivo en /api/cron/weekly-insights para el flujo automático.

  // For LLM mode: consume 2 ops per agent upfront (sequential — atomic check)
  if (mode === 'llm') {
    let failedAgent: string | null = null;
    for (let i = 0; i < agents.length && failedAgent === null; i++) {
      const result = await consumeAiOp(agents[i].id, 2, { source: 'insights_manual', reference_id: `${agents[i].id}:${weekStart}`, label: 'Insights generados manualmente' });
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

    // Prompt-side: usar el nombre del empleado (Noah, Nia) no el business
    // para que el LLM redacte 'Noah pidió confirmación...' en vez de
    // 'Pneuma Studio pidió...'.
    const promptAgentName = (agent as { agent_name?: string | null }).agent_name?.trim() || agent.business_name;
    let recs: Awaited<ReturnType<typeof generateLLMInsights>>;
    if (mode === 'llm') {
      recs = await generateLLMInsights({ agentId: agent.id, agentName: promptAgentName, agentRole: agent.role ?? '', calls, prevWeekCalls: prevCalls });
    } else {
      recs = await generateRulesInsights({ agentId: agent.id, agentName: promptAgentName, calls, prevWeekCalls: prevCalls });
    }

    // Contador por-agente para respetar el cap individual.
    let addedForAgent = 0;
    const alreadyActive = activeByAgent.get(agent.id) ?? 0;

    for (let j = 0; j < recs.length; j++) {
      const r = recs[j];
      // Cap por agente (sin dedup — ver nota arriba)
      if (alreadyActive + addedForAgent >= MAX_ACTIVE_INSIGHTS_PER_AGENT) break;
      addedForAgent++;

      allRows.push({
        org_id:        portalEmail,
        agent_id:      agent.id,
        // Preferir agent_name (Noah/Sofia/Nia) sobre business_name (Pneuma Studio).
        // Antes ese fallback rompía el display en el portal.
        agent_name:    (agent as { agent_name?: string | null }).agent_name?.trim() || agent.business_name,
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
    .select(`
      id, agent_id, agent_name, agent_role, title, body, metric_key, current_value, priority, status, mode, created_at,
      voice_agents!agent_id(agent_name, features)
    `)
    .eq('org_id', portalEmail)
    .eq('week_start', weekStart)
    .neq('status', 'descartada')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  return NextResponse.json({ ok: true, recs: fresh ?? [], generated: allRows.length });
}
