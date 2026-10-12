// Alerta predictiva de pool: proyecta consumo actual vs pool mensual y avisa
// al dueño ANTES de que se agote. Complementa a /ops-alerts (reactivo, cuando
// ya se usó >= 80%) y a maybeSendQuotaEmail (per-agent al llegar a 100%).
//
// Frecuencia: diaria 13:00 UTC (7am Monterrey), mismo horario que ops-alerts.
//
// Lógica:
//   - Para cada cuenta (portal_email): suma pool (minutos y tareas) y consumo.
//   - Calcula ritmo: avgPerDay = usado / diasDesdeReset (del ciclo real, día 1 MX).
//   - Proyecta al fin del mes: proj = avgPerDay * diasEnMes.
//   - Si proj > pool * 1.05 (5% overshoot para evitar false positives cerca
//     de 100%), envía correo.
//   - Rate-limit: una vez por ciclo billing (marca en features.projection_alert_sent_at,
//     compara contra el inicio del ciclo actual).
//
// Skip cuando:
//   - Pool = 0 (cuenta sin plan)
//   - daysSinceReset < 7 (muy temprano para proyectar — extrapolar 3-6 días a
//     31 amplifica cualquier spike y manda alertas falsas; subido de 3 a 7 tras
//     bug Tortillería 2026-10-12 que extrapoló 3 días a "71% sobre plan").
//   - Ya se envió esta alerta en el ciclo actual
//
// Bug Tortillería 2026-10-12: antes leía `voice_agents.minutes_reset_date` que
// queda stale para cuentas Stripe (el cron reset-minutes solo actualiza
// `account_minutes.minutes_reset_date`). Ahora pasa por loadAccountCycle que
// usa account_minutes como fuente única.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, heading, badge, infoCard, btn, sectionLabel, progressBar } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { claimCronRun, releaseCronRun } from '@/lib/cron/lock';
import { loadAccountCycle } from '@/lib/portal/account-cycle';

const OVERSHOOT_THRESHOLD = 1.05;  // 5% overshoot para gatillar alerta
const MIN_DAYS_TO_PROJECT = 7;     // 7 días mínimo (fix Tortillería 2026-10-12)

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatResetDateHuman(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.slice(0, 10));
  if (!m) return iso;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return `${d} de ${MESES_ES[mo - 1]} de ${y}`;
}

function renderProjectionCard(p: Projection): string {
  const label      = p.unit === 'min' ? 'Minutos' : 'Tareas';
  const unitHuman  = p.unit === 'min' ? 'min' : 'tareas';
  // Progress bar y "% usado" se calculan contra PLAN BASE (lo contratado),
  // consistente con el threshold de la alerta. Si hay rollover (pool > base),
  // se aclara en una línea aparte.
  const usagePct   = Math.min(100, Math.round(p.used / p.planBase * 100));
  const projPct    = Math.min(100, Math.round(p.projected / p.planBase * 100));
  const barColor   = projPct >= 100 ? '#F87171' : '#FBBF24';
  const projNum    = p.projected.toLocaleString('es-MX');
  const usedNum    = p.used.toLocaleString('es-MX');
  const planNum    = p.planBase.toLocaleString('es-MX');
  const hasRollover = p.pool > p.planBase;
  const rolloverAmt = p.pool - p.planBase;
  const rolloverNote = hasRollover
    ? `<p style="color:#8C7FB8;font-size:12px;margin:6px 0 0;line-height:1.5;font-style:italic">Además cuentas con <strong style="color:#C8BEE8">${rolloverAmt.toLocaleString('es-MX')} ${unitHuman}</strong> de saldo acumulado del ciclo anterior.</p>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;border:1px solid #3D2E6A;border-radius:12px;margin-bottom:16px">
    <tr><td bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;padding:20px">
      <p style="color:#8C7FB8;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 6px">${label}</p>
      <p style="color:#F1EEFF;font-size:30px;font-weight:800;line-height:1.1;margin:0 0 2px">~${projNum} <span style="color:#C8BEE8;font-size:16px;font-weight:600">${unitHuman}</span></p>
      <p style="color:#C8BEE8;font-size:13px;margin:0 0 14px">proyectados al cierre del ciclo</p>
      ${progressBar(projPct, barColor)}
      <p style="color:#C8BEE8;font-size:12px;margin:10px 0 0;line-height:1.5">
        Van <strong style="color:#F1EEFF">${usedNum}</strong> de <strong style="color:#F1EEFF">${planNum}</strong> ${unitHuman} de tu plan (${usagePct}%) · ritmo actual ~<strong style="color:#F1EEFF">${p.avgPerDay}</strong> por día.
      </p>
      ${rolloverNote}
    </td></tr>
  </table>`;
}

interface Agent {
  id:                 string;
  agent_name:         string | null;
  business_name:      string | null;
  client_email:       string | null;
  portal_email:       string | null;
  portal_token:       string | null;
  minutes_used:       number;
  minutes_included:   number;
  ai_ops_limit:       number;
  minutes_reset_date: string | null;
  features:           Record<string, unknown> | null;
}

