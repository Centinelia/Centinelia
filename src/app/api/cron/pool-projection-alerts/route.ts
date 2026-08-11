// Alerta predictiva de pool: proyecta consumo actual vs pool mensual y avisa
// al dueño ANTES de que se agote. Complementa a /ops-alerts (reactivo, cuando
// ya se usó >= 80%) y a maybeSendQuotaEmail (per-agent al llegar a 100%).
//
// Frecuencia: diaria 13:00 UTC (7am Monterrey), mismo horario que ops-alerts.
//
// Lógica:
//   - Para cada cuenta (portal_email): suma pool (minutos y tareas) y consumo.
//   - Calcula ritmo: avgPerDay = usado / diasDesdeReset.
//   - Proyecta al fin del mes: proj = avgPerDay * diasEnMes.
//   - Si proj > pool * 1.05 (5% overshoot para evitar false positives cerca
//     de 100%), envía correo.
//   - Rate-limit: una vez por ciclo billing (marca en features.projection_alert_sent_at,
//     compara contra minutes_reset_date del ciclo actual).
//
// Skip cuando:
//   - Pool = 0 (cuenta sin plan)
//   - daysSinceReset < 3 (muy temprano para proyectar)
//   - Ya se envió esta alerta en el ciclo actual

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail, shell, heading, badge, infoCard, btn, sectionLabel } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

const OVERSHOOT_THRESHOLD = 1.05;  // 5% overshoot para gatillar alerta
const MIN_DAYS_TO_PROJECT = 3;

interface Agent {
  id:                 string;
  agent_name:         string | null;
  business_name:      string | null;
  client_email:       string | null;
  portal_email:       string | null;
  portal_token:       string | null;
  minutes_used:       number;
  minutes_included:   number;
  ai_ops_used:        number;
  ai_ops_limit:       number;
  minutes_reset_date: string | null;
  features:           Record<string, unknown> | null;
}

