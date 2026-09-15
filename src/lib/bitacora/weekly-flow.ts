import type { SupabaseClient } from '@supabase/supabase-js';
import { sendMeerkatHtmlEmail } from '@/lib/email/send-as-agent';
import { buildBitacoraExcelForAgent, sanitizeBusinessName } from '@/lib/bitacora/build-excel';
import { updateLiveWorkbook, type WeekSpec } from '@/lib/bitacora/live-workbook';
import type { IncidentRow } from '@/app/portal/[token]/oficina/bitacora/loadBitacoraData';
import type { TemplateMapping } from '@/lib/bitacora/template-analyzer';
import { isLastWeekdayOfMonth, weekStartMonday, monthStart, weekNumberInMonth, weekdaysInMonthUpTo } from '@/lib/bitacora/schedule';
import { consumeAiOp } from '@/lib/ai/ops-guard';

export interface BitacoraConfig {
  enabled:                       boolean;
  day_of_week:                   number;
  hour:                          number;
  recipients:                    string[];
  include_monthly_last_saturday: boolean;
}

export interface TemplateConfig {
  url:      string;
  mapping:  TemplateMapping;
  [k: string]: unknown;
}

const DAY_LABELS_ES = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function formatWeekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  return sameMonth
    ? `${monday.getDate()}-${sunday.getDate()} de ${MONTHS_ES[monday.getMonth()]} ${sunday.getFullYear()}`
    : `${monday.getDate()} ${MONTHS_ES[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_ES[sunday.getMonth()]} ${sunday.getFullYear()}`;
}

export function renderEmailHtml(businessName: string, agentName: string, periodLabel: string, isMonthlyFinal: boolean, deliveryDayLabel: string): string {
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

export { DAY_LABELS_ES, MONTHS_ES };

/**
 * Retorna true si el cron `bitacora-weekly` debe enviar la bitácora del
 * agente en el slot actual (MX). Ventana de reintento de 5 horas
 * (`cfg.hour..cfg.hour+4`) para tolerar el ~25% miss-rate de Vercel cron
 * hourly (ver commit b4b67730). La idempotencia por (agent_id, week_start)
 * impide duplicados si más de un slot corre exitosamente.
 *
 * Puro: fácil de testear sin DB.
 */
export function shouldSendBitacoraNow(
  cfg:       BitacoraConfig | null,
  dayOfWeek: number,
  hour:      number,
): boolean {
  if (!cfg?.enabled) return false;
  if ((cfg.recipients ?? []).length === 0) return false;
  if (cfg.day_of_week !== dayOfWeek) return false;
  return hour >= cfg.hour && hour <= cfg.hour + 4;
}

/**
 * Retorna true si el cron `bitacora-weekly-catchup` debe considerar este
 * agente hoy. Corre 1-2 días DESPUÉS del `cfg.day_of_week` para dar el
 * "safety-net" cuando los 5 slots del envío principal fallaron.
 *
 * daysSinceCfgDay=0 → hoy es el día de envío principal (skip; lo maneja el
 * cron principal). daysSinceCfgDay=1 o 2 → catchup activo. >2 → ya pasó
 * demasiado, no reintentamos (la semana siguiente tiene su propia ventana).
 *
 * Puro: fácil de testear sin DB.
 */
export function isEligibleForCatchup(
  cfg:       BitacoraConfig | null,
  dayOfWeek: number,
): boolean {
  if (!cfg?.enabled) return false;
  if ((cfg.recipients ?? []).length === 0) return false;
  const daysSince = (dayOfWeek - cfg.day_of_week + 7) % 7;
  return daysSince >= 1 && daysSince <= 2;
}

/**
 * Calcula la fecha original en la que el envío debió ocurrir. Se usa como
 * `currentDate` simulado en `runPersistentFlow` para que
 * `weekdaysInMonthUpTo` e `isLastWeekdayOfMonth` calculen igual que en el
 * envío original perdido.
 *
 * Ejemplo: si hoy es domingo (dow=0) y cfg.day_of_week=6 (sábado),
 * daysSince=1, entonces originalSendDate = ayer a las cfg.hour MX.
 *
 * Puro: fácil de testear sin DB.
 */
export function calcOriginalSendDate(
  now:      Date,
  dowToday: number,
  cfg:      Pick<BitacoraConfig, 'day_of_week' | 'hour'>,
): Date {
  const daysSince = (dowToday - cfg.day_of_week + 7) % 7;
  const original = new Date(now);
  original.setDate(original.getDate() - daysSince);
  original.setHours(cfg.hour, 0, 0, 0);
  return original;
}

export async function runEphemeralFlow(
  supabase:    SupabaseClient,
  agent:       Record<string, unknown>,
  cfg:         BitacoraConfig,
  monday:      Date,
  nextMonday:  Date,
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

export async function runPersistentFlow(
  supabase:    SupabaseClient,
  agent:       Record<string, unknown>,
  cfg:         BitacoraConfig,
  template:    TemplateConfig,
  currentDate: Date,
): Promise<{ ok: boolean; isMonthlyFinal: boolean }> {
  const agentId = agent.id as string;
  const portalEmail = agent.portal_email as string;

  const mStart = monthStart(currentDate);
  const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
  const livePath = `${portalEmail}/${agentId}/${monthKey}.xlsx`;

  const { data: tplData, error: tplErr } = await supabase.storage
    .from('bitacora-templates')
    .download(template.url);
  if (tplErr || !tplData) throw new Error(`template download failed: ${tplErr?.message ?? 'no data'}`);
  const templateBuffer = Buffer.from(await tplData.arrayBuffer());

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

  const liveBuf = await updateLiveWorkbook({
    supabase,
    templateBuffer,
    livePath,
    mapping: template.mapping,
    weeks,
  });

  const { error: uploadErr } = await supabase.storage
    .from('bitacora-live')
    .upload(livePath, liveBuf, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert:      true,
    });
  if (uploadErr) throw new Error(`live upload failed: ${uploadErr.message}`);

  const isMonthlyFinal = cfg.include_monthly_last_saturday && isLastWeekdayOfMonth(currentDate, cfg.day_of_week);
  const monthLabel = `${MONTHS_ES[mStart.getMonth()]} ${mStart.getFullYear()}`;
  const weekLabel = formatWeekLabel(weekStartMonday(currentDate));
  const periodLabel = isMonthlyFinal ? `${monthLabel} (mes completo)` : `${weekLabel} · ${monthLabel} en curso`;
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
      await consumeAiOp(agentId, 1, {
        source: isMonthlyFinal ? 'bitacora_mensual_send' : 'bitacora_semanal_send',
        label:  isMonthlyFinal ? 'Bitácora mensual enviada por correo' : 'Bitácora semanal enviada por correo',
      });
    }
  }

  return { ok, isMonthlyFinal };
}
