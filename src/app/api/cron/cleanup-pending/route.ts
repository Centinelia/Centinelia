export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Deletes voice_agents that were never paid, older than 7 days:
// - 'pendiente':      onboarding inicial que no completo pago
// - 'pendiente_pago': portal → contratar empleado adicional donde el dueño
//                     cancelo el Stripe Checkout
// Ambos casos: active=false, sin stripe_subscription_id, creados hace 7d+
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase  = createAdminClient();
  const cutoff    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('voice_agents')
    .delete()
    .in('billing_status', ['pendiente', 'pendiente_pago'])
    .eq('active', false)
    .is('stripe_subscription_id', null)
    .lt('created_at', cutoff)
    .select('id, client_name, client_email, billing_status');

  if (error) {
    console.error('cleanup-pending error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`cleanup-pending: deleted ${data?.length ?? 0} stale registrations`);
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
