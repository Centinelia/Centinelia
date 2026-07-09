import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { resumeVapiAgent } from '@/lib/vapi/control';

const FIXED_PACKAGES: Record<number, number> = { 100: 1200, 200: 2400 };
const PRICE_PER_MIN = 12;

function calcPrice(minutes: number): number {
  return FIXED_PACKAGES[minutes] ?? minutes * PRICE_PER_MIN;
}

export async function executeAutoRefill(
  agentId: string,
): Promise<{ ok: boolean; minutesAdded?: number; error?: string }> {
  const supabase = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, stripe_customer_id, portal_email, phone_number, vapi_agent_id, auto_refill_minutes')
    .eq('id', agentId)
    .single();

  if (!agent)                      return { ok: false, error: 'agent_not_found' };
  if (!agent.stripe_customer_id)   return { ok: false, error: 'no_stripe_customer' };

  const minutes   = agent.auto_refill_minutes ?? 100;
  const amountMxn = calcPrice(minutes);

  // Find the customer's most recently attached card
  const pms = await stripe.paymentMethods.list({ customer: agent.stripe_customer_id, type: 'card' });
  const pm  = pms.data[0];
  if (!pm) return { ok: false, error: 'no_payment_method' };

  // Off-session charge — does NOT redirect the customer
  let pi;
  try {
    pi = await stripe.paymentIntents.create({
      amount:         amountMxn * 100,
      currency:       'mxn',
      customer:       agent.stripe_customer_id,
      payment_method: pm.id,
      confirm:        true,
      off_session:    true,
      description:    `Auto-recarga ${minutes} min · ${agent.business_name}`,
      metadata: { type: 'auto_refill', agent_id: agentId, minutes: String(minutes) },
    });
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'stripe_error' };
  }

  if (pi.status !== 'succeeded') return { ok: false, error: `pi_status_${pi.status}` };

  // Credit the minutes
  if (agent.portal_email) {
    const { data: acct } = await supabase
      .from('account_minutes').select('minutes_included').eq('portal_email', agent.portal_email).single();
    await supabase.from('account_minutes')
      .update({ minutes_included: (acct?.minutes_included ?? 0) + minutes, updated_at: new Date().toISOString() })
      .eq('portal_email', agent.portal_email);
    await supabase.from('voice_agents')
      .update({ active: true, billing_status: 'activo' }).eq('portal_email', agent.portal_email);
    const { data: peers } = await supabase.from('voice_agents')
      .select('phone_number, vapi_agent_id').eq('portal_email', agent.portal_email).not('phone_number', 'is', null);
    for (const a of peers ?? []) {
      if (a.phone_number && a.vapi_agent_id) await resumeVapiAgent(a.phone_number, a.vapi_agent_id);
    }
  } else {
    const { data: cur } = await supabase.from('voice_agents').select('minutes_included').eq('id', agentId).single();
    await supabase.from('voice_agents')
      .update({ minutes_included: (cur?.minutes_included ?? 0) + minutes, active: true, billing_status: 'activo' })
      .eq('id', agentId);
    if (agent.phone_number && agent.vapi_agent_id) {
      await resumeVapiAgent(agent.phone_number, agent.vapi_agent_id);
    }
  }

  await supabase.from('minutes_ledger').insert({
    agent_id:    agentId,
    amount:      minutes,
    description: `Auto-recarga ${minutes} min · $${amountMxn.toLocaleString('es-MX')} MXN`,
    source:      'auto_recarga',
  });

  return { ok: true, minutesAdded: minutes };
}