interface Projection {
  used:      number;
  pool:      number;    // Pool total disponible (incluye rollover) — usado en display
  planBase:  number;    // Plan base contratado — usado en display + threshold
  avgPerDay: number;
  projected: number;
  overshoot: number;    // % sobre planBase (lo contratado), NO sobre pool
  unit:      'min' | 'tareas';
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const claim = await claimCronRun(supabase, 'pool-projection-alerts', 4 * 60 * 60 * 1000);
  if (!claim.ok) return NextResponse.json({ ok: true, skipped: claim.reason });

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, portal_email, portal_token, minutes_used, minutes_included, ai_ops_limit, minutes_reset_date, features')
    .eq('active', true);

  // Agrupa por portal_email (cuenta). Pool es por-cuenta.
  const byAccount = new Map<string, Agent[]>();
  for (const a of (agents ?? []) as Agent[]) {
    if (!a.portal_email) continue;
    const key = a.portal_email.toLowerCase();
    const list = byAccount.get(key) ?? [];
    list.push(a);
    byAccount.set(key, list);
  }

  const now = new Date();
  const alerts: Array<{
    portalEmail:  string;
    recipient:    string;
    businessName: string;
    portalUrl:    string;
    projections:  Projection[];
    resetDate:    string;
    daysLeftInCycle: number;
    agentIds:     string[];
  }> = [];

  for (const [portalEmail, list] of byAccount) {
    const primary = list[0];
    if (!primary) continue;

    // Ciclo billing viene de account_minutes.minutes_reset_date (día 1 próximo
    // mes MX, actualizado por reset-minutes cron). NO leemos voice_agents aquí
    // porque queda stale para cuentas Stripe — ver bug Tortillería 2026-10-12
    // en [[account-cycle]].
    const cycle = await loadAccountCycle(supabase, portalEmail, {
      agentResetDate: primary.minutes_reset_date,  // fallback solo si no hay account_minutes
    }, now);
    if (!cycle) continue;
    if (cycle.daysSinceReset < MIN_DAYS_TO_PROJECT) continue;

    const { daysInCycle, daysSinceReset, daysLeftInCycle } = cycle;
    const resetDate = new Date(cycle.cycleStart);  // inicio del ciclo, para rate-limit

    // Pool source of truth: account_minutes + account_ops (mirrors de los
    // dos ledgers). Post-cleanup Fase 3b 2026-10-09: eliminado el fallback a
    // organizations.monthly_ops_pool/used y voice_agents.ai_ops_used (todos
    // legacy stale).
    // Plan base contratado via RPC (lo que el cliente paga este mes, sin
    // rollover). Separado de `included` que es el pool total disponible
    // (plan + rollover acumulado, cap 2×). Antes se evaluaba overshoot contra
    // `included` y el correo decía "71% sobre plan de 2,000" cuando el plan
    // real contratado era 1,000 (Tortillería 2026-10-12). Ahora:
    //   - threshold aplica a planBase (si rebasas lo contratado, avisas)
    //   - display muestra planBase; si pool > planBase, aclara rollover.
    const [acctMinsRes, acctOpsRes, planBaseMinRes, planBaseOpsRes] = await Promise.all([
      supabase.from('account_minutes')
        .select('minutes_used, minutes_included')
        .eq('portal_email', portalEmail)
        .maybeSingle(),
      supabase.from('account_ops')
        .select('ops_used, ops_included')
        .eq('portal_email', portalEmail)
        .maybeSingle(),
      supabase.rpc('get_plan_base_minutes', { p_portal_email: portalEmail }),
      supabase.rpc('get_plan_base_ops',     { p_portal_email: portalEmail }),
    ]);
    const acctMins = acctMinsRes.data;
    const acctOps  = acctOpsRes.data as { ops_used?: number | null; ops_included?: number | null } | null;
    const planBaseMinutes = (planBaseMinRes.data as number | null) ?? 0;
    const planBaseOps     = (planBaseOpsRes.data as number | null) ?? 0;

    const activePeers = list;
    const minutesIncluded = (typeof acctMins?.minutes_included === 'number' && acctMins.minutes_included > 0)
      ? acctMins.minutes_included
      : activePeers.reduce((s, a) => s + (a.minutes_included ?? 0), 0);
    const minutesUsed = (typeof acctMins?.minutes_included === 'number' && acctMins.minutes_included > 0)
      ? (acctMins.minutes_used ?? 0)
      : activePeers.reduce((s, a) => s + (a.minutes_used ?? 0), 0);
    const opsLimit = typeof acctOps?.ops_included === 'number' && acctOps.ops_included > 0
      ? acctOps.ops_included
      : activePeers.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);
    const opsUsed = typeof acctOps?.ops_used === 'number' ? acctOps.ops_used : 0;

    // Fallback: si el RPC no devolvió plan base (ej. cuenta sin suscripción
    // Stripe activa), usar el pool actual como aproximación — mantiene
    // comportamiento anterior.
    const planBaseMinutesSafe = planBaseMinutes > 0 ? planBaseMinutes : minutesIncluded;
    const planBaseOpsSafe     = planBaseOps     > 0 ? planBaseOps     : opsLimit;

