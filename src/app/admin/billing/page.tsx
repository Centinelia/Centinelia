import { createAdminClient } from '@/lib/supabase/admin';
import BillingClient from './BillingClient';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const supabase = createAdminClient();

  const { data: rawAgents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_name, plan, minutes_plan, billing_status, stripe_subscription_id, minutes_used, minutes_included, minutes_reset_date, active, portal_email')
    .neq('id', process.env.DEMO_AGENT_ID ?? '')
    .order('business_name');

  const portalEmails = (rawAgents ?? []).map((a: any) => a.portal_email).filter(Boolean) as string[];
  const { data: acctData } = portalEmails.length
    ? await supabase.from('account_minutes').select('portal_email, minutes_used, minutes_included, minutes_reset_date').in('portal_email', portalEmails)
    : { data: [] };
  const acctMap = new Map((acctData ?? []).map((m: any) => [m.portal_email, m]));
  const agents = (rawAgents ?? []).map((a: any) => {
    const acct = a.portal_email ? acctMap.get(a.portal_email) : null;
    if (!acct) return a;
    return { ...a, minutes_used: acct.minutes_used, minutes_included: acct.minutes_included, minutes_reset_date: acct.minutes_reset_date };
  });

  return <BillingClient agents={agents} />;
}
