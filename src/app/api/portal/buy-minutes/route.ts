import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

const FIXED_PACKAGES: Record<number, number> = { 100: 1200, 200: 2400 };
const PRICE_PER_MIN = 12;

function calcPrice(minutes: number): number {
  return FIXED_PACKAGES[minutes] ?? minutes * PRICE_PER_MIN;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const auth = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token, minutes } = await req.json() as { token: string; minutes: number };

  if (!Number.isInteger(minutes) || minutes < 10 || minutes > 5000) {
    return NextResponse.json({ error: 'Cantidad inválida (10–5000 min)' }, { status: 400 });
  }

  const priceMxn = calcPrice(minutes);

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, client_name, business_name, stripe_customer_id, portal_email')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
  if (auth.portalEmail && agent.portal_email && auth.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

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
          name:        `${minutes} minutos extra, Centinelia`,
          description: `Se suman inmediatamente al saldo de ${agent.business_name}`,
        },
      },
    }],
    metadata: {
      type:     'extra_minutes',
      agent_id: agent.id,
      minutes:  String(minutes),
    },
    success_url: `${appUrl}/portal/${token}?minutos=ok`,
    cancel_url:  `${appUrl}/portal/${token}`,
  });

  return NextResponse.json({ url: session.url });
}
