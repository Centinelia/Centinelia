// Frecuencia: diaria. vercel.json schedule "0 13 * * *" (13:00 UTC = 7am Monterrey).
//
// Circuit breaker de consumo de tareas del POOL COMPARTIDO por cuenta:
// - El pool es de cuenta (portal_email), compartido entre todos los empleados.
//   Pool total = SUM(ai_ops_limit) · Pool usado = SUM(ai_ops_used) sobre
//   los voice_agents activos de esa cuenta.
// - Encuentra cuentas donde el pool está >= 80% agotado.
// - Manda un correo al dueño de la cuenta (portal_email, fallback client_email)
//   explicando cuánto queda y quiénes están consumiendo más este mes.
// - Rate-limit: 1 aviso por cuenta cada 7 días. La marca se guarda en
//   features.admin_ops_alert_sent_at de todos los agentes de la cuenta.
// - Complementa a maybeSendQuotaEmail, que dispara cuando el pool llega a 100%
//   (agente por agente al agotarse). Este es warning temprano al dueño.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, heading, badge, infoCard, btn, sectionLabel } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

const THRESHOLD     = 0.8;                  // 80% del pool compartido
const RATE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_N         = 3;                    // Top-N consumidores a mostrar

interface Agent {
  id:                 string;
  agent_name:         string | null;
  business_name:      string | null;
  client_email:       string | null;
  portal_email:       string | null;
  portal_token:       string | null;
  ai_ops_used:        number;
  ai_ops_limit:       number;
  minutes_reset_date: string | null;
  features:           Record<string, unknown> | null;
}

interface Account {
  portalEmail: string;
  agents:      Agent[];
  poolUsed:    number;
  poolLimit:   number;
  pct:         number;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, portal_email, portal_token, ai_ops_used, ai_ops_limit, minutes_reset_date, features')
    .eq('active', true)
    .gt('ai_ops_limit', 0);

  // Group agents by portal_email (= account). Pool is per-account, so we sum.
  const byAccount = new Map<string, Agent[]>();
  for (const a of (agents ?? []) as Agent[]) {
    if (!a.portal_email) continue;
    const key = a.portal_email.toLowerCase();
    const list = byAccount.get(key) ?? [];
    list.push(a);
    byAccount.set(key, list);
  }

  const now = Date.now();
  const overThreshold: Account[] = [];
  for (const [portalEmail, list] of byAccount) {
    const poolUsed  = list.reduce((s, a) => s + (a.ai_ops_used  ?? 0), 0);
    const poolLimit = list.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);
    if (poolLimit <= 0) continue;
    if (poolUsed < THRESHOLD * poolLimit) continue;

    // Rate-limit: skip if any agent in the account was already alerted recently.
    const alertedRecently = list.some(a => {
      const last = (a.features as { admin_ops_alert_sent_at?: string } | null)?.admin_ops_alert_sent_at;
      if (!last) return false;
      return now - new Date(last).getTime() < RATE_LIMIT_MS;
    });
    if (alertedRecently) continue;

