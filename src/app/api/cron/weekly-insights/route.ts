export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateLLMInsights, type InsightRec, metricKeyToDeepLink } from '@/lib/ai/insights-engine';
import { generateRulesInsights }                from '@/lib/ai/insights-rules';
import { consumeAiOp }                          from '@/lib/ai/ops-guard';
import { maybeSendQuotaEmail }                  from '@/lib/ai/quota-email';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';

const MAX_ACTIVE_INSIGHTS_PER_ORG = 3;
const DEDUP_WINDOW_DAYS = 14;

function currentWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase    = createAdminClient();
  // Atomic claim — deploy race Monday 7am doblaba recs + 2× consumeAiOp(3) por agente.
  const claim = await claimCronRun(supabase, 'weekly-insights', 60 * 60 * 1000);
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });
  const weekStart   = currentWeekStart();
  const now         = new Date();
  const weekAgo     = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // All active agents with weekly_insights opted in
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, role, portal_email, client_email, agent_name, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token, features, timezone')
    .eq('active', true)
    .not('portal_email', 'is', null)
    .eq('features->automations->weekly_insights->>enabled', 'true');

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
    modeByOrg[orgList[oi].portal_email] = orgList[oi].insight_mode ?? 'rules';
  }

  // Contadores por org (para respetar hard cap sin dobles queries)
  const activeCountByOrg: Record<string, number> = {};
  const dedupSetByOrg: Record<string, Set<string>> = {};
  const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400000).toISOString();
  for (let oi = 0; oi < emails.length; oi++) {
    const email = emails[oi];
    const { count } = await supabase
      .from('agent_recommendations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', email)
      .eq('status', 'nueva');
    activeCountByOrg[email] = count ?? 0;

    const { data: recent } = await supabase
      .from('agent_recommendations')
      .select('agent_id, metric_key')
      .eq('org_id', email)
      .in('status', ['nueva', 'aplicada'])
      .gte('created_at', dedupCutoff)
      .not('metric_key', 'is', null);
    dedupSetByOrg[email] = new Set((recent ?? []).map(r => `${r.agent_id}::${r.metric_key}`));
  }

  let totalRecs = 0;

  for (let i = 0; i < agents.length; i++) {
    const agent    = agents[i];
    const orgEmail = agent.portal_email as string;
    const rawMode  = modeByOrg[orgEmail] ?? 'rules';
    const mode: 'llm' | 'rules' = rawMode === 'llm' ? 'llm' : 'rules';

    // Skip si esta cuenta ya llegó al cap
    if (activeCountByOrg[orgEmail] >= MAX_ACTIVE_INSIGHTS_PER_ORG) continue;

    // Fetch calls PRIMERO — cero costo LLM, solo queries
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

    // Probe: si este agente no tuvo NINGUNA llamada en las últimas 2 semanas,
    // no hay nada que analizar. Skip sin cobrar. Fix 2026-08-10.
    if (calls.length === 0 && prevCalls.length === 0) continue;

    // Ops guard — LLM costs 3 ops, rules costs 0
    const cost = mode === 'rules' ? 0 : 3;
    if (cost > 0) {
      const ops = await consumeAiOp(agent.id, cost, { source: 'weekly_insights', reference_id: `${agent.id}:${weekStart}`, label: 'Insights semanales (cron)' });
      if (!ops.ok) {
        await maybeSendQuotaEmail(agent, 'weekly_insights');
        continue;
      }
    }

    let recs: InsightRec[] = [];
    if (mode === 'llm') {
      recs = await generateLLMInsights({
        agentId:       agent.id,
        agentName:     agent.business_name,
        agentRole:     agent.role ?? '',
        calls,
        prevWeekCalls: prevCalls,
        timezone:      (agent as any).timezone ?? 'America/Monterrey',
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

    // Dedup + cap: filtrar recs que ya se hayan generado recientemente para este agente,
    // y respetar el cap total activo por org.
    const rows: Array<Record<string, unknown>> = [];
    const dedupSet = dedupSetByOrg[orgEmail];
    const agentToken = (agent as any).portal_token as string | null;
    for (let j = 0; j < recs.length; j++) {
      const r = recs[j];
      const dedupKey = `${agent.id}::${r.metric_key ?? 'null'}`;
      if (r.metric_key && dedupSet.has(dedupKey)) continue;
      if (activeCountByOrg[orgEmail] + rows.length >= MAX_ACTIVE_INSIGHTS_PER_ORG) break;

      rows.push({
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
        deep_link:     agentToken ? metricKeyToDeepLink(r.metric_key, agentToken) : null,
      });
    }

    if (!rows.length) continue;

    await supabase.from('agent_recommendations').insert(rows);
    totalRecs += rows.length;

    // Actualizar contador local para respetar cap entre iteraciones del mismo org
    activeCountByOrg[orgEmail] += rows.length;

    // Update last_ran_at for this agent (merge-write, never replace whole features object)
    // Re-SELECT fresh features to avoid clobbering concurrent PATCH toggles
    const { data: freshAgent } = await supabase
      .from('voice_agents')
      .select('features')
      .eq('id', agent.id)
      .single();
    const currentFeatures = (freshAgent?.features ?? agent.features ?? {}) as Record<string, any>;
    const currentAuto     = (currentFeatures.automations ?? {}) as Record<string, any>;
    const currentEntry    = (currentAuto.weekly_insights ?? {}) as Record<string, any>;

    await supabase
      .from('voice_agents')
      .update({
        features: {
          ...currentFeatures,
          automations: {
            ...currentAuto,
            weekly_insights: {
              ...currentEntry,
              enabled: true,
              last_ran_at: new Date().toISOString(),
            },
          },
        },
      })
      .eq('id', agent.id);
  }

  await releaseCronRun(supabase, 'weekly-insights');
  return NextResponse.json({ ok: true, weekStart, totalRecs });
}
