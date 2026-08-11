// Dispara email al cliente cuando un abono al pool excedio el cap 2x y se
// descartaron minutos u ops. Se llama justo despues de apply_ledger_entry cuando
// la operacion puede haber gatillado un rollover_cap (extra_purchase, renewal,
// upgrade, auto_refill). Rate-limit por ciclo via features.rollover_alert_sent_at_<resource>.
//
// Skip explicito: setup_new_agent (nuevo, esperado), jornada_change (usuario
// acaba de decidir), admin_adjustment (admin sabe lo que hace).

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, shell, heading, badge, infoCard, btn, sectionLabel } from '@/lib/email/send';

const DEMO_EMAILS = new Set(['demo@centinelia.mx', 'centinelia.dev@gmail.com']);

const MIN_LOSS_TO_ALERT_MIN = 20; // <20 min = ruido, no vale notificar
const MIN_LOSS_TO_ALERT_OPS = 10; // <10 ops = ruido, no vale notificar

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
 * Verifica si la ultima llamada a apply_ledger_entry (identificada por
 * reference_id) genero un row rollover_cap en el ledger correspondiente,
 * y si si, notifica al cliente.
 * Fire-and-forget desde el caller. No throwea — errores se loguean.
 */
export async function maybeNotifyPoolLoss(
  supabase: SupabaseClient,
  params: {
    portalEmail:  string;
    referenceId:  string | null;
    resource:     'minutes' | 'ops';
  }
): Promise<void> {
  try {
    const { portalEmail, referenceId, resource } = params;
    if (!portalEmail || !referenceId) return;
    if (DEMO_EMAILS.has(portalEmail)) return;

    const table     = resource === 'minutes' ? 'minutes_ledger' : 'ops_ledger';
    const threshold = resource === 'minutes' ? MIN_LOSS_TO_ALERT_MIN : MIN_LOSS_TO_ALERT_OPS;
    const unitSing  = resource === 'minutes' ? 'minuto'  : 'tarea';
    const unitPlur  = resource === 'minutes' ? 'minutos' : 'tareas';
    const flagKey   = resource === 'minutes'
      ? 'rollover_alert_sent_at_minutes'
      : 'rollover_alert_sent_at_ops';

    // ¿Se escribio un rollover_cap para este mismo credit?
    const { data: capRows } = await supabase
      .from(table)
      .select('amount')
      .eq('portal_email', portalEmail)
      .eq('kind', 'rollover_cap')
      .eq('reference_id', referenceId);

    const lostThisEvent = -((capRows ?? []) as Array<{ amount: number }>).reduce(
      (s, r) => s + Math.min(0, r.amount ?? 0), 0
    );
    if (lostThisEvent < threshold) return;

    // Traer agentes para rate-limit + recipient.
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

    // Rate-limit: ya se envio alerta en este ciclo para este resource → skip.
    // Legacy back-compat para minutos: si el flag nuevo no existe pero existe el
    // viejo (rollover_alert_sent_at sin sufijo), respetarlo para no re-notificar.
    const alreadyAlerted = list.some(a => {
      const f = a.features as Record<string, string | undefined> | null;
      if (!f) return false;

      // Check nuevo flag especifico por resource
      const lastNew = f[flagKey];
      if (lastNew) {
        if (!resetDate) return true;
        return new Date(lastNew).getTime() > resetDate.getTime();
      }

      // Legacy back-compat solo para minutos
      if (resource === 'minutes') {
        const lastLegacy = f['rollover_alert_sent_at'];
        if (lastLegacy) {
          if (!resetDate) return true;
          return new Date(lastLegacy).getTime() > resetDate.getTime();
        }
      }

      return false;
    });
    if (alreadyAlerted) return;

    // Sumar TODA la perdida del ciclo (no solo este evento) — mas informativo
    const cycleStartIso = resetDate?.toISOString() ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: cycleRows } = await supabase
      .from(table)
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

    // Unificar copy subject vs body — antes: subject decía "60 no acumulados"
    // (lostThisCycle=todo el ciclo) mientras body decía "20 que sobraron"
    // (lostThisEvent=una operación). Cliente pensaba que las cifras se
    // contradecían. Ahora ambas cifras aparecen explicadas juntas.
    const cycleGreater = lostThisCycle > lostThisEvent;
    const subject = cycleGreater
      ? `[Aviso] ${lostThisCycle} ${unitPlur} descartados en este ciclo — ${businessName}`
      : `[Aviso] ${lostThisEvent} ${unitPlur} descartados por cap 2× — ${businessName}`;
    const body = [
      heading(`No pudimos guardar todas tus ${unitPlur} este ciclo`),
      badge(`${lostThisEvent} ${unitPlur} descartados en esta operación`, '#B45309'),
      infoCard(
        `En esta operación se descartaron <strong>${lostThisEvent} ${unitPlur}</strong> porque tu saldo ` +
        `hubiera rebasado el <strong>límite de acumulación (2× tu plan base)</strong>.` +
        (cycleGreater
          ? ` En total en este ciclo has perdido <strong>${lostThisCycle} ${unitPlur}</strong> por el mismo motivo.`
          : ``)
      ),
      sectionLabel('¿Por qué pasa esto?'),
      infoCard(
        `El cap 2× mantiene el saldo acumulado proporcional a tu plan mensual: si tu balance actual + las nuevas ` +
        `${unitPlur} supera el doble de tu plan, el exceso no se guarda. Así el saldo no crece sin límite cuando no se consume.`
      ),
      sectionLabel('¿Qué puedes hacer?'),
      infoCard(
        `<strong>1. Sube de plan:</strong> un plan más grande sube el cap y te deja acumular más saldo cuando no consumes.<br/>` +
        `<strong>2. Revisa si tu plan actual sobra:</strong> si pierdes saldo cada ciclo, considera bajar de tier al plan que realmente usas.<br/>` +
        `<strong>3. Revisa recargas automáticas:</strong> si están activas y no las necesitas, desactívalas para no acumular saldo que después se pierde.`
      ),
      btn('Ver mi plan y opciones', portalUrl),
    ].join('');

    const html = shell(body);

    await sendEmail({ to: recipient, subject, html });

    // Marca sent_at en TODOS los agentes de la cuenta para que ningun path lo
    // pierda al re-leer. Fire-and-forget en el update.
    const nowIso = new Date().toISOString();
    for (const a of list) {
      try {
        const features = {
          ...(a.features as Record<string, unknown> ?? {}),
          [flagKey]: nowIso,
        };
        await supabase.from('voice_agents').update({ features }).eq('id', a.id);
      } catch (err) {
        console.error('[pool-loss-notify] marca sent_at falló', err);
      }
    }
  } catch (err) {
    console.error('[pool-loss-notify] error', err);
    // Persistir en platform_incidents para que Nash detecte y escale. Evita
    // que un fallo silencioso de sendEmail deje al cliente sin aviso de pérdida.
    try {
      const message = err instanceof Error ? err.message : String(err);
      await supabase.from('platform_incidents').insert({
        title:                 `Fallo notif pérdida ${params.resource} — ${params.portalEmail}`,
        description:           `maybeNotifyPoolLoss falló para portal_email=${params.portalEmail} referenceId=${params.referenceId ?? 'null'} resource=${params.resource}: ${message}`,
        priority:              'high',
        source:                'error_log',
        source_id:             params.referenceId ?? null,
        affected_portal_email: params.portalEmail,
        status:                'open',
        assigned_to:           'nash',
      });
    } catch (writeErr) {
      console.error('[pool-loss-notify] no pude escribir platform_incidents', writeErr);
    }
  }
}

/**
 * Alias para compatibilidad con callers existentes de minutos.
 * Delega a maybeNotifyPoolLoss con resource: 'minutes'.
 */
export async function maybeNotifyRolloverLoss(
  supabase: SupabaseClient,
  params: {
    portalEmail:  string;
    referenceId:  string | null;
  }
): Promise<void> {
  return maybeNotifyPoolLoss(supabase, { ...params, resource: 'minutes' });
}