    const projections: Projection[] = [];

    if (minutesIncluded > 0 && planBaseMinutesSafe > 0) {
      const avg = minutesUsed / daysSinceReset;
      const proj = avg * daysInCycle;
      if (proj > planBaseMinutesSafe * OVERSHOOT_THRESHOLD) {
        projections.push({
          used: minutesUsed, pool: minutesIncluded, planBase: planBaseMinutesSafe,
          avgPerDay: Math.round(avg * 10) / 10,
          projected: Math.round(proj),
          overshoot: Math.round((proj / planBaseMinutesSafe - 1) * 100),
          unit: 'min',
        });
      }
    }

    if (opsLimit > 0 && planBaseOpsSafe > 0) {
      const avg = opsUsed / daysSinceReset;
      const proj = avg * daysInCycle;
      if (proj > planBaseOpsSafe * OVERSHOOT_THRESHOLD) {
        projections.push({
          used: opsUsed, pool: opsLimit, planBase: planBaseOpsSafe,
          avgPerDay: Math.round(avg * 10) / 10,
          projected: Math.round(proj),
          overshoot: Math.round((proj / planBaseOpsSafe - 1) * 100),
          unit: 'tareas',
        });
      }
    }

    if (projections.length === 0) continue;

    // Rate-limit: si alguien de esta cuenta ya recibió alerta EN ESTE CICLO
    // (sent_at > resetIso), skip. Al llegar el próximo reset la marca queda
    // obsoleta y podemos volver a alertar.
    const alreadyAlerted = list.some(a => {
      const last = (a.features as { projection_alert_sent_at?: string } | null)?.projection_alert_sent_at;
      if (!last) return false;
      return new Date(last).getTime() > resetDate.getTime();
    });
    if (alreadyAlerted) continue;

    const recipient = portalEmail
      ?? list.find(a => a.client_email)?.client_email
      ?? null;
    if (!recipient) continue;

    const primaryToken = list.find(a => a.portal_token)?.portal_token ?? '';
    const businessName = primary.business_name ?? 'tu negocio';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';

    alerts.push({
      portalEmail,
      recipient,
      businessName,
      portalUrl: `${appUrl}/portal/${primaryToken}?tab=cuenta#comprar`,
      projections,
      resetDate: cycle.resetDate,
      daysLeftInCycle,
      agentIds: list.map(a => a.id),
    });
  }

  if (!alerts.length) return NextResponse.json({ ok: true, alerted: 0 });

  let emailed = 0;
  const nowIso = now.toISOString();
  for (const alert of alerts) {
    const subject = alert.projections.length === 2
      ? `[Aviso] Tus minutos y tareas no van a alcanzar este mes, ${alert.businessName}`
      : alert.projections[0].unit === 'min'
        ? `[Aviso] Tus minutos no van a alcanzar este mes, ${alert.businessName}`
        : `[Aviso] Tus tareas no van a alcanzar este mes, ${alert.businessName}`;

    const resetHuman = formatResetDateHuman(alert.resetDate);
    const body = [
      heading(`Tu plan podría quedar corto este mes`, alert.businessName),
      badge(`Tu ciclo renueva el ${resetHuman}`, '#F59E0B'),
      ...alert.projections.map(p => renderProjectionCard(p)),
      sectionLabel('Qué puedes hacer'),
      infoCard(
        `<p style="color:#C8BEE8;font-size:14px;line-height:1.6;margin:0 0 8px"><strong style="color:#F1EEFF">1.</strong> Comprar saldo extra: se suma al instante, no cambia tu plan.</p>` +
        `<p style="color:#C8BEE8;font-size:14px;line-height:1.6;margin:0 0 8px"><strong style="color:#F1EEFF">2.</strong> Activar recarga automática con umbral: se repone solo cuando baja del límite que tú elijas.</p>` +
        `<p style="color:#C8BEE8;font-size:14px;line-height:1.6;margin:0"><strong style="color:#F1EEFF">3.</strong> Ajustar el uso de tus empleados en la configuración.</p>`
      ),
      btn('Ver mi cuenta y recargar', alert.portalUrl),
    ].join('');
    const html = shell(body);

    const ok = await sendEmail({ to: alert.recipient, subject, html })
      .then(() => true).catch(err => { console.error('[pool-projection-alerts]', err); return false; });

    if (ok) {
      emailed++;
      // Marca en todos los agentes de la cuenta (así ops-alerts lookup funciona
      // igual sin importar cuál agente se lea primero).
      for (const agentId of alert.agentIds) {
        try {
          const { data: agent } = await supabase
            .from('voice_agents').select('features').eq('id', agentId).single();
          const features = { ...(agent?.features as Record<string, unknown> ?? {}), projection_alert_sent_at: nowIso };
          await supabase.from('voice_agents').update({ features }).eq('id', agentId);
        } catch (err) {
          console.error('[pool-projection-alerts] marca sent_at falló', err);
        }
      }
    }
  }

  await releaseCronRun(supabase, 'pool-projection-alerts');
  return NextResponse.json({ ok: true, checked: byAccount.size, alerted: emailed });
}
