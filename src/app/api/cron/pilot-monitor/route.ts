export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

/**
 * pilot-monitor — cron cada 30 min.
 *
 * Vigila orgs marcadas como piloto/demo (organizations.pilot_notify_email
 * seteado) y envía alerta por correo cuando detecta anomalías operativas
 * en la última ventana de 45 min:
 *   1. voice_calls con self_eval_score < 0.5
 *   2. voice_calls con outcome que denota falla ('error', 'unanswered' con >3
 *      en la ventana → indica que algo pasó)
 *   3. tool_call_log con ok=false
 *   4. platform_incidents nuevos en la ventana
 *
 * Diseño explícito:
 * - Cero correos al cliente. Todo va al pilot_notify_email (típicamente Nazre).
 * - No dedupe sofisticado en v1: si el problema persiste 2 ventanas seguidas,
 *   Nazre recibe 2 correos. Acepta ruido a cambio de simplicidad.
 * - Si demo_paused=true, skip (ya está pausada, no hay actividad que vigilar).
 *
 * Ver también: [[project-centinelia-fondo-demo-del-norte]] (contexto Gerardo),
 * migration 20260902113000_pilot_notify_email.sql
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { sendEmail } from '@/lib/email/send';

const LOOKBACK_MINUTES = 45;
const SELF_EVAL_THRESHOLD = 0.5;

interface Anomaly {
  kind:    'low_self_eval' | 'tool_error' | 'incident' | 'many_unanswered';
  summary: string;
  detail?: Record<string, unknown>;
}

interface PilotOrgReport {
  portalEmail:      string;
  orgName:          string | null;
  notifyEmail:      string;
  anomalies:        Anomaly[];
  agentIds:         string[];
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date();
  const since    = new Date(now.getTime() - LOOKBACK_MINUTES * 60_000).toISOString();

  // 1. Orgs bajo monitoreo (piloto).
  const { data: pilotOrgs, error: orgsErr } = await supabase
    .from('organizations')
    .select('portal_email, name, pilot_notify_email, demo_paused')
    .not('pilot_notify_email', 'is', null);

  if (orgsErr) {
    console.error('[pilot-monitor] orgs query error:', orgsErr);
    return NextResponse.json({ error: 'orgs_query_failed', message: orgsErr.message }, { status: 500 });
  }

  const activePilots = (pilotOrgs ?? []).filter(o => !o.demo_paused);
  if (activePilots.length === 0) {
    return NextResponse.json({ ok: true, pilots_checked: 0, alerts_sent: 0 });
  }

  const reports: PilotOrgReport[] = [];

  for (const org of activePilots) {
    const notifyEmail = String(org.pilot_notify_email ?? '').trim();
    if (!notifyEmail) continue;

    // Agentes de la org.
    const { data: agents } = await supabase
      .from('voice_agents')
      .select('id, agent_name')
      .eq('portal_email', org.portal_email);
    const agentIds = (agents ?? []).map(a => a.id as string);

    const anomalies: Anomaly[] = [];

    if (agentIds.length > 0) {
      // 2. voice_calls con self_eval_score bajo.
      const { data: lowEvalCalls } = await supabase
        .from('voice_calls')
        .select('id, agent_id, outcome, self_eval_score, created_at')
        .in('agent_id', agentIds)
        .gte('created_at', since)
        .lt('self_eval_score', SELF_EVAL_THRESHOLD);

      if (lowEvalCalls && lowEvalCalls.length > 0) {
        anomalies.push({
          kind:    'low_self_eval',
          summary: `${lowEvalCalls.length} llamada${lowEvalCalls.length === 1 ? '' : 's'} con self_eval_score < ${SELF_EVAL_THRESHOLD}`,
          detail:  { calls: lowEvalCalls.map(c => ({ id: c.id, score: c.self_eval_score, outcome: c.outcome })) },
        });
      }

      // 3. voice_calls con muchas unanswered (ruido raro).
      const { count: unansweredCount } = await supabase
        .from('voice_calls')
        .select('id', { count: 'exact', head: true })
        .in('agent_id', agentIds)
        .gte('created_at', since)
        .eq('outcome', 'unanswered');

      if ((unansweredCount ?? 0) >= 3) {
        anomalies.push({
          kind:    'many_unanswered',
          summary: `${unansweredCount} llamadas sin respuesta en la ventana`,
          detail:  { count: unansweredCount },
        });
      }

      // 4. tool_call_log con errores.
      const { data: toolErrors } = await supabase
        .from('tool_call_log')
        .select('id, agent_id, tool_name, error, created_at')
        .in('agent_id', agentIds)
        .gte('created_at', since)
        .eq('ok', false)
        .limit(20);

      if (toolErrors && toolErrors.length > 0) {
        // Agrupa por tool_name para el resumen.
        const byTool = new Map<string, number>();
        for (const t of toolErrors) {
          byTool.set(t.tool_name as string, (byTool.get(t.tool_name as string) ?? 0) + 1);
        }
        anomalies.push({
          kind:    'tool_error',
          summary: `${toolErrors.length} error${toolErrors.length === 1 ? '' : 'es'} de tools: ${[...byTool.entries()].map(([n, c]) => `${n}×${c}`).join(', ')}`,
          detail:  { errors: toolErrors.map(t => ({ tool: t.tool_name, error: t.error })) },
        });
      }
    }

    // 5. platform_incidents nuevos para la org.
    const { data: incidents } = await supabase
      .from('platform_incidents')
      .select('id, title, priority, created_at')
      .eq('affected_portal_email', org.portal_email)
      .gte('created_at', since)
      .limit(10);

    if (incidents && incidents.length > 0) {
      anomalies.push({
        kind:    'incident',
        summary: `${incidents.length} incidente${incidents.length === 1 ? '' : 's'} nuevo${incidents.length === 1 ? '' : 's'} en plataforma`,
        detail:  { incidents: incidents.map(i => ({ id: i.id, title: i.title, priority: i.priority })) },
      });
    }

    if (anomalies.length > 0) {
      reports.push({
        portalEmail: org.portal_email as string,
        orgName:     (org.name as string | null) ?? null,
        notifyEmail,
        anomalies,
        agentIds,
      });
    }
  }

  // Envío de correos consolidados (uno por org).
  let alertsSent = 0;
  for (const report of reports) {
    const ok = await sendPilotAlert(report, since, now);
    if (ok) alertsSent++;
  }

  return NextResponse.json({
    ok:              true,
    pilots_checked:  activePilots.length,
    alerts_sent:     alertsSent,
    reports:         reports.map(r => ({ org: r.orgName ?? r.portalEmail, anomalies: r.anomalies.length })),
  });
}

async function sendPilotAlert(report: PilotOrgReport, sinceIso: string, now: Date): Promise<boolean> {
  const orgLabel = report.orgName ?? report.portalEmail;
  const windowLabel = `${new Date(sinceIso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} — ${now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;

  const rows = report.anomalies.map(a => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A0A3B;">${escapeHtml(kindLabel(a.kind))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#333;">${escapeHtml(a.summary)}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1A0A3B;margin:0 0 8px 0;">Alerta de piloto — ${escapeHtml(orgLabel)}</h2>
      <p style="color:#666;margin:0 0 16px 0;font-size:13px;">Ventana: ${windowLabel} (últimos ${LOOKBACK_MINUTES} min)</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#FAFBFF;">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6C3BFF;letter-spacing:0.05em;text-transform:uppercase;">Tipo</th>
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6C3BFF;letter-spacing:0.05em;text-transform:uppercase;">Resumen</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#888;margin-top:20px;font-size:12px;">
        Para pausar el piloto: <code>UPDATE organizations SET demo_paused = TRUE WHERE portal_email = '${escapeHtml(report.portalEmail)}';</code><br/>
        Para dejar de monitorear: <code>UPDATE organizations SET pilot_notify_email = NULL WHERE portal_email = '${escapeHtml(report.portalEmail)}';</code>
      </p>
    </div>
  `;

  const subject = `[piloto ${orgLabel}] ${report.anomalies.length} anomalía${report.anomalies.length === 1 ? '' : 's'} detectada${report.anomalies.length === 1 ? '' : 's'}`;

  return await sendEmail({ to: report.notifyEmail, subject, html });
}

function kindLabel(kind: Anomaly['kind']): string {
  switch (kind) {
    case 'low_self_eval':   return 'Autoevaluación baja';
    case 'many_unanswered': return 'Llamadas sin respuesta';
    case 'tool_error':      return 'Error de tool';
    case 'incident':        return 'Incidente en plataforma';
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
