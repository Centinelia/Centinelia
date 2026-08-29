export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { buildBitacoraExcelForOrg, sanitizeBusinessName } from '@/lib/bitacora/build-excel';
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

function renderEmailHtml(businessName: string, periodLabel: string, isMonthly: boolean): string {
  const heading = isMonthly ? 'Bitácora mensual' : 'Bitácora semanal';
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p style="margin: 0 0 16px 0; color: #333;">
    Aquí está la <strong>${heading}</strong> de <strong>${businessName}</strong> del periodo <strong>${periodLabel}</strong>.
  </p>
  <p style="margin: 0 0 16px 0; color: #333;">
    El archivo adjunto contiene todas las incidencias y altas de clientes registradas${isMonthly ? ' durante el mes' : ' esta semana'}, con seguimiento por día.
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

  // Query orgs cuya config matchee day+hour actual MX.
  // JSONB filter en Supabase JS: usamos rpc-less pattern con contains/eq
  // sobre paths dentro del JSON.
  const { data: orgs, error: orgsErr } = await supabase
    .from('organizations')
    .select('portal_email, bitacora_weekly_config, incidencia_flow_enabled')
    .eq('incidencia_flow_enabled', true);

  if (orgsErr) {
    console.error('[bitacora-weekly] orgs query failed:', orgsErr);
    return NextResponse.json({ error: 'orgs query failed' }, { status: 500 });
  }

  const matching = (orgs ?? []).filter(o => {
    const cfg = o.bitacora_weekly_config as BitacoraConfig | null;
    if (!cfg?.enabled) return false;
    if ((cfg.recipients ?? []).length === 0) return false;
    return cfg.day_of_week === mx.dayOfWeek && cfg.hour === mx.hour;
  });

  if (matching.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, hour: mx.hour, day: mx.dayOfWeek });
  }

  const monday = weekStartMonday(mx.date);
  const results: Array<{ portal_email: string; weekly: boolean; monthly: boolean; error?: string }> = [];

  for (const org of matching) {
    const cfg = org.bitacora_weekly_config as BitacoraConfig;
    const portalEmail = org.portal_email as string;

    // Idempotencia: si ya se envió esta semana, skip.
    const weekStartDate = monday.toISOString().slice(0, 10);
    const { data: prior } = await supabase
      .from('bitacora_weekly_deliveries')
      .select('id')
      .eq('portal_email', portalEmail)
      .eq('week_start', weekStartDate)
      .maybeSingle();
    if (prior) {
      results.push({ portal_email: portalEmail, weekly: false, monthly: false, error: 'already_sent_this_week' });
      continue;
    }

    // Cargar agent + incidencias directamente (sin loadBitacoraData porque
    // ese helper resuelve por token; aquí ya tenemos portal_email).
    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id, agent_name, business_name, email_from, email_domain_verified')
      .eq('portal_email', portalEmail)
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!agent) {
      results.push({ portal_email: portalEmail, weekly: false, monthly: false, error: 'no_active_agent' });
      continue;
    }

    const { data: agentRows } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_email', portalEmail)
      .eq('active', true);
    const agentIds = (agentRows ?? []).map((a: any) => a.id);

    // Weekly
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);
    const { data: weekIncidents } = await supabase
      .from('client_incidents')
      .select('*')
      .in('agent_id', agentIds)
      .gte('created_at', monday.toISOString())
      .lt('created_at', nextMonday.toISOString())
      .order('created_at', { ascending: true });

    const weeklyBuf = await buildBitacoraExcelForOrg(supabase, portalEmail, {
      incidents:     (weekIncidents ?? []) as IncidentRow[],
      businessName:  agent.business_name,
      rangeStartISO: monday.toISOString(),
      mode:          'weekly',
    });
    const weeklyFilename = `bitacora-${sanitizeBusinessName(agent.business_name)}-${weekStartDate}.xlsx`;
    const weekLabel      = formatWeekLabel(monday);

    let weeklyOk = false;
    let monthlyOk = false;
    let monthlySent = false;

    for (const to of cfg.recipients) {
      const res = await sendMeerkatHtmlEmail({
        agentId: agent.id,
        to,
        subject: `Bitácora semanal — ${agent.business_name} (${weekLabel})`,
        html:    renderEmailHtml(agent.business_name, weekLabel, false),
        attachment: { filename: weeklyFilename, content: weeklyBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        agent: {
          agent_name:            agent.agent_name,
          business_name:         agent.business_name,
          email_from:            agent.email_from,
          email_domain_verified: agent.email_domain_verified,
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
        .in('agent_id', agentIds)
        .gte('created_at', mStart.toISOString())
        .lt('created_at', mEnd.toISOString())
        .order('created_at', { ascending: true });

      const monthlyBuf = await buildBitacoraExcelForOrg(supabase, portalEmail, {
        incidents:     (monthIncidents ?? []) as IncidentRow[],
        businessName:  agent.business_name,
        rangeStartISO: mStart.toISOString(),
        mode:          'monthly',
      });
      const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
      const monthlyFilename = `bitacora-${sanitizeBusinessName(agent.business_name)}-${monthKey}.xlsx`;
      const monthLabel = `${MONTHS_ES[mStart.getMonth()]} ${mStart.getFullYear()}`;

      for (const to of cfg.recipients) {
        const res = await sendMeerkatHtmlEmail({
          agentId: agent.id,
          to,
          subject: `Bitácora mensual — ${agent.business_name} (${monthLabel})`,
          html:    renderEmailHtml(agent.business_name, monthLabel, true),
          attachment: { filename: monthlyFilename, content: monthlyBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          agent: {
            agent_name:            agent.agent_name,
            business_name:         agent.business_name,
            email_from:            agent.email_from,
            email_domain_verified: agent.email_domain_verified,
          },
        }, supabase);
        if (res.ok) monthlyOk = true;
      }
      monthlySent = monthlyOk;
    }

    // Marcar como enviado (idempotencia). Solo si weekly llegó.
    if (weeklyOk) {
      await supabase.from('bitacora_weekly_deliveries').insert({
        portal_email:     portalEmail,
        week_start:       weekStartDate,
        recipients:       cfg.recipients,
        included_monthly: monthlySent,
      });
    }

    results.push({ portal_email: portalEmail, weekly: weeklyOk, monthly: monthlySent });
  }

  return NextResponse.json({ ok: true, matched: matching.length, results });
}
