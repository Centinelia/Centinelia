import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { stripe } from '@/lib/stripe';
import { rateLimit, limiters } from '@/lib/ratelimit';

const VALID_PACKS = [100, 250, 500];
const PRICE_PER_MIN = 1200; // $12 MXN = 1200 centavos

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const rl = await rateLimit(req, limiters.payment);
  if (rl) return rl;

  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const { minutes } = await req.json();

  if (!VALID_PACKS.includes(minutes)) {
    return NextResponse.json({ error: 'Paquete inválido' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id, business_name, stripe_customer_id, portal_email')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const checkout = await stripe.checkout.sessions.create({
    customer: agent.stripe_customer_id ?? undefined,
    customer_creation: agent.stripe_customer_id ? undefined : 'always',
    line_items: [{
      price_data: {
        currency: 'mxn',
        unit_amount: minutes * PRICE_PER_MIN,
        product_data: {
          name: `${minutes} minutos extra · ${agent.business_name}`,
          description: `Paquete adicional de ${minutes} minutos para tu agente de voz Centinelia`,
        },
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${appUrl}/portal/${token}?minutos=ok`,
    cancel_url:  `${appUrl}/portal/${token}`,
    metadata: {
      type:     'extra_minutes',
      agent_id: agent.id,
      minutes:  String(minutes),
    },
  });

  return NextResponse.json({ url: checkout.url });
}
