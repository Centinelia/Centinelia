export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { buildBitacoraExcelForAgent, sanitizeBusinessName } from '@/lib/bitacora/build-excel';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import { nowInMX, isLastSaturdayOfMonth, weekStartMonday, monthStart } from '@/lib/bitacora/schedule';

interface BitacoraConfig {
  enabled:                       boolean;
  day_of_week:                   number;
  hour:                          number;
  recipients:                    string[];
  include_monthly_last_saturday: boolean;
}

const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const mDay = monday.getDate();
  const sDay = sunday.getDate();
  const mMon = MONTHS_ES[monday.getMonth()];
  const sMon = MONTHS_ES[sunday.getMonth()];
  const year = sunday.getFullYear();
  return sameMonth ? `${mDay}-${sDay} de ${mMon} ${year}` : `${mDay} ${mMon} – ${sDay} ${sMon} ${year}`;
}

function renderEmailHtml(businessName: string, agentName: string, periodLabel: string, isMonthly: boolean): string {
  const heading = isMonthly ? 'Bitácora mensual' : 'Bitácora semanal';
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p style="margin: 0 0 16px 0; color: #333;">
    Aquí está la <strong>${heading}</strong> de <strong>${agentName}</strong> (${businessName}) del periodo <strong>${periodLabel}</strong>.
  </p>
  <p style="margin: 0 0 16px 0; color: #333;">
    El archivo adjunto contiene todos los registros capturados${isMonthly ? ' durante el mes' : ' esta semana'}.
  </p>
  <p style="margin: 16px 0 0 0; color: #666; font-size: 13px;">
    Reporte generado automáticamente. Cualquier duda, responde este correo.
  </p>
</div>`.trim();
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const mx = nowInMX();

  // Query agents con bitacora_weekly_config activa cuya day+hour matchee la
  // hora MX actual. El pool bitácora vive en organizations.incidencia_flow_enabled
  // (feature gate del flow completo); si el org no lo tiene enabled, skip.
  const { data: agents, error: agentsErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, email_from, email_domain_verified, bitacora_weekly_config')
    .eq('active', true)
    .not('bitacora_weekly_config', 'is', null);

  if (agentsErr) {
    console.error('[bitacora-weekly] agents query failed:', agentsErr);
    return NextResponse.json({ error: 'agents query failed' }, { status: 500 });
  }

  const matching = (agents ?? []).filter(a => {
    const cfg = a.bitacora_weekly_config as BitacoraConfig | null;
    if (!cfg?.enabled) return false;
    if ((cfg.recipients ?? []).length === 0) return false;
    return cfg.day_of_week === mx.dayOfWeek && cfg.hour === mx.hour;
  });

  if (matching.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, hour: mx.hour, day: mx.dayOfWeek });
  }

  // Filtrar solo agents cuya org tenga incidencia_flow_enabled
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

  const results: Array<{ agent_id: string; weekly: boolean; monthly: boolean; error?: string }> = [];

  for (const agent of matching) {
    const cfg = agent.bitacora_weekly_config as BitacoraConfig;
    const agentId = agent.id as string;

    if (!enabledOrgs.has(agent.portal_email as string)) {
      results.push({ agent_id: agentId, weekly: false, monthly: false, error: 'incidencia_flow_disabled_at_org' });
      continue;
    }

    // Idempotencia per-agent: si ya se envió esta semana para este agente, skip.
    const { data: prior } = await supabase
      .from('bitacora_weekly_deliveries')
      .select('id')
      .eq('agent_id', agentId)
      .eq('week_start', weekStartDate)
      .maybeSingle();
    if (prior) {
      results.push({ agent_id: agentId, weekly: false, monthly: false, error: 'already_sent_this_week' });
      continue;
    }

    // Cargar incidencias del scope del agente. Multi-agente por org: agrupar
    // todos los agent_ids del portal (los distintos empleados) sería mezclar
    // bitácoras. La bitácora es de ESTE agente específico — filtramos por su id.
    const { data: weekIncidents } = await supabase
      .from('client_incidents')
      .select('*')
      .eq('agent_id', agentId)
      .gte('created_at', monday.toISOString())
      .lt('created_at', nextMonday.toISOString())
      .order('created_at', { ascending: true });

    const weeklyBuf = await buildBitacoraExcelForAgent(supabase, agentId, {
      incidents:     (weekIncidents ?? []) as IncidentRow[],
      businessName:  agent.business_name as string,
      rangeStartISO: monday.toISOString(),
      mode:          'weekly',
    });
    const weeklyFilename = `bitacora-${sanitizeBusinessName(agent.business_name as string)}-${agent.agent_name}-${weekStartDate}.xlsx`;
    const weekLabel      = formatWeekLabel(monday);

    let weeklyOk = false;
    let monthlySent = false;

    for (const to of cfg.recipients) {
      const res = await sendMeerkatHtmlEmail({
        agentId,
        to,
        subject: `Bitácora semanal ${agent.agent_name} — ${agent.business_name} (${weekLabel})`,
        html:    renderEmailHtml(agent.business_name as string, agent.agent_name as string, weekLabel, false),
        attachment: { filename: weeklyFilename, content: weeklyBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        agent: {
          agent_name:            agent.agent_name as string | null,
          business_name:         agent.business_name as string | null,
          email_from:            agent.email_from as string | null,
          email_domain_verified: agent.email_domain_verified as boolean | null,
        },
      }, supabase);
      if (res.ok) weeklyOk = true;
    }

    // Monthly (último sábado del mes)
    const shouldSendMonthly = cfg.include_monthly_last_saturday && isLastSaturdayOfMonth(mx.date);
    if (shouldSendMonthly) {
      const mStart = monthStart(mx.date);
      const mEnd = new Date(mStart);
      mEnd.setMonth(mStart.getMonth() + 1);
      const { data: monthIncidents } = await supabase
        .from('client_incidents')
        .select('*')
        .eq('agent_id', agentId)
        .gte('created_at', mStart.toISOString())
        .lt('created_at', mEnd.toISOString())
        .order('created_at', { ascending: true });

      const monthlyBuf = await buildBitacoraExcelForAgent(supabase, agentId, {
        incidents:     (monthIncidents ?? []) as IncidentRow[],
        businessName:  agent.business_name as string,
        rangeStartISO: mStart.toISOString(),
        mode:          'monthly',
      });
      const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
      const monthlyFilename = `bitacora-${sanitizeBusinessName(agent.business_name as string)}-${agent.agent_name}-${monthKey}.xlsx`;
      const monthLabel = `${MONTHS_ES[mStart.getMonth()]} ${mStart.getFullYear()}`;

      let monthlyOk = false;
      for (const to of cfg.recipients) {
        const res = await sendMeerkatHtmlEmail({
          agentId,
          to,
          subject: `Bitácora mensual ${agent.agent_name} — ${agent.business_name} (${monthLabel})`,
          html:    renderEmailHtml(agent.business_name as string, agent.agent_name as string, monthLabel, true),
          attachment: { filename: monthlyFilename, content: monthlyBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          agent: {
            agent_name:            agent.agent_name as string | null,
            business_name:         agent.business_name as string | null,
            email_from:            agent.email_from as string | null,
            email_domain_verified: agent.email_domain_verified as boolean | null,
          },
        }, supabase);
        if (res.ok) monthlyOk = true;
      }
      monthlySent = monthlyOk;
    }

    if (weeklyOk) {
      await supabase.from('bitacora_weekly_deliveries').insert({
        agent_id:         agentId,
        week_start:       weekStartDate,
        recipients:       cfg.recipients,
        included_monthly: monthlySent,
      });
    }

    results.push({ agent_id: agentId, weekly: weeklyOk, monthly: monthlySent });
  }

  return NextResponse.json({ ok: true, matched: matching.length, results });
}
