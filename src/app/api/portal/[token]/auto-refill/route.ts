import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents')
    .select('auto_refill_enabled, auto_refill_threshold, auto_refill_minutes, stripe_customer_id')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check if the customer actually has a saved card
  let hasCard = false;
  if (agent.stripe_customer_id) {
    const pms = await stripe.paymentMethods.list({ customer: agent.stripe_customer_id, type: 'card' });
    hasCard = pms.data.length > 0;
  }

  return NextResponse.json({
    enabled:   agent.auto_refill_enabled   ?? false,
    threshold: agent.auto_refill_threshold ?? 50,
    minutes:   agent.auto_refill_minutes   ?? 100,
    hasCard,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const cookieStore = await cookies();
  if (!await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as { enabled: boolean; threshold: number; minutes: number };

  if (
    typeof body.enabled   !== 'boolean'       ||
    ![25, 50, 75, 100].includes(body.threshold) ||
    ![100, 200].includes(body.minutes)
  ) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('voice_agents')
    .update({
      auto_refill_enabled:   body.enabled,
      auto_refill_threshold: body.threshold,
      auto_refill_minutes:   body.minutes,
    })
    .eq('portal_token', token);

  if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
