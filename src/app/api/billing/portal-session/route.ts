import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token requerido' }, { status: 400 });

  const supabase = createAdminClient();
  const agent = await getPrimaryAgentFromToken<{
    stripe_customer_id: string | null; portal_email: string | null;
  }>(token, 'stripe_customer_id, portal_email', supabase);

  if (!agent) return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 404 });
  if (session.portalEmail && agent.portal_email && session.portalEmail !== agent.portal_email)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!agent.stripe_customer_id) {
    return NextResponse.json({ error: 'Sin suscripción activa' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer:   agent.stripe_customer_id,
      return_url: `${appUrl}/portal/${token}?tab=cuenta`,
    });
    return NextResponse.redirect(session.url);
  } catch (err) {
    console.error('Stripe billing portal error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${token}?tab=cuenta&billing_error=1`);
  }
}
