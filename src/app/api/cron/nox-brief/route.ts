export const dynamic = 'force-dynamic';
// Frecuencia: "0 * * * *" (cada hora, filtra por hora local del agente internamente)

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeAiOp } from '@/lib/ai/ops-guard';
import { maybeSendQuotaEmail } from '@/lib/ai/quota-email';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';
import { collectBriefData } from '@/lib/nox/brief-collector';
import { renderBrief } from '@/lib/nox/brief-renderer';
import { deliverBrief } from '@/lib/nox/brief-deliverer';

interface BriefConfig {
  enabled:  boolean;
  hour:     number;
  channels: { email: boolean; whatsapp: boolean; portal: boolean };
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const claim = await claimCronRun(supabase, 'nox-brief', 45 * 60 * 1000);
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });
  const now      = new Date();

  const { data: noxAgents, error } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, transfer_whatsapp, portal_email, timezone, brief_del_dia_config, brief_del_dia_last_run_at, features, ai_ops_used, ai_ops_limit, minutes_reset_date, portal_token')
    .eq('active', true)
    .not('brief_del_dia_config', 'is', null);

  if (error) {
    console.error('[cron/nox-brief] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!noxAgents?.length) return NextResponse.json({ ok: true, ran: 0 });

  let ran = 0;

  for (const agent of noxAgents) {
    // Solo Nox ejecuta el brief del dia
    const meerkatId = (agent.features as { meerkat_role_id?: string } | null)?.meerkat_role_id;
    if (meerkatId !== 'nox') continue;

    const cfg = agent.brief_del_dia_config as BriefConfig | null;
    if (!cfg?.enabled) continue;

    // Filtro por hora local del agente
    const tz        = (agent.timezone as string | null) ?? 'America/Monterrey';
    const localNow  = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    const localHour = localNow.getHours();
    if (localHour !== cfg.hour) continue;

    // Dedup: no correr dos veces el mismo dia (hora local)
    const lastRunRaw = agent.brief_del_dia_last_run_at as string | null;
    if (lastRunRaw) {
      const lastLocal = new Date(new Date(lastRunRaw).toLocaleString('en-US', { timeZone: tz }));
      const sameDay   =
        lastLocal.getFullYear() === localNow.getFullYear() &&
        lastLocal.getMonth()    === localNow.getMonth()    &&
        lastLocal.getDate()     === localNow.getDate();
      if (sameDay) continue;
    }

    // Obtener todos los agentes del org para queries cross-agente en el collector
    const { data: orgAgents } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_email', agent.portal_email as string);
    const orgAgentIds = (orgAgents ?? []).map((a: { id: string }) => a.id);

    // Leer knowledge_base desde organizations, NO desde voice_agents (dropped column)
    const { data: org } = await supabase
      .from('organizations')
      .select('knowledge_base, owner_name')
      .eq('portal_email', agent.portal_email as string)
      .maybeSingle();

    // Probe primero: si no hay data, no cobrar ni correr LLM. Marca como
    // "corrido hoy" para no re-intentar cada hora del cron. Fix 2026-08-10.
    const data = await collectBriefData(orgAgentIds, agent.portal_email as string, tz, supabase);
    const totalItems =
      data.urgentEmails.items.length +
      data.upcomingEvents.items.length +
      data.pendingTasks.items.length +
      data.unresolvedEscalations.items.length +
      data.pendingContractDrafts.items.length;
    if (totalItems === 0) {
      await supabase.from('voice_agents')
        .update({ brief_del_dia_last_run_at: now.toISOString() })
        .eq('id', agent.id as string);
      continue;
    }

    // Consumir 5 ops; si se agotaron, avisar por email y continuar al siguiente agente
    const opsResult = await consumeAiOp(agent.id as string, 5, { source: 'nox_brief', label: 'Brief del día generado por Nox' });
    if (!opsResult.ok) {
      await maybeSendQuotaEmail(
        {
          id:                 agent.id as string,
          client_email:       (agent.client_email as string | null) ?? null,
          agent_name:         (agent.agent_name as string | null) ?? null,
          business_name:      (agent.business_name as string | null) ?? null,
          ai_ops_used:        (agent.ai_ops_used as number) ?? 0,
          ai_ops_limit:       (agent.ai_ops_limit as number) ?? 0,
          minutes_reset_date: (agent.minutes_reset_date as string | null) ?? null,
          portal_token:       (agent.portal_token as string | null) ?? null,
          features:           (agent.features as Record<string, unknown> | null) ?? null,
        },
        'brief_del_dia',
      );
      continue;
    }

    try {
      // `data` ya se computó arriba en el probe — reutilizar.
      const brief = await renderBrief(data, {
        agentName:    (agent.agent_name as string | null) ?? 'Nox',
        businessName: (agent.business_name as string) ?? '',
        tz,
        ownerName:    ((org?.owner_name as string | null) ?? null),
        kbSnippet:    ((org?.knowledge_base as string | null) ?? '').slice(0, 800) || null,
      });

      await deliverBrief(
        brief,
        {
          id:                agent.id as string,
          agent_name:        (agent.agent_name as string | null) ?? null,
          business_name:     (agent.business_name as string) ?? '',
          client_email:      (agent.client_email as string | null) ?? null,
          transfer_whatsapp: (agent.transfer_whatsapp as string | null) ?? null,
          portal_email:      agent.portal_email as string,
          timezone:          (agent.timezone as string | null) ?? null,
        },
        cfg.channels,
        'cron',
        supabase,
      );

      // Marcar como corrido hoy
      await supabase
        .from('voice_agents')
        .update({ brief_del_dia_last_run_at: now.toISOString() })
        .eq('id', agent.id as string);

      ran++;
    } catch (err) {
      console.error('[cron/nox-brief] agente fallido:', agent.id, err);
    }
  }

  await releaseCronRun(supabase, 'nox-brief');
  return NextResponse.json({ ok: true, ran });
}
