/**
 * Cron: Digest diario de actividad al owner.
 *
 * Recomendación de schedule (vercel.json): cada hora en punto. Para cada
 * organización cuyo horario 'cerró' entre now-70min y now (o que no
 * declaró horario y cae en 8pm hora Monterrey por default), agrupa los
 * notification_events undelivered y envía UN email al client_email.
 *
 * Diseño simple v1:
 * - Corre cada hora, procesa lote de orgs cuya "hora de cierre" cae en la
 *   ventana [now-70min, now-10min] en su timezone.
 * - Fallback timezone: 'America/Monterrey', fallback cierre: 20:00.
 * - Deduplicado: si un owner ya recibió digest en las últimas 20h, skip.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';
import { sendEmail } from '@/lib/email/send';
import { dailyDigestHtml, sectionTitleForKind, summaryForEvent, type DigestSection } from '@/lib/notifications/templates';
import type { NotificationKind } from '@/lib/notifications/queue';
import { getOrgToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

const DEFAULT_TZ         = 'America/Monterrey';
const DEFAULT_CLOSE_HOUR = 20;       // 8pm si no hay business_hours
const DEDUP_HOURS        = 20;       // no enviar dos veces al mismo owner en menos de 20h
const WINDOW_LOOKBACK_H  = 26;       // busca eventos de las últimas 26h (colchón)

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const claim = await claimCronRun(supabase, 'daily-digest', 45 * 60 * 1000);
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });
  const now = new Date();

  // Nash health check (2026-08-24): independiente del propio Nash para
  // romper la circularidad "quién vigila al vigilante". Corre cada hora
  // (frecuencia de este cron) y alerta al owner si Nash lleva >2h sin
  // ejecutar. Dedup 6h para no inundar.
  await checkNashHealth(supabase, now).catch(err =>
    console.error('[daily-digest] Nash health check falló', err),
  );

  // Fetch orgs que quieren notificaciones (al menos un agente con notify_email=true).
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('portal_email, timezone, business_hours, client_email, business_name, agent_name, notify_email, active')
    .eq('active', true)
    .eq('notify_email', true)
    .not('portal_email', 'is', null)
    .not('client_email', 'is', null);

  if (!agents?.length) return NextResponse.json({ ok: true, processed: 0 });

  // Agrupar agentes por portal_email (una org puede tener varios).
  const byOrg = new Map<string, typeof agents>();
  for (const a of agents) {
    const key = a.portal_email as string;
    const arr = byOrg.get(key) ?? [];
    arr.push(a);
    byOrg.set(key, arr);
  }

  let sent    = 0;
  let skipped = 0;

  for (const [portalEmail, orgAgents] of byOrg) {
    const first = orgAgents[0];
    const tz    = (first?.timezone as string | null) ?? DEFAULT_TZ;
    const closeHour = getCloseHourForToday(first?.business_hours, tz) ?? DEFAULT_CLOSE_HOUR;

    // ¿La "hora de cierre" en la tz de esta org cae en la ventana [now-70min, now-10min]?
    const currentHourInTz = getCurrentHourInTz(now, tz);
    const withinWindow    = currentHourInTz >= closeHour && currentHourInTz < closeHour + 2;
    if (!withinWindow) { skipped++; continue; }

    // Dedup: no enviar dos veces al mismo owner en las últimas 20h
    const dedupCutoff = new Date(now.getTime() - DEDUP_HOURS * 3600_000).toISOString();
    const { data: recent } = await supabase
      .from('notification_events')
      .select('id')
      .eq('portal_email', portalEmail)
      .gte('delivered_at', dedupCutoff)
      .not('delivered_at', 'is', null)
      .limit(1);
    // Si hay algún evento entregado en las últimas 20h que NO fue urgente, asumimos
    // que el digest ya corrió. Los urgentes se entregan siempre inmediatos, así
    // que la presencia de un delivered_at reciente no urgente = digest ya enviado.
    if ((recent?.length ?? 0) > 0) {
      // Chequeo más fino: solo skip si el delivered fue por digest (no urgent)
      const { data: nonUrgentDelivered } = await supabase
        .from('notification_events')
        .select('id')
        .eq('portal_email', portalEmail)
        .eq('urgent', false)
        .gte('delivered_at', dedupCutoff)
        .not('delivered_at', 'is', null)
        .limit(1);
      if ((nonUrgentDelivered?.length ?? 0) > 0) { skipped++; continue; }
    }

    // Query eventos undelivered de las últimas 26h para esta org
    const eventsSince = new Date(now.getTime() - WINDOW_LOOKBACK_H * 3600_000).toISOString();
    const { data: events } = await supabase
      .from('notification_events')
      .select('id, agent_id, kind, payload, created_at')
      .eq('portal_email', portalEmail)
      .is('delivered_at', null)
      .gte('created_at', eventsSince)
      .order('created_at', { ascending: true });

    if (!events?.length) { skipped++; continue; }

    // Agrupa por kind para el digest
    const agentNames = new Map(orgAgents.map(a => [String(a as any).replace(/.*/, ''), a] as const));
    const agentById  = new Map<string, string>();
    for (const a of orgAgents) {
      // No tenemos id en el select, solo agent_name — necesitamos otra query si queremos nombre por id
    }
    // Traemos nombres por agent_id (los eventos traen agent_id)
    const uniqueAgentIds = Array.from(new Set(events.map(e => e.agent_id as string).filter(Boolean)));
    if (uniqueAgentIds.length) {
      const { data: agentsById } = await supabase
        .from('voice_agents')
        .select('id, agent_name')
        .in('id', uniqueAgentIds);
      for (const a of agentsById ?? []) {
        agentById.set(a.id as string, (a.agent_name as string) ?? 'Empleado');
      }
    }

    const byKind = new Map<NotificationKind, typeof events>();
    for (const e of events) {
      const k = e.kind as NotificationKind;
      const arr = byKind.get(k) ?? [];
      arr.push(e);
      byKind.set(k, arr);
    }

    const sections: DigestSection[] = [];
    // Orden consistente
    const KIND_ORDER: NotificationKind[] = [
      'call_outcome',
      'outbound_success',
      'email_replied',
      'task_completed',
      'delegation_completed',
      'document_created',
      'survey_completed',
      'dnc_marked',
    ];
    for (const k of KIND_ORDER) {
      const arr = byKind.get(k);
      if (!arr?.length) continue;
      sections.push({
        title: sectionTitleForKind(k),
        count: arr.length,
        items: arr.map(e => ({
          agent:   agentById.get(e.agent_id as string) ?? 'Empleado',
          when:    formatTime(new Date(e.created_at as string), tz),
          summary: summaryForEvent(k, (e.payload as Record<string, unknown>) ?? {}),
        })).slice(0, 25), // cap por sección
      });
    }

    if (!sections.length) { skipped++; continue; }

    // Envía email
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const orgToken = await getOrgToken(portalEmail, supabase);
    let tokenForUrl: string | null = orgToken;
    if (!tokenForUrl) {
      const { data: portalTok } = await supabase
        .from('voice_agents')
        .select('portal_token')
        .eq('portal_email', portalEmail)
        .limit(1)
        .maybeSingle();
      tokenForUrl = (portalTok?.portal_token as string | null) ?? null;
    }
    const portalUrl = tokenForUrl
      ? `${appUrl}/portal/${tokenForUrl}`
      : appUrl;

    try {
      await sendEmail({
        to:      first!.client_email as string,
        subject: `Resumen de hoy — ${first!.business_name}`,
        html:    dailyDigestHtml({
          businessName: first!.business_name as string,
          dateLabel:    formatDate(now, tz),
          sections,
          portalUrl,
        }),
      });
      // Marca todos como delivered
      const ids = events.map(e => e.id as string);
      await supabase
        .from('notification_events')
        .update({ delivered_at: now.toISOString() })
        .in('id', ids);
      sent++;
    } catch (err) {
      console.error('[cron/daily-digest] send failed', portalEmail, err);
    }
  }

  await releaseCronRun(supabase, 'daily-digest');
  return NextResponse.json({ ok: true, processed: byOrg.size, sent, skipped });
}

