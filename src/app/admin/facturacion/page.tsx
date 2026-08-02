export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import BillingClient from '../billing/BillingClient';
import AnnualContractsTab from './AnnualContractsTab';
import InvoicesTab from './InvoicesTab';

type TabKey = 'stripe' | 'contratos' | 'facturas';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'stripe',    label: 'Stripe'             },
  { key: 'contratos', label: 'Contratos anuales' },
  { key: 'facturas',  label: 'Facturas emitidas' },
];

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function FacturacionPage({ searchParams }: Props) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey = rawTab === 'contratos' || rawTab === 'facturas' ? rawTab : 'stripe';

  return (
    <div className="min-h-full">
      <div className="px-4 md:px-6 pt-4 md:pt-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--c-text)' }}>Facturación</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-2)' }}>
            Suscripciones Stripe, contratos anuales prepagados y facturas emitidas.
          </p>
        </div>

        <nav
          className="flex items-center gap-1 border-b"
          style={{ borderColor: 'var(--c-border)' }}
        >
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <Link
                key={t.key}
                href={`/admin/facturacion?tab=${t.key}`}
                className="px-3 py-2 text-sm rounded-t-lg transition-colors"
                style={{
                  color:       active ? '#9B6DFF' : 'var(--c-text-2)',
                  background:  active ? 'rgba(108,59,255,0.10)' : 'transparent',
                  fontWeight:  active ? 600 : 400,
                  borderBottom: active ? '2px solid #6C3BFF' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {tab === 'stripe'    && <StripeTab />}
      {tab === 'contratos' && <AnnualContractsTab />}
      {tab === 'facturas'  && <InvoicesTab />}
    </div>
  );
}

// Server component wrapper for the Stripe tab — carries the original BillingClient
async function StripeTab() {
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
