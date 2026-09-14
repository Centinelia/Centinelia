import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin/auth';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_PLAN_CONFIG, JORNADA_CONFIG, TIER_PRICE_MXN } from '@/lib/billing/plans';
import { requireStripeEligible } from '@/lib/billing/require-stripe-eligible';
import type { Plan, JornadaType } from '@/types/agent';
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
    || !TIER_PRICE_MXN[minutesPlan]) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, client_name, business_name, stripe_customer_id, portal_email, jornada_type')
    .eq('id', agentId)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });

  const eligible = await requireStripeEligible(agent.portal_email as string | null);
  if (!eligible.ok) {
    return NextResponse.json({ error: eligible.reason, message: eligible.message, contact: eligible.contact }, { status: 409 });
  }

  const featureCfg = FEATURE_PLAN_CONFIG[featurePlan];
  // Jornada del agente determina QUÉ product Stripe (combinada/minutos/tareas × tier).
  // Default combinada si el agente no tiene jornada_type (setup inicial pre-empleado).
  const jornada    = (agent.jornada_type as JornadaType | null) ?? 'combinada';
  const minutesCfg = JORNADA_CONFIG[jornada][minutesPlan];

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
