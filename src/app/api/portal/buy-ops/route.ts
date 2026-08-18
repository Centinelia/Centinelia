import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePortalAccess } from '@/lib/portal/access';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { rateLimit, limiters } from '@/lib/ratelimit';
import { requireStripeEligible } from '@/lib/billing/require-stripe-eligible';

const FIXED_PACKAGES: Record<number, number> = { 100: 800, 300: 2100 };
const PRICE_PER_OP = 8.5;
const IVA = 0.16;

function calcPrice(ops: number): number {
  const base = FIXED_PACKAGES[ops] ?? Math.round(ops * PRICE_PER_OP);
  return Math.round(base * (1 + IVA));
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, limiters.payment);
  if (rl) return rl;

  // Owner-only: compra de ops con la tarjeta del owner. Ver Scope D3 CRIT-1.
  const gate = await requirePortalAccess(req, { ownerOnly: true });
  if (!gate.ok) return gate.response;
  const auth = gate.session;

  const { token, ops } = await req.json() as { token: string; ops: number };

  if (!Number.isInteger(ops) || ops < 10 || ops > 5000) {
    return NextResponse.json({ error: 'Cantidad inválida (10–5000 tareas)' }, { status: 400 });
  }

  const priceMxn = calcPrice(ops);

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{
    id: string; client_name: string | null; business_name: string;
    stripe_customer_id: string | null; portal_email: string | null;
  }>(token, 'id, client_name, business_name, stripe_customer_id, portal_email', supabase);

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const eligible = await requireStripeEligible(agent.portal_email as string | null);
  if (!eligible.ok) {
    return NextResponse.json({ error: eligible.reason, message: eligible.message, contact: eligible.contact }, { status: 409 });
  }

  let customerId: string = agent.stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripe.customers.create({
      name:     `${agent.client_name}, ${agent.business_name}`,
      metadata: { agent_id: agent.id },
    });
    customerId = customer.id;
    // stripe_customer_id es org-level: propagar a todos los meerkats.
    // Ver [[handoff-peer-discrimination-fix]] audit 2026-08-18.
    if (agent.portal_email) {
      await supabase.from('voice_agents').update({ stripe_customer_id: customerId }).eq('portal_email', agent.portal_email);
    } else {
      await supabase.from('voice_agents').update({ stripe_customer_id: customerId }).eq('id', agent.id);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const session = await stripe.checkout.sessions.create({
    customer:            customerId,
    customer_update:     { address: 'auto', name: 'auto' },
    mode:                'payment',
    automatic_tax:       { enabled: true },
    tax_id_collection:   { enabled: true, required: 'if_supported' },
    payment_intent_data: { setup_future_usage: 'off_session' },
    line_items: [{
      quantity: 1,
      price_data: {
        currency:      'mxn',
        unit_amount:   priceMxn * 100,
        tax_behavior:  'inclusive',
        product_data: {
          name:        `${ops} tareas extra, Centinelia`,
          description: `Se suman inmediatamente al saldo de ${agent.business_name}`,
        },
      },
    }],
    metadata: {
      type:     'extra_ops',
      agent_id: agent.id,
      ops:      String(ops),
    },
    success_url: `${appUrl}/portal/${token}?tareas=ok`,
    cancel_url:  `${appUrl}/portal/${token}`,
  });

  return NextResponse.json({ url: session.url });
}
