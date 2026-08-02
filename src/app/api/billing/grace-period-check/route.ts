import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pauseVapiAgent } from '@/lib/vapi/control';
import { sendWhatsApp } from '@/lib/whatsapp/send';
import { sendEmail, agentPausedHtml } from '@/lib/email/send';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: agents, error } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_email, transfer_whatsapp, phone_number, portal_email')
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

  for (const agent of agents ?? []) {
    if (agent.portal_email && nonStripeSet.has(agent.portal_email)) continue;
    await supabase.from('voice_agents').update({ active: false }).eq('id', agent.id);

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
        html: agentPausedHtml(agent.business_name),
      }).catch(console.error);
    }

    paused.push(agent.id);
  }

  return NextResponse.json({ paused, count: paused.length });
}