// ─── Helpers de horario ──────────────────────────────────────────────────────

function getCurrentHourInTz(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', hour12: false,
    }).formatToParts(date);
    const h = parts.find(p => p.type === 'hour')?.value ?? '0';
    return parseInt(h, 10);
  } catch {
    return date.getUTCHours() - 6; // fallback UTC-6 Monterrey
  }
}

function getCloseHourForToday(businessHours: unknown, tz: string): number | null {
  if (!businessHours || typeof businessHours !== 'object') return null;
  try {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })
      .format(new Date()).toLowerCase();
    const key = weekday as keyof typeof businessHours;
    const day = (businessHours as any)[key];
    if (!day || day.closed) return null;
    const close = day.close as string | undefined; // 'HH:MM'
    if (!close) return null;
    const [h] = close.split(':').map(Number);
    return Number.isFinite(h) ? h : null;
  } catch {
    return null;
  }
}

function formatDate(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
    }).format(date);
  } catch {
    return date.toLocaleDateString('es-MX');
  }
}

function formatTime(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleTimeString('es-MX');
  }
}

// ─── Nash health check ────────────────────────────────────────────────────
// Cierra la brecha "quis custodiet ipsos custodes": Nash monitorea toda la
// plataforma, pero nadie monitorea a Nash. Si nash-monitor no corre por
// algún bug de Vercel o del propio código, silent-fail total y nadie se
// entera hasta que un cliente reclama que su bug no se resolvió.
//
// Este check corre desde daily-digest (que sí corre cada hora), lee
// platform_settings.nash_last_run_at, y si lleva >2h stale despacha una
// alerta directa al owner por email (bypass de notification_events para
// evitar depender de la misma tubería que podría estar rota).

