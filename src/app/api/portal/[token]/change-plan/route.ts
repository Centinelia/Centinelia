import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { FEATURE_PLAN_CONFIG, MONTHLY_CONFIG } from '@/lib/billing/plans';
import { setAiOpsLimit } from '@/lib/ai/ops-guard';
import { PLAN_FEATURES } from '@/types/agent';
import type { Plan } from '@/types/agent';
import type { MinutesTier } from '@/lib/billing/plans';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;

  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { to_plan, to_minutes_tier } = await req.json() as { to_plan?: Plan; to_minutes_tier?: MinutesTier };

  if (to_plan && !['comercial', 'pro'].includes(to_plan))
    return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });
  if (to_minutes_tier && !['starter', 'growth', 'scale'].includes(to_minutes_tier))
    return NextResponse.json({ error: 'Tier de minutos inválido' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, plan, minutes_plan, stripe_customer_id, stripe_subscription_id')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });

  // We need portal_email for IDOR check — fetch it separately since current select omits it
  const { data: agentMeta } = await supabase
    .from('voice_agents').select('portal_email').eq('id', agent.id).single();
  if (auth.portalEmail && agentMeta?.portal_email && auth.portalEmail !== agentMeta.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  if (!agent.stripe_subscription_id) return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 400 });

  const currentPlan  = agent.plan as Plan;
  const currentTier  = (agent.minutes_plan ?? 'starter') as MinutesTier;
  const newPlan      = to_plan ?? currentPlan;
  const newTier      = to_minutes_tier ?? currentTier;

  if (newPlan === currentPlan && newTier === currentTier)
    return NextResponse.json({ error: 'Ya estás en este plan' }, { status: 400 });

  const from_cfg  = FEATURE_PLAN_CONFIG[currentPlan];
  const to_cfg    = FEATURE_PLAN_CONFIG[newPlan];
  const setup_diff = to_cfg.setupFee - from_cfg.setupFee;

  if (setup_diff > 0) {
    // Agent type upgrade: charge setup difference via Checkout
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const session = await stripe.checkout.sessions.create({
      customer: agent.stripe_customer_id ?? undefined,
      mode:     'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency:    'mxn',
          unit_amount: setup_diff * 100,
          product_data: {
            name:        `Upgrade a ${to_cfg.label}, Centinelia`,
            description: `Diferencia de instalación: ${from_cfg.label} → ${to_cfg.label}`,
          },
        },
      }],
      metadata: {
        type:            'plan_upgrade',
        agent_id:        agent.id,
        to_plan:         newPlan,
        to_minutes_plan: newTier,
      },
      success_url: `${appUrl}/portal/${token}?tab=cuenta&upgrade=ok`,
      cancel_url:  `${appUrl}/portal/${token}?tab=cuenta`,
      locale:      'es',
    });
    return NextResponse.json({ url: session.url });
  }

  // Downgrade or minutes tier change: immediate, no setup fee
  const sub     = await stripe.subscriptions.retrieve(agent.stripe_subscription_id);
  const subItem = sub.items.data.find(item => item.price.recurring !== null);
  if (!subItem) return NextResponse.json({ error: 'Suscripción sin plan recurrente' }, { status: 400 });

  await stripe.subscriptions.update(agent.stripe_subscription_id, {
    items:              [{ id: subItem.id, price: MONTHLY_CONFIG[newPlan][newTier].priceId() }],
    proration_behavior: 'none',
  });

  const { data: updatedAgent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('id', agent.id)
    .single();

  await supabase.from('voice_agents').update({
    plan:             newPlan,
    features:         PLAN_FEATURES[newPlan],
    minutes_plan:     newTier,
    minutes_included: MONTHLY_CONFIG[newPlan][newTier].minutes,
  }).eq('id', agent.id);

  if (to_plan && to_plan !== currentPlan && updatedAgent?.portal_email) {
    await setAiOpsLimit(updatedAgent.portal_email, MONTHLY_CONFIG[newPlan][newTier].aiOps);
  }

  return NextResponse.json({ success: true });
}
