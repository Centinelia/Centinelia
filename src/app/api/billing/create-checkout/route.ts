import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG } from '@/lib/billing/plans';
import { requireStripeEligible } from '@/lib/billing/require-stripe-eligible';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';


export async function POST(req: NextRequest) {
  if (!await isAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { agentId, featurePlan, minutesPlan } = await req.json() as {
    agentId: string;
    featurePlan: Plan;
    minutesPlan: MinutesTier;
  };

  if (!agentId || !featurePlan || !minutesPlan
    || !FEATURE_PLAN_CONFIG[featurePlan]
    || !MONTHLY_CONFIG[featurePlan]?.[minutesPlan]) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, client_name, business_name, stripe_customer_id, portal_email')
    .eq('id', agentId)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });

  const eligible = await requireStripeEligible(agent.portal_email as string | null);
  if (!eligible.ok) {
    return NextResponse.json({ error: eligible.reason, message: eligible.message, contact: eligible.contact }, { status: 409 });
  }

  const featureCfg = FEATURE_PLAN_CONFIG[featurePlan];
  const minutesCfg = MONTHLY_CONFIG[featurePlan][minutesPlan];

  let customerId: string = agent.stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripe.customers.create({
      name:     `${agent.client_name}, ${agent.business_name}`,
      metadata: { agent_id: agentId },
    });
    customerId = customer.id;
    await supabase.from('voice_agents').update({ stripe_customer_id: customerId }).eq('id', agentId);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const session = await stripe.checkout.sessions.create({
    customer:          customerId,
    customer_update:   { address: 'auto', name: 'auto' },
    mode:              'subscription',
    automatic_tax:     { enabled: true },
    tax_id_collection: { enabled: true, required: 'if_supported' },
    line_items: [
      { price: featureCfg.setupPriceId(), quantity: 1 }, // one-time setup fee
      { price: minutesCfg.priceId(),      quantity: 1 }, // recurring minutes
    ],
    metadata: { agent_id: agentId, feature_plan: featurePlan, minutes_plan: minutesPlan },
    subscription_data: {
      metadata: { agent_id: agentId, feature_plan: featurePlan, minutes_plan: minutesPlan },
    },
    success_url: `${appUrl}/admin/agentes/${agentId}?checkout=success`,
    cancel_url:  `${appUrl}/admin/billing`,
  });

  return NextResponse.json({ url: session.url });
}