const NASH_STALE_THRESHOLD_MS = 2 * 60 * 60_000;   // 2h sin correr = alerta
const NASH_HEALTH_DEDUP_MS    = 6 * 60 * 60_000;   // no re-alertar más de cada 6h
const NASH_HEALTH_ALERT_KEY   = 'nash_health_alert_sent_at';
const NASH_OWNER_EMAIL        = 'hola@centinelia.mx';

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function checkNashHealth(supabase: SupabaseAdmin, now: Date): Promise<void> {
  // 1) Verificar cuándo corrió Nash por última vez
  const { data: lastRunRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'nash_last_run_at')
    .maybeSingle();

  if (!lastRunRow?.value) return; // Nash nunca ha corrido — probablemente disabled, no alertar
  const lastRun = new Date(lastRunRow.value);
  if (!Number.isFinite(lastRun.getTime())) return;

  const staleMs = now.getTime() - lastRun.getTime();
  if (staleMs < NASH_STALE_THRESHOLD_MS) return; // Nash corrió reciente, todo bien

  // 2) Dedup: si ya alertamos en las últimas 6h, no repetir
  const { data: lastAlertRow } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', NASH_HEALTH_ALERT_KEY)
    .maybeSingle();
  const lastAlert = lastAlertRow?.value ? new Date(lastAlertRow.value) : null;
  if (lastAlert && Number.isFinite(lastAlert.getTime()) && (now.getTime() - lastAlert.getTime()) < NASH_HEALTH_DEDUP_MS) {
    return;
  }

  // 3) Enviar alerta directa (bypass notification_events)
  const hoursStale = Math.floor(staleMs / 3_600_000);
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1A0A3B;background:#FAFBFF">
  <h1 style="font-size:20px;font-weight:700;margin:0 0 16px">Nash no ha corrido en las últimas horas</h1>
  <div style="background:#fff;border:1px solid #E8E3F5;border-radius:12px;padding:16px;margin-bottom:12px">
    Última corrida de nash-monitor: <strong>${lastRun.toISOString()}</strong> (hace ~${hoursStale}h).
  </div>
  <div style="background:#fff;border:1px solid #E8E3F5;border-radius:12px;padding:16px;margin-bottom:12px">
    Sin Nash corriendo no hay monitoreo de plataforma: bugs de clientes se acumulan sin triaje, anomalías de consumo no se detectan, incidentes escalados no se procesan.
  </div>
  <div style="background:#fff;border:1px solid #E8E3F5;border-radius:12px;padding:16px">
    Chequea Vercel cron logs y <code>/api/cron/nash-monitor</code>. Si el endpoint responde 200 pero no procesa, revisa <code>features.nash_cron_enabled</code> del agente Nash y logs de <code>llm_call_log</code> con <code>source=nash-monitor</code>.
  </div>
</body></html>`;

  try {
    await sendEmail({
      to:      NASH_OWNER_EMAIL,
      subject: `Nash está atascado (${hoursStale}h sin correr)`,
      html,
    });
  } catch (err) {
    console.error('[daily-digest/nash-health] sendEmail falló', err);
    return;
  }

  // 4) También registrar en notification_events (para historial, no para delivery)
  await supabase.from('notification_events').insert({
    portal_email: 'hola@centinelia.mx',
    kind:         'nash_stuck',
    urgent:       true,
    payload:      { last_run_at: lastRun.toISOString(), stale_hours: hoursStale },
    delivered_at: now.toISOString(), // marcado delivered para no duplicar
  });

  // 5) Marcar alerta enviada
  await supabase
    .from('platform_settings')
    .upsert({ key: NASH_HEALTH_ALERT_KEY, value: now.toISOString() }, { onConflict: 'key' });
}
