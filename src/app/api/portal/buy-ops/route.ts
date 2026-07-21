import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

const FIXED_PACKAGES: Record<number, number> = { 100: 800, 300: 2100 };
const PRICE_PER_OP = 8.5;

function calcPrice(ops: number): number {
  return FIXED_PACKAGES[ops] ?? Math.round(ops * PRICE_PER_OP);
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, ops } = await req.json() as { token: string; ops: number };

  if (!Number.isInteger(ops) || ops < 10 || ops > 5000) {
    return NextResponse.json({ error: 'Cantidad inválida (10–5000 tareas)' }, { status: 400 });
  }

  const priceMxn = calcPrice(ops);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, client_name, business_name, stripe_customer_id')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });

  let customerId: string = agent.stripe_customer_id ?? '';
  if (!customerId) {
    const customer = await stripe.customers.create({
      name:     `${agent.client_name}, ${agent.business_name}`,
      metadata: { agent_id: agent.id },
    });
    customerId = customer.id;
    await supabase.from('voice_agents').update({ stripe_customer_id: customerId }).eq('id', agent.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode:     'payment',
    payment_intent_data: { setup_future_usage: 'off_session' },
    line_items: [{
      quantity: 1,
      price_data: {
        currency:     'mxn',
        unit_amount:  priceMxn * 100,
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
