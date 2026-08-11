import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAccess } from '@/lib/admin/access-log';
import { labelBilling } from '@/lib/admin/consumo-labels';
import ConsumoClient from './ConsumoClient';

export const dynamic = 'force-dynamic';

// Fix N1 audit 2026-08-10: vista admin de consumo por cliente + rango de fechas.
// Municipality audit necesita: "muéstrame lo que consumió cliente X entre Y y Z"
// con detalle línea-por-línea + CSV export. Antes: solo /admin/pool-perdido
// mostraba pérdidas, sin vista de consumo full.
//
// Incluye rows de *_archive (retention 7 años) para agentes ya purgados.

interface Params { params: Promise<{ email: string }> }
interface SearchParams { searchParams: Promise<{ from?: string; to?: string; kind?: string }> }

export interface LedgerEntry {
  id:            string;
  created_at:    string;
  ledger_type:   'minutes' | 'ops' | 'minutes_archive' | 'ops_archive';
  amount:        number;
  kind:          string;
  source:        string | null;
  reference_id:  string | null;
  description:   string | null;
  agent_id:      string | null;
  archived:      boolean;
}

export default async function AdminConsumoPage({ params, searchParams }: Params & SearchParams) {
  if (!(await isAdmin())) redirect('/admin/login?from=/admin/consumo');

  const { email: rawEmail } = await params;
  const sp = await searchParams;
  const portalEmail = decodeURIComponent(rawEmail);

  // Filtros de fecha en tz México (paridad con portal cliente)
  const fromParam = sp.from ?? '';
  const toParam   = sp.to   ?? '';
  const kindFilter = sp.kind ?? '';
  const fromIso = fromParam ? `${fromParam}T00:00:00-06:00` : null;
  const toIso   = toParam   ? `${toParam}T23:59:59-06:00`   : null;

  const supabase = createAdminClient();

  // Query paralela: live + archive de ambos ledgers
  const buildQuery = (table: string) => {
    let q = supabase
      .from(table)
      .select('id, created_at, amount, kind, source, reference_id, description, agent_id')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })   // Fix B2 audit: stable tie-breaker
      .limit(10000);
    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso)   q = q.lte('created_at', toIso);
    if (kindFilter) q = q.eq('kind', kindFilter);
    return q;
  };
  const buildArchiveQuery = (table: string) => {
    let q = supabase
      .from(table)
      .select('id, created_at, amount, kind, source, reference_id, description, original_agent_id')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })   // Fix B2 audit: stable tie-breaker
      .limit(10000);
    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso)   q = q.lte('created_at', toIso);
    if (kindFilter) q = q.eq('kind', kindFilter);
    return q;
  };

  const [minRes, opsRes, minArchRes, opsArchRes, orgRes] = await Promise.all([
    buildQuery('minutes_ledger'),
    buildQuery('ops_ledger'),
    buildArchiveQuery('minutes_ledger_archive'),
    buildArchiveQuery('ops_ledger_archive'),
    supabase.from('organizations').select('name, billing_model, active_contract_id').eq('portal_email', portalEmail).maybeSingle(),
  ]);

  const orgName = (orgRes.data?.name as string | null) ?? portalEmail;
  const billingModel = (orgRes.data?.billing_model as string | null) ?? 'stripe';

  const entries: LedgerEntry[] = [
    ...((minRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string, created_at: r.created_at as string,
      ledger_type: 'minutes' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? 'unknown',
      source: (r.source as string | null) ?? null,
      reference_id: (r.reference_id as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      agent_id: (r.agent_id as string | null) ?? null,
      archived: false,
    })),
    ...((opsRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string, created_at: r.created_at as string,
      ledger_type: 'ops' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? 'unknown',
      source: (r.source as string | null) ?? null,
      reference_id: (r.reference_id as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      agent_id: (r.agent_id as string | null) ?? null,
      archived: false,
    })),
    ...((minArchRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string, created_at: r.created_at as string,
      ledger_type: 'minutes_archive' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? 'unknown',
      source: (r.source as string | null) ?? null,
      reference_id: (r.reference_id as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      agent_id: (r.original_agent_id as string | null) ?? null,
      archived: true,
    })),
    ...((opsArchRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string, created_at: r.created_at as string,
      ledger_type: 'ops_archive' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? 'unknown',
      source: (r.source as string | null) ?? null,
      reference_id: (r.reference_id as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      agent_id: (r.original_agent_id as string | null) ?? null,
      archived: true,
    })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const csvHref = (() => {
    const qs = new URLSearchParams();
    if (fromParam) qs.set('from', fromParam);
    if (toParam)   qs.set('to',   toParam);
    if (kindFilter) qs.set('kind', kindFilter);
    return `/api/admin/consumo/${encodeURIComponent(portalEmail)}/export.csv${qs.toString() ? `?${qs.toString()}` : ''}`;
  })();

  // Fix T12 audit 2026-08-10: log LFPDPPP art. 30 (registro de acceso a datos personales).
  const hdrs = await headers();
  await logAdminAccess(supabase, {
    adminEmail:           'admin',   // single-admin setup; extender si hay multi-admin
    endpoint:             `/admin/consumo/${portalEmail}`,
    method:               'GET',
    affectedPortalEmail:  portalEmail,
    queryType:            'view',
    rowsReturned:         entries.length,
    filters:              { from: fromParam, to: toParam, kind: kindFilter },
    ipAddress:            hdrs.get('x-forwarded-for') ?? hdrs.get('x-real-ip'),
    userAgent:            hdrs.get('user-agent'),
  });

  return (
    <div className="min-h-screen p-6" style={{ background: '#FAFBFF', color: '#1A0A3B' }}>
      <div className="mb-4">
        <Link href="/admin/consumo" className="text-[12px] opacity-70 hover:opacity-100">← Consumo de todos los clientes</Link>
        <h1 className="text-2xl font-bold mt-2">{orgName}</h1>
        <p className="text-[13px] opacity-70">{portalEmail} · Facturación: {labelBilling(billingModel)}</p>
      </div>
      <ConsumoClient
        entries={entries}
        fromDate={fromParam}
        toDate={toParam}
        kindFilter={kindFilter}
        portalEmail={portalEmail}
        csvHref={csvHref}
      />
    </div>
  );
}
