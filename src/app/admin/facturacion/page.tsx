export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import BillingClient from '../billing/BillingClient';
import AnnualContractsTab from './AnnualContractsTab';
import InvoicesTab from './InvoicesTab';
import ContratosClient from '../contratos/ContratosClient';

type TabKey = 'stripe' | 'contratos' | 'facturas' | 'clientes';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'stripe',    label: 'Stripe'             },
  { key: 'contratos', label: 'Contratos anuales' },
  { key: 'facturas',  label: 'Facturas emitidas' },
  { key: 'clientes',  label: 'Contratos clientes' },
];

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function FacturacionPage({ searchParams }: Props) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey =
    rawTab === 'contratos' || rawTab === 'facturas' || rawTab === 'clientes'
      ? rawTab
      : 'stripe';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight" style={{ color: '#111827' }}>Facturación</h1>
        <p className="text-[13px] mt-1.5" style={{ color: '#6B7280' }}>
          Suscripciones Stripe, contratos anuales prepagados y facturas emitidas.
        </p>
      </div>

      <nav
        className="flex items-center gap-1"
        style={{ borderBottom: '1px solid #E5E7EB' }}
      >
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              href={`/admin/facturacion?tab=${t.key}`}
              className="px-3 py-2 text-[13px] transition-colors"
              style={{
                color:        active ? '#6C3BFF' : '#6B7280',
                fontWeight:   active ? 600 : 500,
                borderBottom: active ? '2px solid #6C3BFF' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === 'stripe'    && <StripeTab />}
      {tab === 'contratos' && <AnnualContractsTab />}
      {tab === 'facturas'  && <InvoicesTab />}
      {tab === 'clientes'  && <ClientesTab />}
    </div>
  );
}