interface Projection {
  used:      number;
  pool:      number;
  avgPerDay: number;
  projected: number;
  overshoot: number;
  unit:      'min' | 'tareas';
}

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, agent_name, business_name, client_email, portal_email, portal_token, minutes_used, minutes_included, ai_ops_used, ai_ops_limit, minutes_reset_date, features')
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
    resetDate:    string | null;
    daysLeftInCycle: number;
    agentIds:     string[];
  }> = [];

  for (const [portalEmail, list] of byAccount) {
    const primary = list[0];
    if (!primary) continue;

    // Reset date determina el ciclo billing actual
    const resetIso = primary.minutes_reset_date;
    if (!resetIso) continue;
    const resetDate = new Date(resetIso);
    if (isNaN(resetDate.getTime())) continue;

    const daysSinceReset = Math.max(1, Math.floor((now.getTime() - resetDate.getTime()) / 86400000));
    if (daysSinceReset < MIN_DAYS_TO_PROJECT) continue;

    // Fin del ciclo = reset + 1 mes calendario (más preciso que +30d fijo).
    const cycleEnd = new Date(resetDate); cycleEnd.setMonth(cycleEnd.getMonth() + 1);
    const daysInCycle = Math.max(1, Math.round((cycleEnd.getTime() - resetDate.getTime()) / 86400000));
    const daysLeftInCycle = Math.max(0, Math.ceil((cycleEnd.getTime() - now.getTime()) / 86400000));

    // Pool source of truth: account_minutes + organizations (o account_ops si
    // ledger enabled). Antes se sumaba per-agente que quedó stale post-migración
    // — la alerta se disparaba con números que no coincidían con lo que el
    // cliente ve en portal. Ver [[feedback-audit-read-path-fidelity]].
    const [acctMinsRes, orgRes] = await Promise.all([
      supabase.from('account_minutes')
        .select('minutes_used, minutes_included')
        .eq('portal_email', portalEmail)
        .maybeSingle(),
      supabase.from('organizations')
        .select('monthly_ops_pool, monthly_ops_used, ops_ledger_enabled')
        .eq('portal_email', portalEmail)
        .maybeSingle(),
    ]);
    const acctMins = acctMinsRes.data;
    const org      = orgRes.data as { monthly_ops_pool?: number | null; monthly_ops_used?: number | null; ops_ledger_enabled?: boolean | null } | null;
    const ledgerEnabled = !!org?.ops_ledger_enabled;
    const orgPoolTotal  = (org?.monthly_ops_pool as number | null) ?? null;
    const orgPoolUsed   = (org?.monthly_ops_used as number | null) ?? null;

    let acctOpsUsed: number | null = null;
    if (ledgerEnabled) {
      const { data: acctOps } = await supabase.from('account_ops')
        .select('ops_used').eq('portal_email', portalEmail).maybeSingle();
      acctOpsUsed = (acctOps as { ops_used?: number | null } | null)?.ops_used ?? null;
    }

    const activePeers = list;
    const minutesIncluded = (typeof acctMins?.minutes_included === 'number' && acctMins.minutes_included > 0)
      ? acctMins.minutes_included
      : activePeers.reduce((s, a) => s + (a.minutes_included ?? 0), 0);
    const minutesUsed = (typeof acctMins?.minutes_included === 'number' && acctMins.minutes_included > 0)
      ? (acctMins.minutes_used ?? 0)
      : activePeers.reduce((s, a) => s + (a.minutes_used ?? 0), 0);
    const opsLimit = orgPoolTotal != null
      ? orgPoolTotal
      : activePeers.reduce((s, a) => s + (a.ai_ops_limit ?? 0), 0);
    const opsUsed = (ledgerEnabled && typeof acctOpsUsed === 'number')
      ? acctOpsUsed
      : orgPoolTotal != null
        ? (orgPoolUsed ?? 0)
        : activePeers.reduce((s, a) => s + (a.ai_ops_used ?? 0), 0);

    const projections: Projection[] = [];

    if (minutesIncluded > 0) {
      const avg = minutesUsed / daysSinceReset;
      const proj = avg * daysInCycle;
      if (proj > minutesIncluded * OVERSHOOT_THRESHOLD) {
        projections.push({
          used: minutesUsed, pool: minutesIncluded,
          avgPerDay: Math.round(avg * 10) / 10,
          projected: Math.round(proj),
          overshoot: Math.round((proj / minutesIncluded - 1) * 100),
          unit: 'min',
        });
      }
    }

    if (opsLimit > 0) {
      const avg = opsUsed / daysSinceReset;
      const proj = avg * daysInCycle;
      if (proj > opsLimit * OVERSHOOT_THRESHOLD) {
        projections.push({
          used: opsUsed, pool: opsLimit,
          avgPerDay: Math.round(avg * 10) / 10,
          projected: Math.round(proj),
          overshoot: Math.round((proj / opsLimit - 1) * 100),
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
      resetDate: resetIso,
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

    const body = [
      heading(`Vas a rebasar tu plan este mes`),
      badge(`${alert.daysLeftInCycle} días restantes en el ciclo`, '#F59E0B'),
      ...alert.projections.map(p => infoCard(
        `<strong>${p.unit === 'min' ? 'Minutos' : 'Tareas'}</strong><br/>` +
        `Ritmo actual: ~${p.avgPerDay} por día. A este paso llegarás a ~${p.projected.toLocaleString('es-MX')} ${p.unit === 'min' ? 'minutos' : 'tareas'} usadas al terminar el ciclo, ${p.overshoot}% por encima de tu plan de ${p.pool.toLocaleString('es-MX')}.`
      )),
      sectionLabel('¿Qué hacer?'),
      infoCard(
        `Puedes comprar saldo extra ahora (se suma al instante, no afecta el plan) o activar recarga automática para que se recargue solo cuando baje de un umbral. También puedes ajustar el uso de tus empleados.`
      ),
      btn('Comprar saldo o activar recarga', alert.portalUrl),
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

  return NextResponse.json({ ok: true, checked: byAccount.size, alerted: emailed });
}
