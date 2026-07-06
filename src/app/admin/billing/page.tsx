import { createAdminClient } from '@/lib/supabase/admin';
import BillingClient from './BillingClient';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const supabase = createAdminClient();

  const { data: agents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_name, plan, minutes_plan, billing_status, stripe_subscription_id, minutes_used, minutes_included, minutes_reset_date, active')
    .neq('id', process.env.DEMO_AGENT_ID ?? '')
    .order('business_name');

  return <BillingClient agents={agents ?? []} />;
}
