// Frecuencia: diaria. vercel.json schedule "0 13 * * *" (13:00 UTC = 7am Monterrey).
//
// Circuit breaker de consumo de tareas (ops) por agente:
// - Encuentra agentes cuya ai_ops_used > 80% de su ai_ops_limit.
// - Manda 1 email a hola@centinelia.mx listando los agentes en riesgo.
// - Rate-limit: 1 email por agente cada 7 días vía features.admin_ops_alert_sent_at.
// - No manda email al cliente (para eso ya existe maybeSendQuotaEmail en los crons
//   cuando el pool se agota al 100%). Este es warning temprano para el equipo.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

const THRESHOLD          = 0.8;                  // 80% del pool
const RATE_LIMIT_MS      = 7 * 24 * 60 * 60 * 1000;
const ADMIN_EMAIL        = 'hola@centinelia.mx';
const MAX_AGENTS_PER_MSG = 25;

interface Agent {
  id:                 string;
  agent_name:         string | null;
  business_name:      string | null;
  portal_email:       string | null;
  ai_ops_used:        number;
  ai_ops_limit:       number;
  minutes_reset_date: string | null;
  features:           Record<string, unknown> | null;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, portal_email, ai_ops_used, ai_ops_limit, minutes_reset_date, features')
    .eq('active', true)
    .gt('ai_ops_limit', 0);

  const now         = Date.now();
  const overThreshold = (agents ?? []).filter((a: Agent) => {
    if (a.ai_ops_used < THRESHOLD * a.ai_ops_limit) return false;
    const last = (a.features as { admin_ops_alert_sent_at?: string } | null)?.admin_ops_alert_sent_at;
    if (last) {
      const age = now - new Date(last).getTime();
      if (age < RATE_LIMIT_MS) return false;
    }
    return true;
  }) as Agent[];

  if (!overThreshold.length) {
    return NextResponse.json({ ok: true, alerted: 0 });
  }

  const rows = overThreshold.slice(0, MAX_AGENTS_PER_MSG).map(a => {
    const pct = Math.round((a.ai_ops_used / a.ai_ops_limit) * 100);
    const reset = a.minutes_reset_date
      ? new Date(a.minutes_reset_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
      : '?';
    return `<tr>
<td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.10)">${a.business_name ?? '(sin negocio)'}</td>
<td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.10)">${a.agent_name ?? '(sin nombre)'}</td>
<td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.10)">${a.portal_email ?? '?'}</td>
<td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.10);text-align:right"><strong>${a.ai_ops_used}/${a.ai_ops_limit}</strong> (${pct}%)</td>
<td style="padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.10)">${reset}</td>
</tr>`;
  }).join('');

  const more = overThreshold.length > MAX_AGENTS_PER_MSG
    ? `<p style="color:rgba(255,255,255,0.58);font-size:13px;margin:12px 0 0">+${overThreshold.length - MAX_AGENTS_PER_MSG} agentes más en la misma situación.</p>`
    : '';

  const html = `<div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:32px 16px;background:#120726;color:#e2e8f0">
<h2 style="color:#EDE8FF;font-size:18px;margin:0 0 8px">Agentes cerca del límite de tareas</h2>
<p style="color:rgba(255,255,255,0.58);font-size:13px;margin:0 0 24px">${overThreshold.length} agente${overThreshold.length === 1 ? '' : 's'} usó más del ${Math.round(THRESHOLD * 100)}% de su pool mensual. Rate-limit: máximo 1 aviso por agente cada 7 días.</p>
<table style="width:100%;border-collapse:collapse;font-size:13px;background:rgba(255,255,255,0.055);border:1px solid rgba(255,255,255,0.10);border-radius:12px;overflow:hidden">
<thead>
<tr style="background:rgba(255,255,255,0.05)">
<th style="padding:8px 10px;text-align:left;font-weight:600">Negocio</th>
<th style="padding:8px 10px;text-align:left;font-weight:600">Empleado</th>
<th style="padding:8px 10px;text-align:left;font-weight:600">Cuenta</th>
<th style="padding:8px 10px;text-align:right;font-weight:600">Uso</th>
<th style="padding:8px 10px;text-align:left;font-weight:600">Renueva</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>
${more}
<p style="color:rgba(255,255,255,0.55);font-size:12px;margin:24px 0 0">Sugerencias: revisar si el cliente tiene auto_refill_ops activo, o contactarlo para ampliar plan.</p>
</div>`;

  await sendEmail({
    to:      ADMIN_EMAIL,
    subject: `[Centinelia] ${overThreshold.length} agente${overThreshold.length === 1 ? '' : 's'} cerca del límite de tareas`,
    html,
  }).catch(console.error);

  // Mark alerted agents so we do not spam the admin. Re-SELECT features for
  // each to avoid clobbering concurrent writes (same race-fix pattern as
  // Deploy 1 / Deploy 2 crons).
  const nowIso = new Date().toISOString();
  for (const a of overThreshold) {
    const { data: fresh } = await supabase
      .from('voice_agents')
      .select('features')
      .eq('id', a.id)
      .single();
    const currentFeatures = (fresh?.features ?? a.features ?? {}) as Record<string, unknown>;
    await supabase
      .from('voice_agents')
      .update({ features: { ...currentFeatures, admin_ops_alert_sent_at: nowIso } })
      .eq('id', a.id);
  }

  return NextResponse.json({ ok: true, alerted: overThreshold.length, emailed: Math.min(overThreshold.length, MAX_AGENTS_PER_MSG) });
}
