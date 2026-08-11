import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pauseVapiAgent } from '@/lib/vapi/control';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, agentPausedHtml } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { alertCronPartialFailure } from '@/lib/cron/alert-partial-failure';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_email, transfer_whatsapp, phone_number, portal_email, jornada_type')
    .eq('billing_status', 'pago_fallido')
    .lte('grace_period_ends_at', now)
    .eq('active', true);

  if (error) {
    console.error('grace-period-check query error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Skip annual_prepaid / expired orgs — no operan con Stripe billing_status.
  const portalEmails = (agents ?? []).map(a => a.portal_email as string | null).filter(Boolean) as string[];
  const { data: nonStripeOrgs } = portalEmails.length
    ? await supabase.from('organizations').select('portal_email').in('portal_email', portalEmails).neq('billing_model', 'stripe')
    : { data: [] as { portal_email: string }[] };
  const nonStripeSet = new Set((nonStripeOrgs ?? []).map(o => o.portal_email));

  const paused: string[] = [];
  const errors: string[] = [];
  // Considerar solo los que pertenecen a stripe (no skipped)
  const eligibleAgents = (agents ?? []).filter(a => !(a.portal_email && nonStripeSet.has(a.portal_email)));

  for (const agent of eligibleAgents) {
    try {
      // Fix T6 audit 2026-08-10: re-read state antes de pause. Race: cron leyó
      // snapshot hace ~1s, webhook invoice.payment_succeeded pudo haber corrido
      // en ese lapso reseteando billing_status='activo'. Sin este re-check
      // pausaríamos un agente que ya pagó.
      const { data: agentNow } = await supabase
        .from('voice_agents')
        .select('billing_status, grace_period_ends_at, active')
        .eq('id', agent.id)
        .maybeSingle();
      const stillEligible = agentNow?.billing_status === 'pago_fallido'
        && agentNow?.active === true
        && agentNow?.grace_period_ends_at
        && new Date(agentNow.grace_period_ends_at as string).toISOString() <= now;
      if (!stillEligible) continue;

      await supabase.from('voice_agents').update({ active: false }).eq('id', agent.id);

      // Fix M-c audit 2026-08-10: ledger row del pause por grace period expirado.
      await supabase.from('minutes_ledger').insert({
        portal_email: agent.portal_email ?? null,
        agent_id:     agent.id,
        amount:       0,
        description:  `Agente pausado · grace period de pago expirado`,
        source:       'ajuste',
        kind:         'auto_paused',
        // Date-idempotent (Scope C2 medium): Date.now() creaba row nuevo por
        // corrida, race entre 2 lambdas duplicaba audit-trail. Ahora usamos
        // fecha del día (YYYY-MM-DD) → un solo row por agente por día.
        reference_id: `grace_expired_${agent.id}_${new Date().toISOString().slice(0, 10)}`,
      });

      if (agent.phone_number) await pauseVapiAgent(agent.phone_number);

      if (agent.transfer_whatsapp) {
        await sendWhatsApp(
          agent.transfer_whatsapp,
          `📴 *Agente pausado, ${agent.business_name}*\n\nEl período de gracia venció sin recibir el pago. Tu agente de voz ha sido pausado.\n\nActualiza tu método de pago para reactivar el servicio.`
        ).catch(console.error);
      }

      if (agent.client_email) {
        await sendEmail({
          to: agent.client_email,
          subject: `📴 Agente pausado, ${agent.business_name}`,
          html: agentPausedHtml(agent.business_name, (agent.jornada_type as 'combinada' | 'minutos' | 'tareas' | undefined)),
        }).catch(console.error);
      }

      paused.push(agent.id);
    } catch (err) {
      errors.push(`${agent.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await alertCronPartialFailure(supabase, {
    cronName:  'grace-period-check',
    expected:  eligibleAgents.length,
    processed: paused.length,
    errors,
  });

  return NextResponse.json({ paused, count: paused.length, errors: errors.length });
}
