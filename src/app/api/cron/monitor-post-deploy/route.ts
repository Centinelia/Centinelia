/**
 * Monitor post-deploy 2026-09-29 (48h window).
 *
 * Vigila que los deploys del día no degraden Tortillería ni disparen
 * falsos positivos en Nash. Corre cada 12h desde 2026-09-30T12:32Z hasta
 * 2026-10-01T20:32Z (Fase 1 → Fase 3 decision point).
 *
 * Alertas por email a nazre20@gmail.com si:
 *  1) Duplicados en client_incidents por Nelia > 0
 *  2) Jobs email_send_jobs stuck (pending/processing >10min) > 3
 *  3) Latencia enqueue→delivered p95 > 5s
 *  4) platform_incidents nuevos con "temperature" en título (Nash re-open)
 *  5) Errores golden_test "temperature" post-fix > 0
 *  6) platform_incidents con "temperature" NO-resolved OR creados post-PR#92
 *     (signal 6 añadido tras oleadas 4-9 — verifica que el filter dentro de
 *     revisar_incidentes_plataforma sigue funcionando y ningún incident
 *     temperature quedó abierto)
 *
 * Ventana: `MONITOR_WINDOW_END` hardcoded. Después de esa fecha, la ruta
 * retorna { skipped: 'window_expired' } sin hacer nada — no requiere
 * remover el cron manualmente.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';

const MONITOR_WINDOW_END = new Date('2026-10-01T22:00:00Z');   // ~48h + buffer
const DEPLOY_AT          = new Date('2026-09-29T18:32:00Z');   // PR #83 merge
const NASH_DEPLOY_AT     = new Date('2026-09-29T23:35:00Z');   // PR #84 merge
const FIX_TEMP_AT        = new Date('2026-09-29T15:40:00Z');   // PR #76 merge
const NASH_FILTER_FIX_AT = new Date('2026-09-30T07:00:00Z');   // PR #92 merge
const NELIA_ID           = 'e22fbc64-c01c-4184-8365-62e423052d7a';
const ALERT_TO           = 'nazre20@gmail.com';

interface AlertSignal {
  severity: 'warn' | 'critical';
  metric:   string;
  detail:   string;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  if (now > MONITOR_WINDOW_END) {
    return NextResponse.json({ skipped: 'window_expired', now: now.toISOString(), window_end: MONITOR_WINDOW_END.toISOString() });
  }

  const supabase = createAdminClient();
  const alerts: AlertSignal[] = [];
  const metrics: Record<string, unknown> = {};

  // 1) Duplicados en client_incidents por Nelia (5-min window)
  const { data: incs } = await supabase
    .from('client_incidents')
    .select('id, business_name, contact_phone, created_at')
    .eq('agent_id', NELIA_ID)
    .gte('created_at', DEPLOY_AT.toISOString())
    .order('created_at', { ascending: true });
  const seen = new Map<string, string>();
  let dupCount = 0;
  const dupSamples: string[] = [];
  for (const inc of incs ?? []) {
    const key = `${(inc.business_name as string ?? '').toLowerCase()}|${inc.contact_phone}`;
    const first = seen.get(key);
    if (first) {
      const delta = new Date(inc.created_at as string).getTime() - new Date(first).getTime();
      if (delta < 5 * 60_000) {
        dupCount++;
        if (dupSamples.length < 3) dupSamples.push(`${inc.business_name} ${inc.contact_phone} Δ${(delta/1000).toFixed(0)}s`);
      }
    } else {
      seen.set(key, inc.created_at as string);
    }
  }
  metrics.client_incidents_duplicates = dupCount;
  metrics.client_incidents_created    = incs?.length ?? 0;
  if (dupCount > 0) {
    alerts.push({
      severity: 'critical',
      metric:   'client_incidents duplicates',
      detail:   `${dupCount} duplicados detectados: ${dupSamples.join('; ')}`,
    });
  }

  // 2) email_send_jobs stuck
  const stuckCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count: stuckCount } = await supabase
    .from('email_send_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', NELIA_ID)
    .in('status', ['pending', 'processing'])
    .lt('created_at', stuckCutoff);
  metrics.email_jobs_stuck = stuckCount ?? 0;
  if ((stuckCount ?? 0) > 3) {
    alerts.push({
      severity: 'critical',
      metric:   'email_send_jobs stuck',
      detail:   `${stuckCount} jobs stuck en pending/processing >10min`,
    });
  }

  // 3) Latencia p95 email_send_jobs done
  const { data: done } = await supabase
    .from('email_send_jobs')
    .select('created_at, delivered_at')
    .eq('agent_id', NELIA_ID)
    .eq('status', 'done')
    .gte('created_at', DEPLOY_AT.toISOString())
    .limit(100);
  if (done && done.length >= 5) {
    const latencies = done
      .map(j => new Date(j.delivered_at as string).getTime() - new Date(j.created_at as string).getTime())
      .sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    metrics.email_jobs_latency_p95_ms = p95;
    if (p95 > 5000) {
      alerts.push({
        severity: 'warn',
        metric:   'email_send_jobs latency p95',
        detail:   `p95 latencia enqueue→delivered = ${(p95/1000).toFixed(1)}s (threshold 5s)`,
      });
    }
  } else {
    metrics.email_jobs_latency_p95_ms = null;
  }

  // 4) platform_incidents nuevos con "temperature"
  const { data: tempIncs } = await supabase
    .from('platform_incidents')
    .select('id, title, created_at')
    .gte('created_at', NASH_DEPLOY_AT.toISOString())
    .ilike('title', '%temperature%');
  metrics.platform_incidents_temperature_new = tempIncs?.length ?? 0;
  if ((tempIncs?.length ?? 0) > 0) {
    alerts.push({
      severity: 'critical',
      metric:   'platform_incidents temperature re-open',
      detail:   `Nash reabrió ${tempIncs?.length} incidents pese al floor: ${tempIncs?.map(i => i.title).join(' | ')}`,
    });
  }

  // 5) Errores golden_test "temperature" post-fix (siempre debe ser 0)
  const { count: tempErrs } = await supabase
    .from('llm_call_log')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'golden_test')
    .not('error', 'is', null)
    .ilike('error', '%temperature%')
    .gte('created_at', FIX_TEMP_AT.toISOString());
  metrics.golden_test_temperature_errors_post_fix = tempErrs ?? 0;
  if ((tempErrs ?? 0) > 0) {
    alerts.push({
      severity: 'critical',
      metric:   'golden_test temperature errors post-fix',
      detail:   `${tempErrs} errores POST-fix del PR #76 — el guard isPostTempModel no está funcionando`,
    });
  }

  // 6) Verificar que el fix del filter dentro de revisar_incidentes_plataforma
  // (PR #92) sigue funcionando: (a) NO deben existir incidents con "temperature"
  // creados post-PR#92 merge, (b) NO deben existir incidents temperature en
  // status no-resolved (todos deben estar resolved o closed).
  //
  // Añadido tras oleadas 4-9 (issues #86-#91) — el bug era que Nash LLM
  // seguía viendo errores pre-fix dentro del loop y creaba incident nuevo
  // cada hora. Este signal detecta si el fix regresa o si aparece una nueva
  // ruta de generación de incidents que no consideramos.
  const { data: tempPostFilterFix } = await supabase
    .from('platform_incidents')
    .select('id, title, status, created_at')
    .gte('created_at', NASH_FILTER_FIX_AT.toISOString())
    .ilike('title', '%temperature%');
  metrics.platform_incidents_temperature_post_pr92 = tempPostFilterFix?.length ?? 0;
  if ((tempPostFilterFix?.length ?? 0) > 0) {
    alerts.push({
      severity: 'critical',
      metric:   'platform_incidents temperature POST-PR#92',
      detail:   `Nash creó ${tempPostFilterFix?.length} incident(s) con "temperature" DESPUÉS del PR #92 (${NASH_FILTER_FIX_AT.toISOString()}) — el filter en revisar_incidentes_plataforma no funciona. Ids: ${tempPostFilterFix?.map(i => i.id).join(', ')}`,
    });
  }

  const { data: tempOpen } = await supabase
    .from('platform_incidents')
    .select('id, title, status')
    .ilike('title', '%temperature%')
    .not('status', 'in', '("resolved","closed")');
  metrics.platform_incidents_temperature_open = tempOpen?.length ?? 0;
  if ((tempOpen?.length ?? 0) > 0) {
    alerts.push({
      severity: 'warn',
      metric:   'platform_incidents temperature not resolved',
      detail:   `${tempOpen?.length} incidents con "temperature" siguen sin marcar como resolved: ${tempOpen?.map(i => `[${i.status}] ${i.id}`).join(', ')}`,
    });
  }

  // Reporte final
  const status = alerts.some(a => a.severity === 'critical') ? 'critical'
             :   alerts.length > 0                            ? 'warn'
             :                                                   'ok';

  console.log('[monitor-post-deploy]', { status, alerts_count: alerts.length, metrics });

  if (alerts.length > 0) {
    const alertHtml = `
      <p style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">
        <strong>Monitor post-deploy Tortillería + Nash</strong><br>
        Status: <strong style="color:${status === 'critical' ? '#c00' : '#c80'}">${status.toUpperCase()}</strong><br>
        Corrida: ${now.toISOString()}
      </p>
      <h3>Alertas (${alerts.length})</h3>
      <ul>
        ${alerts.map(a => `<li><strong>[${a.severity.toUpperCase()}]</strong> ${a.metric}: ${a.detail}</li>`).join('\n')}
      </ul>
      <h3>Métricas actuales</h3>
      <pre>${JSON.stringify(metrics, null, 2)}</pre>
      <p style="font-size:12px;color:#666">
        Acción sugerida si crítico: reversal por org con <code>UPDATE organizations SET flag=false WHERE portal_email='...'</code>.<br>
        Fuente: <code>/api/cron/monitor-post-deploy</code> (ventana hasta ${MONITOR_WINDOW_END.toISOString()}).
      </p>
    `;
    await sendEmail({
      to:      ALERT_TO,
      subject: `[Monitor ${status.toUpperCase()}] Tortillería/Nash post-deploy — ${alerts.length} alertas`,
      html:    alertHtml,
    }).catch(err => console.error('[monitor-post-deploy] email send failed:', err));
  }

  return NextResponse.json({ ok: true, status, alerts, metrics, window_end: MONITOR_WINDOW_END.toISOString() });
}
