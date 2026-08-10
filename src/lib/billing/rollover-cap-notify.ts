// Dispara email al cliente cuando un abono al pool excedió el cap 2× y se
// descartaron minutos. Se llama justo después de apply_ledger_entry cuando la
// operación puede haber gatillado un rollover_cap (extra_purchase, renewal,
// upgrade, auto_refill). Rate-limit por ciclo via features.rollover_alert_sent_at.
//
// Skip explícito: setup_new_agent (nuevo, esperado), jornada_change (usuario
// acaba de decidir), admin_adjustment (admin sabe lo que hace).

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, shell, heading, badge, infoCard, btn, sectionLabel } from '@/lib/email/send';

const DEMO_EMAILS = new Set(['demo@centinelia.mx', 'centinelia.dev@gmail.com']);
const MIN_LOSS_TO_ALERT = 20; // <20 min = ruido, no vale notificar

interface AgentRef {
  id:                 string;
  business_name:      string | null;
  client_email:       string | null;
  portal_email:       string | null;
  portal_token:       string | null;
  minutes_reset_date: string | null;
  features:           Record<string, unknown> | null;
}

/**
 * Verifica si la última llamada a apply_ledger_entry (identificada por
 * reference_id) generó un row rollover_cap, y si sí, notifica al cliente.
 * Fire-and-forget desde el caller. No throwea — errores se loguean.
 */
export async function maybeNotifyRolloverLoss(
  supabase: SupabaseClient,
  params: {
    portalEmail:  string;
    referenceId:  string | null;
  }
): Promise<void> {
  try {
    const { portalEmail, referenceId } = params;
    if (!portalEmail || !referenceId) return;
    if (DEMO_EMAILS.has(portalEmail)) return;

    // ¿Se escribió un rollover_cap para este mismo credit?
    const { data: capRows } = await supabase
      .from('minutes_ledger')
      .select('amount')
      .eq('portal_email', portalEmail)
      .eq('kind', 'rollover_cap')
      .eq('reference_id', referenceId);

    const lostThisEvent = -((capRows ?? []) as Array<{ amount: number }>).reduce(
      (s, r) => s + Math.min(0, r.amount ?? 0), 0
    );
    if (lostThisEvent < MIN_LOSS_TO_ALERT) return;

    // Traer agentes para rate-limit + recipient. Uso .in con [portalEmail]
    // porque el mismo email puede tener varios agentes en la cuenta.
    const { data: agentsData } = await supabase
      .from('voice_agents')
      .select('id, business_name, client_email, portal_email, portal_token, minutes_reset_date, features')
      .eq('portal_email', portalEmail)
      .eq('active', true);

    const list = ((agentsData ?? []) as AgentRef[]);
    if (list.length === 0) return;

    const primary = list[0];
    const resetIso = primary.minutes_reset_date;
    const resetDate = resetIso ? new Date(resetIso) : null;

    // Rate-limit: ya se envió alerta en este ciclo → skip
    const alreadyAlerted = list.some(a => {
      const last = (a.features as { rollover_alert_sent_at?: string } | null)?.rollover_alert_sent_at;
      if (!last) return false;
      if (!resetDate) return true;
      return new Date(last).getTime() > resetDate.getTime();
    });
    if (alreadyAlerted) return;

    // Sumar TODA la pérdida del ciclo (no solo este evento) — más informativo
    const cycleStartIso = resetDate?.toISOString() ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: cycleRows } = await supabase
      .from('minutes_ledger')
      .select('amount')
      .eq('portal_email', portalEmail)
      .eq('kind', 'rollover_cap')
      .gte('created_at', cycleStartIso);
    const lostThisCycle = -((cycleRows ?? []) as Array<{ amount: number }>).reduce(
      (s, r) => s + Math.min(0, r.amount ?? 0), 0
    );

    const recipient = portalEmail ?? list.find(a => a.client_email)?.client_email;
    if (!recipient) return;

    const businessName = primary.business_name ?? 'tu negocio';
    const primaryToken = list.find(a => a.portal_token)?.portal_token ?? '';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const portalUrl = `${appUrl}/portal/${primaryToken}?tab=cuenta#comprar`;

    const subject = `[Aviso] ${lostThisCycle} minutos no acumulados en ${businessName}`;
    const body = [
      heading(`No pudimos guardar todos tus minutos este ciclo`),
      badge(`${lostThisCycle} minutos descartados`, '#B45309'),
      infoCard(
        `El abono más reciente a tu cuenta hubiera dejado tu saldo por encima del ` +
        `<strong>límite de acumulación (2× tu plan base)</strong>. Los ${lostThisEvent} minutos que sobraron ` +
        `en esta operación no se sumaron, para evitar acumulación indefinida.`
      ),
      sectionLabel('¿Por qué pasa esto?'),
      infoCard(
        `El cap 2× existe para que tu saldo no crezca sin fin cuando no consumes tu plan. ` +
        `Si tu balance actual + los nuevos minutos supera el doble de tu plan mensual, ` +
        `el exceso se descarta.`
      ),
      sectionLabel('¿Qué puedes hacer?'),
      infoCard(
        `<strong>1. Upgrade de plan:</strong> un plan más grande sube el cap y te deja acumular más saldo.<br/>` +
        `<strong>2. Consume más:</strong> los minutos existen para gastarse — activa más automatizaciones o campañas salientes.<br/>` +
        `<strong>3. Revisa recargas automáticas:</strong> si están activas y no las usas, considera desactivarlas para no perder saldo.`
      ),
      btn('Ver mi plan y opciones', portalUrl),
    ].join('');

    const html = shell(body);

    await sendEmail({ to: recipient, subject, html });

    // Marca sent_at en TODOS los agentes de la cuenta para que ningún path lo
    // pierda al re-leer. Fire-and-forget en el update.
    const nowIso = new Date().toISOString();
    for (const a of list) {
      try {
        const features = { ...(a.features as Record<string, unknown> ?? {}), rollover_alert_sent_at: nowIso };
        await supabase.from('voice_agents').update({ features }).eq('id', a.id);
      } catch (err) {
        console.error('[rollover-cap-notify] marca sent_at falló', err);
      }
    }
  } catch (err) {
    console.error('[rollover-cap-notify] error', err);
  }
}

/**
 * Wrapper generalizado para notificar perdida de pool (minutos u ops).
 * Para minutos: delega a maybeNotifyRolloverLoss (implementacion completa).
 * Para ops: stub no-op hasta Task 15 — solo registra el evento en consola.
 * En Task 15 este stub se reemplaza por la implementacion real en pool-loss-notify.ts.
 */
export async function maybeNotifyPoolLoss(
  supabase: SupabaseClient,
  params: { portalEmail: string; referenceId: string | null; resource: 'minutes' | 'ops' }
): Promise<void> {
  if (params.resource === 'minutes') {
    return maybeNotifyRolloverLoss(supabase, params);
  }
  // Ops: no-op hasta Task 15. Log para poder auditar cuantos eventos se perderían.
  console.log('[pool-loss-notify:stub] ops event skipped (implementation lands in Task 15)', params);
}
