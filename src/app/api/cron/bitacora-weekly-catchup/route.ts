export const dynamic = 'force-dynamic';

/**
 * Safety-net dominical del envío semanal de bitácora.
 *
 * El cron principal `/api/cron/bitacora-weekly` matchea `cfg.day_of_week` en
 * una ventana de 5h. Con miss-rate observado de Vercel cron hourly ~25% la
 * probabilidad de que TODOS los 5 slots se caigan es ~0.1%. Este catchup
 * corre 3 veces el DÍA SIGUIENTE al `day_of_week` configurado y dispara el
 * envío pendiente si no hay row en `bitacora_weekly_deliveries` para la
 * semana Lun-Dom que acaba de terminar. Miss-rate combinado sábado+domingo:
 * 0.25^5 × 0.25^3 ≈ 0.0001% (~1 en 1 millón).
 *
 * currentDate simulado = el sábado de esa semana a las 14 MX, para que
 * `runPersistentFlow` calcule `weekdaysInMonthUpTo` e `isLastWeekdayOfMonth`
 * como habría hecho el envío original.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { nowInMX, weekStartMonday } from '@/lib/bitacora/schedule';
import {
  runPersistentFlow,
  runEphemeralFlow,
  isEligibleForCatchup,
  calcOriginalSendDate,
  type BitacoraConfig,
  type TemplateConfig,
} from '@/lib/bitacora/weekly-flow';

interface AgentRow {
  id:                     string;
  agent_name:             string | null;
  business_name:          string | null;
  portal_email:           string | null;
  email_from:             string | null;
  email_domain_verified:  boolean | null;
  bitacora_weekly_config: BitacoraConfig | null;
  bitacora_template:      TemplateConfig | null;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const mx = nowInMX();

  const { data: agentsRaw, error: agentsErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, email_from, email_domain_verified, bitacora_weekly_config, bitacora_template')
    .eq('active', true)
    .not('bitacora_weekly_config', 'is', null);

  if (agentsErr) {
    console.error('[bitacora-weekly-catchup] agents query failed:', agentsErr);
    return NextResponse.json({ error: 'agents query failed' }, { status: 500 });
  }
  const agents = (agentsRaw ?? []) as AgentRow[];

  const eligible = agents.filter(a => isEligibleForCatchup(a.bitacora_weekly_config, mx.dayOfWeek));

  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, dayOfWeek: mx.dayOfWeek });
  }

  const portalEmails = [...new Set(eligible.map(a => a.portal_email as string))];
  const { data: orgs } = await supabase
    .from('organizations')
    .select('portal_email, incidencia_flow_enabled')
    .in('portal_email', portalEmails);
  const enabledOrgs = new Set((orgs ?? []).filter(o => o.incidencia_flow_enabled).map(o => o.portal_email));

  const results: Array<{ agent_id: string; ok: boolean; mode: string; error?: string; week_start?: string }> = [];

  for (const agent of eligible) {
    const cfg = agent.bitacora_weekly_config as BitacoraConfig;
    const agentId = agent.id;

    if (!enabledOrgs.has(agent.portal_email as string)) {
      results.push({ agent_id: agentId, ok: false, mode: 'skip', error: 'incidencia_flow_disabled_at_org' });
      continue;
    }

    const originalSendDate = calcOriginalSendDate(mx.date, mx.dayOfWeek, cfg);
    const monday = weekStartMonday(originalSendDate);
    const weekStartDate = monday.toISOString().slice(0, 10);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    const { data: prior } = await supabase
      .from('bitacora_weekly_deliveries')
      .select('id')
      .eq('agent_id', agentId)
      .eq('week_start', weekStartDate)
      .maybeSingle();
    if (prior) {
      results.push({ agent_id: agentId, ok: false, mode: 'skip', error: 'already_sent_this_week', week_start: weekStartDate });
      continue;
    }

    console.warn('[bitacora-weekly-catchup] triggering catchup for missed send', {
      agent_id:   agentId,
      week_start: weekStartDate,
      recipients: cfg.recipients,
    });

    const template = agent.bitacora_template;
    const usePersistent = !!(template?.url && template.mapping);

    try {
      const result = usePersistent
        ? await runPersistentFlow(supabase, agent as unknown as Record<string, unknown>, cfg, template!, originalSendDate)
        : await runEphemeralFlow(supabase, agent as unknown as Record<string, unknown>, cfg, monday, nextMonday, originalSendDate);

      if (result.ok) {
        await supabase.from('bitacora_weekly_deliveries').insert({
          agent_id:         agentId,
          week_start:       weekStartDate,
          recipients:       cfg.recipients,
          included_monthly: result.isMonthlyFinal,
        });
      }
      results.push({ agent_id: agentId, ok: result.ok, mode: usePersistent ? 'persistent' : 'ephemeral', week_start: weekStartDate });
    } catch (err) {
      console.error('[bitacora-weekly-catchup] agent flow threw:', agentId, err);
      results.push({ agent_id: agentId, ok: false, mode: usePersistent ? 'persistent' : 'ephemeral', error: (err as Error).message, week_start: weekStartDate });
    }
  }

  return NextResponse.json({ ok: true, matched: eligible.length, results });
}