// Contratos ya son per-cliente (organizations.contract_accepted_at). Dedupe
// por portal_email para mostrar 1 fila por cliente en vez de N filas por
// empleado. Mismo patron que StripeTab abajo. Ver
// [[contract-at-organization-level]].
async function ClientesTab() {
  const supabase = createAdminClient();

  const { data: rawAgents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_name, plan, portal_token, portal_email, contract_text, contract_accepted_at, active, created_at')
    .neq('id', process.env.DEMO_AGENT_ID ?? '')
    .order('created_at', { ascending: true });

  const agents = rawAgents ?? [];

  const portalEmails = agents.map(a => a.portal_email).filter(Boolean) as string[];
  const { data: orgRows } = portalEmails.length
    ? await supabase
        .from('organizations')
        .select('portal_email, portal_token, contract_accepted_at, contract_ip')
        .in('portal_email', portalEmails)
    : { data: [] };
  const orgMap = new Map((orgRows ?? []).map(o => [o.portal_email as string, o]));

  // Agrupar por portal_email (agentes sin portal_email mantienen 1 fila propia)
  const clientRows: import('../contratos/ContratosClient').ContratoRow[] = [];
  const seenEmails = new Set<string>();

  for (const a of agents) {
    if (a.portal_email) {
      if (seenEmails.has(a.portal_email)) continue;
      seenEmails.add(a.portal_email);
      const org           = orgMap.get(a.portal_email);
      const siblings      = agents.filter(x => x.portal_email === a.portal_email);
      const businessNames = Array.from(new Set(siblings.map(s => s.business_name))).filter(Boolean);
      const anyCustom     = siblings.some(s => !!s.contract_text);
      const anchorAgent   = siblings.find(s => !!s.contract_text) ?? a;

      clientRows.push({
        id:                    anchorAgent.id,
        business_name:         businessNames.length > 1
          ? `${businessNames[0]} +${businessNames.length - 1}`
          : (businessNames[0] ?? a.business_name),
        client_name:           a.client_name,
        plan:                  a.plan,
        portal_token:          anchorAgent.portal_token,
        org_token:             (org?.portal_token as string | null) ?? null,
        portal_email:          a.portal_email,
        has_custom:            anyCustom,
        contract_accepted_at:  (org?.contract_accepted_at as string | null) ?? null,
        active:                a.active,
        employee_count:        siblings.length,
      });
    } else {
      // Demo/standalone sin portal_email: fila per-agente con firma legacy
      // (contract_accepted_at aun vive en voice_agents para estos casos).
      clientRows.push({
        id:                    a.id,
        business_name:         a.business_name,
        client_name:           a.client_name,
        plan:                  a.plan,
        portal_token:          a.portal_token,
        org_token:             null,
        portal_email:          null,
        has_custom:            !!a.contract_text,
        contract_accepted_at:  a.contract_accepted_at ?? null,
        active:                a.active,
        employee_count:        1,
      });
    }
  }

  const signedCount  = clientRows.filter(r => r.contract_accepted_at).length;
  const pendingCount = clientRows.filter(r => !r.contract_accepted_at).length;
  const customCount  = clientRows.filter(r => r.has_custom).length;

  return (
    <ContratosClient
      list={clientRows}
      signedCount={signedCount}
      pendingCount={pendingCount}
      customCount={customCount}
    />
  );
}

// Server component wrapper for the Stripe tab, carries the original BillingClient.
// Dedupe por portal_email: 1 cliente = 1 subscripción Stripe = 1 fila.
// Antes: mostraba N filas por cliente (una por empleado del pool) — bug de UX.
async function StripeTab() {
  const supabase = createAdminClient();

  const { data: rawAgents } = await supabase
    .from('voice_agents')
    .select('id, business_name, client_name, plan, minutes_plan, billing_status, stripe_subscription_id, minutes_used, minutes_included, minutes_reset_date, active, portal_email, created_at, ai_ops_used, ai_ops_limit')
    .neq('id', process.env.DEMO_AGENT_ID ?? '')
    .order('created_at', { ascending: true });

  const portalEmails = (rawAgents ?? []).map((a: any) => a.portal_email).filter(Boolean) as string[];
  const { data: acctData } = portalEmails.length
    ? await supabase.from('account_minutes').select('portal_email, minutes_used, minutes_included, minutes_reset_date').in('portal_email', portalEmails)
    : { data: [] };
  const acctMap = new Map((acctData ?? []).map((m: any) => [m.portal_email, m]));

  // Sumatorias por portal_email para minutos + tareas (pool de la cuenta).
  const employeeCountByEmail = new Map<string, number>();
  const opsUsedByEmail       = new Map<string, number>();
  const opsLimitByEmail      = new Map<string, number>();
  for (const a of (rawAgents ?? [])) {
    if (a.portal_email) {
      employeeCountByEmail.set(a.portal_email, (employeeCountByEmail.get(a.portal_email) ?? 0) + 1);
      opsUsedByEmail.set(a.portal_email, (opsUsedByEmail.get(a.portal_email) ?? 0) + ((a.ai_ops_used ?? 0) as number));
      opsLimitByEmail.set(a.portal_email, (opsLimitByEmail.get(a.portal_email) ?? 0) + ((a.ai_ops_limit ?? 0) as number));
    }
  }

  // Dedupe: 1 fila por portal_email (el primer agente creado = anchor).
  // Agentes sin portal_email (demos legacy, standalone) mantienen 1 fila per-agent.
  const seen = new Set<string>();
  const agents = (rawAgents ?? []).filter((a: any) => {
    if (!a.portal_email) return true;
    if (seen.has(a.portal_email)) return false;
    seen.add(a.portal_email);
    return true;
  }).map((a: any) => {
    const acct = a.portal_email ? acctMap.get(a.portal_email) : null;
    const employeeCount = a.portal_email ? (employeeCountByEmail.get(a.portal_email) ?? 1) : 1;
    const opsUsed  = a.portal_email ? (opsUsedByEmail.get(a.portal_email)  ?? 0) : ((a.ai_ops_used  ?? 0) as number);
    const opsLimit = a.portal_email ? (opsLimitByEmail.get(a.portal_email) ?? 0) : ((a.ai_ops_limit ?? 0) as number);
    const base = acct
      ? { ...a, minutes_used: acct.minutes_used, minutes_included: acct.minutes_included, minutes_reset_date: acct.minutes_reset_date }
      : a;
    return { ...base, employee_count: employeeCount, ops_used: opsUsed, ops_limit: opsLimit };
  });

  return <BillingClient agents={agents} />;
}
