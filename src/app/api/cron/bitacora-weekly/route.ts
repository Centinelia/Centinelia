export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { buildBitacoraExcelForAgent, sanitizeBusinessName } from '@/lib/bitacora/build-excel';
import { updateLiveWorkbook, type WeekSpec } from '@/lib/bitacora/live-workbook';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { TemplateMapping } from '@/lib/bitacora/template-analyzer';
import { nowInMX, isLastWeekdayOfMonth, weekStartMonday, monthStart, weekNumberInMonth, weekdaysInMonthUpTo } from '@/lib/bitacora/schedule';
import { consumeAiOp } from '@/lib/ai/ops-guard';

const DAY_LABELS_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

interface BitacoraConfig {
  enabled:                       boolean;
  day_of_week:                   number;
  hour:                          number;
  recipients:                    string[];
  include_monthly_last_saturday: boolean;
}

interface TemplateConfig {
  url:      string;
  mapping:  TemplateMapping;
  [k: string]: unknown;
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

function renderEmailHtml(businessName: string, agentName: string, periodLabel: string, isMonthlyFinal: boolean, deliveryDayLabel: string): string {
  const heading = isMonthlyFinal ? 'Reporte final del mes' : 'Bitácora semanal';
  const bodyExtra = isMonthlyFinal
    ? 'El archivo adjunto contiene todas las hojas semanales del mes completo.'
    : `El archivo adjunto se va actualizando cada ${deliveryDayLabel} con la nueva hoja semanal.`;
  return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <p style="margin: 0 0 16px 0; color: #333;">
    Aquí está la <strong>${heading}</strong> de <strong>${agentName}</strong> (${businessName}) del periodo <strong>${periodLabel}</strong>.
  </p>
  <p style="margin: 0 0 16px 0; color: #333;">
    ${bodyExtra}
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

  const { data: agents, error: agentsErr } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, email_from, email_domain_verified, bitacora_weekly_config, bitacora_template')
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
        ? await runPersistentFlow(supabase, agent, cfg, template!, mx.date, monday, nextMonday)
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

/**
 * Flow original ephemeral: cada envío regenera el archivo desde cero, DB es
 * la única fuente de verdad. Se usa cuando el empleado no tiene template
 * custom (formato default Centinelia).
 */
async function runEphemeralFlow(
  supabase: ReturnType<typeof createAdminClient>,
  agent:    Record<string, unknown>,
  cfg:      BitacoraConfig,
  monday:   Date,
  nextMonday: Date,
  currentDate: Date,
): Promise<{ ok: boolean; isMonthlyFinal: boolean }> {
  const agentId = agent.id as string;

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
  const weekStartStr = monday.toISOString().slice(0, 10);
  const weeklyFilename = `bitacora-${sanitizeBusinessName(agent.business_name as string)}-${agent.agent_name}-${weekStartStr}.xlsx`;
  const weekLabel = formatWeekLabel(monday);

  let ok = false;
  for (const to of cfg.recipients) {
    const res = await sendMeerkatHtmlEmail({
      agentId,
      to,
      subject: `Bitácora semanal ${agent.agent_name} — ${agent.business_name} (${weekLabel})`,
      html:    renderEmailHtml(agent.business_name as string, agent.agent_name as string, weekLabel, false, DAY_LABELS_ES[cfg.day_of_week] ?? 'semana'),
      attachment: { filename: weeklyFilename, content: weeklyBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      agent: {
        agent_name:            agent.agent_name as string | null,
        business_name:         agent.business_name as string | null,
        email_from:            agent.email_from as string | null,
        email_domain_verified: agent.email_domain_verified as boolean | null,
      },
    }, supabase);
    if (res.ok) {
      ok = true;
      await consumeAiOp(agentId, 1, { source: 'bitacora_semanal_send', label: 'Bitácora semanal enviada por correo' });
    }
  }

  let isMonthlyFinal = false;
  const shouldSendMonthly = cfg.include_monthly_last_saturday && isLastWeekdayOfMonth(currentDate, cfg.day_of_week);
  if (shouldSendMonthly) {
    const mStart = monthStart(currentDate);
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

    for (const to of cfg.recipients) {
      const res = await sendMeerkatHtmlEmail({
        agentId,
        to,
        subject: `Bitácora mensual ${agent.agent_name} — ${agent.business_name} (${monthLabel})`,
        html:    renderEmailHtml(agent.business_name as string, agent.agent_name as string, monthLabel, true, DAY_LABELS_ES[cfg.day_of_week] ?? 'semana'),
        attachment: { filename: monthlyFilename, content: monthlyBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        agent: {
          agent_name:            agent.agent_name as string | null,
          business_name:         agent.business_name as string | null,
          email_from:            agent.email_from as string | null,
          email_domain_verified: agent.email_domain_verified as boolean | null,
        },
      }, supabase);
      if (res.ok) {
        isMonthlyFinal = true;
        await consumeAiOp(agentId, 1, { source: 'bitacora_mensual_send', label: 'Bitácora mensual enviada por correo' });
      }
    }
  }

  return { ok, isMonthlyFinal };
}

/**
 * Flow persistente: cliente subió plantilla custom. Un archivo por mes/empleado
 * vive en bucket bitacora-live con N hojas semanales acumulativas. Cada sábado
 * agregamos/actualizamos la hoja de la semana actual y re-generamos las
 * semanas previas del mes (preservando ediciones humanas en cols human_only).
 * El correo lleva ese archivo cada semana; el mismo archivo se manda como
 * reporte final del mes en el último sábado.
 */
async function runPersistentFlow(
  supabase:    ReturnType<typeof createAdminClient>,
  agent:       Record<string, unknown>,
  cfg:         BitacoraConfig,
  template:    TemplateConfig,
  currentDate: Date,
  _monday:     Date,
  _nextMonday: Date,
): Promise<{ ok: boolean; isMonthlyFinal: boolean }> {
  const agentId = agent.id as string;
  const portalEmail = agent.portal_email as string;

  const mStart = monthStart(currentDate);
  const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
  const livePath = `${portalEmail}/${agentId}/${monthKey}.xlsx`;

  // Descargar template desde bucket bitacora-templates
  const { data: tplData, error: tplErr } = await supabase.storage
    .from('bitacora-templates')
    .download(template.url);
  if (tplErr || !tplData) throw new Error(`template download failed: ${tplErr?.message ?? 'no data'}`);
  const templateBuffer = Buffer.from(await tplData.arrayBuffer());

  // Build weeks: cada día-de-envío del mes hasta hoy → una semana
  const deliveryDates = weekdaysInMonthUpTo(currentDate, cfg.day_of_week);
  const weeks: WeekSpec[] = [];
  for (const sat of deliveryDates) {
    const weekMonday = weekStartMonday(sat);
    const weekEnd = new Date(weekMonday);
    weekEnd.setDate(weekMonday.getDate() + 7);
    const { data: weekIncidents } = await supabase
      .from('client_incidents')
      .select('*')
      .eq('agent_id', agentId)
      .gte('created_at', weekMonday.toISOString())
      .lt('created_at', weekEnd.toISOString())
      .order('created_at', { ascending: true });
    weeks.push({
      weekNumber: weekNumberInMonth(sat),
      weekStart:  weekMonday,
      weekEnd,
      incidents:  (weekIncidents ?? []) as IncidentRow[],
    });
  }

  // Generar el archivo persistente actualizado
  const liveBuf = await updateLiveWorkbook({
    supabase,
    templateBuffer,
    livePath,
    mapping: template.mapping,
    weeks,
  });

  // Guardar en storage (upsert)
  const { error: uploadErr } = await supabase.storage
    .from('bitacora-live')
    .upload(livePath, liveBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (uploadErr) throw new Error(`live upload failed: ${uploadErr.message}`);

  // Enviar por correo
  const isMonthlyFinal = cfg.include_monthly_last_saturday && isLastWeekdayOfMonth(currentDate, cfg.day_of_week);
  const monthLabel = `${MONTHS_ES[mStart.getMonth()]} ${mStart.getFullYear()}`;
  const weekLabel = formatWeekLabel(weekStartMonday(currentDate));
  const periodLabel = isMonthlyFinal
    ? `${monthLabel} (mes completo)`
    : `${weekLabel} · ${monthLabel} en curso`;
  const subject = isMonthlyFinal
    ? `Reporte final del mes ${agent.agent_name} — ${agent.business_name} (${monthLabel})`
    : `Bitácora semanal ${agent.agent_name} — ${agent.business_name} (${weekLabel})`;
  const filename = `bitacora-${sanitizeBusinessName(agent.business_name as string)}-${agent.agent_name}-${monthKey}.xlsx`;

  let ok = false;
  for (const to of cfg.recipients) {
    const res = await sendMeerkatHtmlEmail({
      agentId,
      to,
      subject,
      html: renderEmailHtml(agent.business_name as string, agent.agent_name as string, periodLabel, isMonthlyFinal, DAY_LABELS_ES[cfg.day_of_week] ?? 'semana'),
      attachment: { filename, content: liveBuf, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      agent: {
        agent_name:            agent.agent_name as string | null,
        business_name:         agent.business_name as string | null,
        email_from:            agent.email_from as string | null,
        email_domain_verified: agent.email_domain_verified as boolean | null,
      },
    }, supabase);
    if (res.ok) {
      ok = true;
      // Path persistente: distinguir semanal vs mensual final por el flag.
      await consumeAiOp(agentId, 1, {
        source: isMonthlyFinal ? 'bitacora_mensual_send' : 'bitacora_semanal_send',
        label:  isMonthlyFinal ? 'Bitácora mensual enviada por correo' : 'Bitácora semanal enviada por correo',
      });
    }
  }

  return { ok, isMonthlyFinal };
}
