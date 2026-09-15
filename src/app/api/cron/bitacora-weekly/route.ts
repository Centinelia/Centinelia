export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { nowInMX, weekStartMonday } from '@/lib/bitacora/schedule';
import {
  runPersistentFlow,
  runEphemeralFlow,
  type BitacoraConfig,
  type TemplateConfig,
} from '@/lib/bitacora/weekly-flow';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const mx = nowInMX();

  const { data: agents, error: agentsErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, email_from, email_domain_verified, bitacora_weekly_config, bitacora_template')
    .eq('active', true)
    .not('bitacora_weekly_config', 'is', null);

  if (agentsErr) {
    console.error('[bitacora-weekly] agents query failed:', agentsErr);
    return NextResponse.json({ error: 'agents query failed' }, { status: 500 });
  }

  // Ventana de reintento: matcheamos el día correcto y cualquier hora entre
  // `cfg.hour` y `cfg.hour + 4` (5 slots). Vercel cron miss-rate ronda 25%;
  // con 5 chances por semana la probabilidad de perder toda la ventana es
  // <0.1%. La idempotencia por (agent_id, week_start) en
  // `bitacora_weekly_deliveries` impide duplicados si más de un slot corre
  // exitosamente.
  const matching = (agents ?? []).filter(a => {
    const cfg = a.bitacora_weekly_config as BitacoraConfig | null;
    if (!cfg?.enabled) return false;
    if ((cfg.recipients ?? []).length === 0) return false;
    if (cfg.day_of_week !== mx.dayOfWeek) return false;
    return mx.hour >= cfg.hour && mx.hour <= cfg.hour + 4;
  });

  if (matching.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, hour: mx.hour, day: mx.dayOfWeek });
  }

  const portalEmails = [...new Set(matching.map(a => a.portal_email as string))];
  const { data: orgs } = await supabase
    .from('organizations')
    .select('portal_email, incidencia_flow_enabled')
    .in('portal_email', portalEmails);
  const enabledOrgs = new Set((orgs ?? []).filter(o => o.incidencia_flow_enabled).map(o => o.portal_email));

  const monday = weekStartMonday(mx.date);
  const weekStartDate = monday.toISOString().slice(0, 10);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  const results: Array<{ agent_id: string; ok: boolean; mode: string; error?: string }> = [];

  for (const agent of matching) {
    const cfg = agent.bitacora_weekly_config as BitacoraConfig;
    const agentId = agent.id as string;

    if (!enabledOrgs.has(agent.portal_email as string)) {
      results.push({ agent_id: agentId, ok: false, mode: 'skip', error: 'incidencia_flow_disabled_at_org' });
      continue;
    }

    // Idempotencia per-agent+week
    const { data: prior } = await supabase
      .from('bitacora_weekly_deliveries')
      .select('id')
      .eq('agent_id', agentId)
      .eq('week_start', weekStartDate)
      .maybeSingle();
    if (prior) {
      results.push({ agent_id: agentId, ok: false, mode: 'skip', error: 'already_sent_this_week' });
      continue;
    }

    const template = agent.bitacora_template as TemplateConfig | null;
    const usePersistent = !!(template?.url && template.mapping);

    try {
      const result = usePersistent
        ? await runPersistentFlow(supabase, agent, cfg, template!, mx.date)
        : await runEphemeralFlow(supabase, agent, cfg, monday, nextMonday, mx.date);

      if (result.ok) {
        await supabase.from('bitacora_weekly_deliveries').insert({
          agent_id:         agentId,
          week_start:       weekStartDate,
          recipients:       cfg.recipients,
          included_monthly: result.isMonthlyFinal,
        });
      }
      results.push({ agent_id: agentId, ok: result.ok, mode: usePersistent ? 'persistent' : 'ephemeral' });
    } catch (err) {
      console.error('[bitacora-weekly] agent flow threw:', agentId, err);
      results.push({ agent_id: agentId, ok: false, mode: usePersistent ? 'persistent' : 'ephemeral', error: (err as Error).message });
    }
  }

  return NextResponse.json({ ok: true, matched: matching.length, results });
}