    overThreshold.push({
      portalEmail,
      agents: list,
      poolUsed,
      poolLimit,
      pct: (poolUsed / poolLimit) * 100,
    });
  }

  if (!overThreshold.length) {
    return NextResponse.json({ ok: true, alerted: 0 });
  }

  let emailed = 0;
  for (const account of overThreshold) {
    // Recipient: prefer portal_email (account owner login); fallback to any
    // client_email set on an agent in the account.
    const recipient = account.portalEmail
      ?? account.agents.find(a => a.client_email)?.client_email
      ?? null;
    if (!recipient) continue;

    const pct       = Math.round(account.pct);
    const remaining = Math.max(0, account.poolLimit - account.poolUsed);
    const teamSize  = account.agents.length;

    // Warm-yellow at 80–89%, red at 90%+
    const alertColor = pct >= 90 ? '#F87171' : '#FBBF24';

    // Reset date: earliest across agents (they should share one but be safe).
    const resetDates = account.agents.map(a => a.minutes_reset_date).filter(Boolean) as string[];
    resetDates.sort();
    const resetIso = resetDates[0] ?? null;
    const resetStr = resetIso
      ? new Date(resetIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
      : 'el próximo ciclo';

    // Business label for the header subtitle.
    const businessName = account.agents.find(a => a.business_name)?.business_name ?? 'Tu equipo';

    // Portal URL: use the portal token from any agent in the account.
    const token = account.agents.find(a => a.portal_token)?.portal_token ?? null;
    const portalUrl = token
      ? `https://www.centinelia.mx/portal/${token}?tab=cuenta#comprar`
      : 'https://www.centinelia.mx';

    // Top-N consumers this month.
    const topConsumers = [...account.agents]
      .filter(a => (a.ai_ops_used ?? 0) > 0)
      .sort((a, b) => (b.ai_ops_used ?? 0) - (a.ai_ops_used ?? 0))
      .slice(0, TOP_N);

    const consumerRows = topConsumers.map(a => {
      const share = account.poolUsed > 0 ? Math.round(((a.ai_ops_used ?? 0) / account.poolUsed) * 100) : 0;
      const shareBar = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px">
          <tr>
            <td bgcolor="#3D2E6A" style="background:#3D2E6A;background-color:#3D2E6A;border-radius:4px;overflow:hidden">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="${Math.max(1, share)}%" bgcolor="#9B6DFF" style="background:#9B6DFF;background-color:#9B6DFF;height:5px;font-size:0;line-height:0">&nbsp;</td>
                  <td style="height:5px;font-size:0;line-height:0">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`;
      return `
        <tr>
          <td style="padding:10px 0 4px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="color:#F1EEFF;font-size:14px;font-weight:600">${a.agent_name ?? 'Sin nombre'}</td>
                <td style="color:#C8BEE8;font-size:13px;text-align:right"><strong style="color:#F1EEFF">${a.ai_ops_used ?? 0}</strong> tareas · ${share}%</td>
              </tr>
            </table>
            ${shareBar}
          </td>
        </tr>`;
    }).join('');

    // Progress bar for the pool overall.
    const poolBar = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
        <tr>
          <td bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;border-radius:8px;overflow:hidden;padding:0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="${Math.max(1, Math.min(100, pct))}%" bgcolor="${alertColor}" style="background:linear-gradient(90deg,${alertColor},#9B6DFF);background-color:${alertColor};height:12px;font-size:0;line-height:0">&nbsp;</td>
                <td style="height:12px;font-size:0;line-height:0">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    const bigNumber = `
      <div style="text-align:center;margin:0 0 12px">
        <div style="font-size:64px;font-weight:800;color:${alertColor};line-height:1;letter-spacing:-0.03em;margin:0">${pct}<span style="font-size:36px;font-weight:700">%</span></div>
        <p style="color:#C8BEE8;font-size:13px;margin:10px 0 0">del pool compartido usado este mes</p>
      </div>`;

    const statsRow = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
        <tr>
          <td width="33%" align="center" style="padding:6px">
            <div style="color:#F1EEFF;font-size:20px;font-weight:700;line-height:1.2">${account.poolUsed}</div>
            <div style="color:#8C7FB8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">Usadas</div>
          </td>
          <td width="33%" align="center" style="padding:6px;border-left:1px solid #3D2E6A;border-right:1px solid #3D2E6A">
            <div style="color:#F1EEFF;font-size:20px;font-weight:700;line-height:1.2">${remaining}</div>
            <div style="color:#8C7FB8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">Restantes</div>
          </td>
          <td width="33%" align="center" style="padding:6px">
            <div style="color:#F1EEFF;font-size:20px;font-weight:700;line-height:1.2">${resetStr}</div>
            <div style="color:#8C7FB8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-top:4px">Renueva</div>
          </td>
        </tr>
      </table>`;

    const html = shell(
      badge(`${pct}% DEL POOL USADO`, alertColor) +
      `<h1 style="color:#F1EEFF;font-size:22px;font-weight:700;margin:0 0 20px;text-align:center;line-height:1.3">El pool de tu equipo está por agotarse</h1>
       <p style="color:#C8BEE8;font-size:16px;font-weight:600;margin:0 0 20px;text-align:center;line-height:1.4">${businessName}</p>` +
      bigNumber +
      poolBar +
      statsRow +
      infoCard(`
        ${sectionLabel('Qué significa esto')}
        <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 12px">Tus <strong style="color:#F1EEFF">${teamSize} ${teamSize === 1 ? 'empleado' : 'empleados'}</strong> comparten un pool mensual de <strong style="color:#F1EEFF">${account.poolLimit}</strong> tareas. Cada tarea es una acción de fondo: revisar tu bandeja, generar reportes semanales, aprender de conversaciones nuevas, etc.</p>
        <p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0">Cuando el pool llegue al 100%, las tareas de fondo se pausan automáticamente hasta que compres tareas extras o llegue la renovación del <strong style="color:#F1EEFF">${resetStr}</strong>.</p>
      `) +
      (topConsumers.length > 1
        ? infoCard(`
            ${sectionLabel('Quiénes están consumiendo más')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${consumerRows}
            </table>
          `, true)
        : '') +
      btn('Comprar tareas extras', portalUrl) +
      btn('Ver mi cuenta', portalUrl, false) +
      `<p style="color:#C8BEE8;font-size:12px;margin:24px 0 0;text-align:center;line-height:1.7">¿Crees que esto es un error?<br>Contáctanos a <a href="mailto:hola@centinelia.mx" style="color:#9B6DFF;text-decoration:none">hola@centinelia.mx</a>.</p>`
    );

    await sendEmail({
      to:      recipient,
      subject: `${pct}% del pool de tareas de tu equipo usado, ${businessName}`,
      html,
    }).catch(console.error);
    emailed++;
  }

  // Mark all agents in alerted accounts so we do not re-notify within
  // RATE_LIMIT_MS. Re-SELECT features per agent to avoid clobbering concurrent
  // writes (same race-fix pattern as Deploy 1 / Deploy 2 crons).
  const nowIso = new Date().toISOString();
  for (const account of overThreshold) {
    for (const a of account.agents) {
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
  }

  return NextResponse.json({
    ok: true,
    accounts_alerted: overThreshold.length,
    emailed,
  });
}
