// Frecuencia: diaria. vercel.json schedule "0 13 * * *" (13:00 UTC = 7am Monterrey).
//
// Circuit breaker de consumo de tareas del POOL COMPARTIDO por cuenta:
// - El pool es de cuenta (portal_email), compartido entre todos los empleados.
//   Pool total = account_ops.ops_included (mirror del ops_ledger) o fallback
//   SUM(ai_ops_limit) de agentes activos. Pool usado = account_ops.ops_used.
// - Encuentra cuentas donde el pool está >= 80% agotado.
// - Manda un correo al dueño de la cuenta (portal_email, fallback client_email)
//   explicando cuánto queda y quiénes están consumiendo más este mes.
// - Per-agent breakdown: agregación de ai_ops_log por agent_id en el ciclo
//   actual (post-cleanup Fase 3b 2026-10-09, antes era voice_agents.ai_ops_used
//   stale).
// - Rate-limit: 1 aviso por cuenta cada 7 días. La marca se guarda en
//   features.admin_ops_alert_sent_at de todos los agentes de la cuenta.
// - Complementa a maybeSendQuotaEmail, que dispara cuando el pool llega a 100%
//   (agente por agente al agotarse). Este es warning temprano al dueño.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, heading, badge, infoCard, btn, sectionLabel } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';

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
  ai_ops_limit:       number;
  minutes_reset_date: string | null;
  features:           Record<string, unknown> | null;
  opsThisCycle:       number; // agregado desde ai_ops_log
}

interface Account {
  portalEmail:   string;
  agents:        Agent[];
  poolUsed:      number;
  poolLimit:     number;
  pct:           number;
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const claim = await claimCronRun(supabase, 'ops-alerts', 4 * 60 * 60 * 1000);
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, portal_email, portal_token, ai_ops_limit, minutes_reset_date, features')
    .eq('active', true)
    .gt('ai_ops_limit', 0);

  // Group agents by portal_email (= account). Pool is per-account, so we sum.
  type AgentRow = Omit<Agent, 'opsThisCycle'>;
  const byAccount = new Map<string, AgentRow[]>();
  for (const a of (agents ?? []) as AgentRow[]) {
    if (!a.portal_email) continue;
    const key = a.portal_email.toLowerCase();
    const list = byAccount.get(key) ?? [];
    list.push(a);
    byAccount.set(key, list);
  }

  // Ciclo actual: desde el primer día del mes natural (en UTC — el reset del
  // pool corre en UTC via cron reset-ops-pool). Usado para agregar
  // consumption per-agent desde ai_ops_log.
  const cycleStartIso = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const now = Date.now();
  const overThreshold: Account[] = [];
  for (const [portalEmail, list] of byAccount) {
    // Pool fuente única: account_ops (mirror del ops_ledger). Si no hay row,
    // caemos a SUM(ai_ops_limit) activos como cap derivado y used=0.
    const { data: acctOps } = await supabase.from('account_ops')
      .select('ops_used, ops_included')
      .eq('portal_email', portalEmail)
      .maybeSingle();

    const acctOpsIncluded = (acctOps as { ops_included?: number | null } | null)?.ops_included ?? null;
    const acctOpsUsed     = (acctOps as { ops_used?: number | null } | null)?.ops_used ?? null;

    const poolLimit = typeof acctOpsIncluded === 'number' && acctOpsIncluded > 0
      ? acctOpsIncluded
      : list.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);
    const poolUsed = typeof acctOpsUsed === 'number' ? acctOpsUsed : 0;

    if (poolLimit <= 0) continue;
    if (poolUsed < THRESHOLD * poolLimit) continue;

    // Rate-limit: skip if any agent in the account was already alerted recently.
    const alertedRecently = list.some(a => {
      const last = (a.features as { admin_ops_alert_sent_at?: string } | null)?.admin_ops_alert_sent_at;
      if (!last) return false;
      return now - new Date(last).getTime() < RATE_LIMIT_MS;
    });
    if (alertedRecently) continue;

    // Agregación per-agent del ciclo (reemplaza voice_agents.ai_ops_used stale)
    const agentIds = list.map(a => a.id);
    const { data: opsRows } = agentIds.length > 0
      ? await supabase.from('ai_ops_log')
          .select('agent_id, count')
          .in('agent_id', agentIds)
          .gte('created_at', cycleStartIso)
      : { data: [] };
    const opsCountMap: Record<string, number> = {};
    for (const r of opsRows ?? []) {
      const id = (r as { agent_id: string | null }).agent_id;
      if (id) opsCountMap[id] = (opsCountMap[id] ?? 0) + (((r as { count: number }).count) ?? 0);
    }
    const agentsWithOps: Agent[] = list.map(a => ({ ...a, opsThisCycle: opsCountMap[a.id] ?? 0 }));

    overThreshold.push({
      portalEmail,
      agents: agentsWithOps,
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
    // Parseo con `T00:00:00` para que el server UTC no interprete la fecha
    // como medianoche UTC = día anterior en México (off-by-one).
    const resetDates = account.agents.map(a => a.minutes_reset_date).filter(Boolean) as string[];
    resetDates.sort();
    const resetIso = resetDates[0] ?? null;
    const resetStr = resetIso
      ? new Date(resetIso + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
      : 'el próximo ciclo';

    // Business label for the header subtitle.
    const businessName = account.agents.find(a => a.business_name)?.business_name ?? 'Tu equipo';

    // Portal URL: use the portal token from any agent in the account.
    const token = account.agents.find(a => a.portal_token)?.portal_token ?? null;
    const portalUrl = token
      ? `https://www.centinelia.mx/portal/${token}?tab=cuenta#comprar`
      : 'https://www.centinelia.mx';

    // Top-N consumers this month (desde ai_ops_log agregado).
    const topConsumers = [...account.agents]
      .filter(a => a.opsThisCycle > 0)
      .sort((a, b) => b.opsThisCycle - a.opsThisCycle)
      .slice(0, TOP_N);

    const consumerRows = topConsumers.map(a => {
      const share = account.poolUsed > 0 ? Math.round((a.opsThisCycle / account.poolUsed) * 100) : 0;
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
                <td style="color:#C8BEE8;font-size:13px;text-align:right"><strong style="color:#F1EEFF">${a.opsThisCycle}</strong> tareas · ${share}%</td>
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
      // Breakdown per-agent desde ai_ops_log (fuente real post-cleanup 2026-10-09).
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

  await releaseCronRun(supabase, 'ops-alerts');
  return NextResponse.json({
    ok: true,
    accounts_alerted: overThreshold.length,
    emailed,
  });
}
