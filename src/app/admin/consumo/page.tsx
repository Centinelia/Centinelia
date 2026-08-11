import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { isAdmin } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAdminAccess } from '@/lib/admin/access-log';
import ConsumoGlobalClient from './ConsumoGlobalClient';

export const dynamic = 'force-dynamic';

// Vista global de consumo — todos los clientes en una tabla agregada.
// Complementa /admin/consumo/[email] (drill-down por cliente).

interface SearchParams { searchParams: Promise<{ from?: string; to?: string; sort?: string }> }

export interface OrgConsumo {
  portal_email:      string;
  name:              string;
  billing_model:     string;
  minutes_consumed:  number;   // sum negativo (typically) o abs
  ops_consumed:      number;
  minutes_credited:  number;
  ops_credited:      number;
  ledger_rows:       number;
  last_activity:     string | null;
  agents_count:      number;
}

export default async function AdminConsumoGlobalPage({ searchParams }: SearchParams) {
  if (!(await isAdmin())) redirect('/admin/login?from=/admin/consumo');

  const sp = await searchParams;
  const fromParam = sp.from ?? '';
  const toParam   = sp.to   ?? '';
  const sortParam = sp.sort ?? 'minutes_consumed';
  const fromIso = fromParam ? `${fromParam}T00:00:00-06:00` : null;
  const toIso   = toParam   ? `${toParam}T23:59:59-06:00`   : null;

  const supabase = createAdminClient();

  // 1. Fetch todas las orgs
  const { data: orgsData } = await supabase
    .from('organizations')
    .select('portal_email, name, billing_model')
    .order('portal_email', { ascending: true });
  const orgs = (orgsData ?? []) as Array<{ portal_email: string; name: string | null; billing_model: string | null }>;

  // 2. Para cada org, agregar consumo en rango — batched via 2 queries totales
  //    (una para minutes_ledger, otra para ops_ledger) evitando N+1.
  const emails = orgs.map(o => o.portal_email);

  const [minRes, opsRes, agentsRes] = await Promise.all([
    emails.length ? supabase
      .from('minutes_ledger')
      .select('portal_email, amount, kind, created_at')
      .in('portal_email', emails)
      .gte('created_at', fromIso ?? '2000-01-01')
      .lte('created_at', toIso ?? '2099-12-31')
      .limit(50000)
    : { data: [] as Array<{ portal_email: string; amount: number; kind: string; created_at: string }> },
    emails.length ? supabase
      .from('ops_ledger')
      .select('portal_email, amount, kind, created_at')
      .in('portal_email', emails)
      .gte('created_at', fromIso ?? '2000-01-01')
      .lte('created_at', toIso ?? '2099-12-31')
      .limit(50000)
    : { data: [] as Array<{ portal_email: string; amount: number; kind: string; created_at: string }> },
    emails.length ? supabase
      .from('voice_agents')
      .select('portal_email, active')
      .in('portal_email', emails)
    : { data: [] as Array<{ portal_email: string; active: boolean }> },
  ]);

  const minRows = (minRes.data ?? []) as Array<{ portal_email: string; amount: number; kind: string; created_at: string }>;
  const opsRows = (opsRes.data ?? []) as Array<{ portal_email: string; amount: number; kind: string; created_at: string }>;
  const agentRows = (agentsRes.data ?? []) as Array<{ portal_email: string; active: boolean | null }>;

  // 3. Agregar por org
  const consumoByEmail = new Map<string, OrgConsumo>();
  for (const o of orgs) {
    consumoByEmail.set(o.portal_email, {
      portal_email:      o.portal_email,
      name:              o.name ?? o.portal_email,
      billing_model:     o.billing_model ?? 'stripe',
      minutes_consumed:  0,
      ops_consumed:      0,
      minutes_credited:  0,
      ops_credited:      0,
      ledger_rows:       0,
      last_activity:     null,
      agents_count:      0,
    });
  }
  for (const r of minRows) {
    const c = consumoByEmail.get(r.portal_email);
    if (!c) continue;
    if (r.amount < 0) c.minutes_consumed += Math.abs(r.amount);
    else c.minutes_credited += r.amount;
    c.ledger_rows++;
    if (!c.last_activity || r.created_at > c.last_activity) c.last_activity = r.created_at;
  }
  for (const r of opsRows) {
    const c = consumoByEmail.get(r.portal_email);
    if (!c) continue;
    if (r.amount < 0) c.ops_consumed += Math.abs(r.amount);
    else c.ops_credited += r.amount;
    c.ledger_rows++;
    if (!c.last_activity || r.created_at > c.last_activity) c.last_activity = r.created_at;
  }
  for (const a of agentRows) {
    const c = consumoByEmail.get(a.portal_email);
    if (c && a.active) c.agents_count++;
  }

  const rows = Array.from(consumoByEmail.values());

  // Sort
  const sortKey = sortParam as keyof OrgConsumo;
  rows.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === 'number' && typeof bv === 'number') return bv - av;   // desc
    if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv);
    return 0;
  });

  // Totales globales
  const totals = rows.reduce(
    (acc, r) => ({
      minutes_consumed: acc.minutes_consumed + r.minutes_consumed,
      ops_consumed:     acc.ops_consumed + r.ops_consumed,
      minutes_credited: acc.minutes_credited + r.minutes_credited,
      ops_credited:     acc.ops_credited + r.ops_credited,
      ledger_rows:      acc.ledger_rows + r.ledger_rows,
      active_orgs:      acc.active_orgs + (r.agents_count > 0 ? 1 : 0),
    }),
    { minutes_consumed: 0, ops_consumed: 0, minutes_credited: 0, ops_credited: 0, ledger_rows: 0, active_orgs: 0 },
  );

  // CSV href para vista agregada
  const csvHref = (() => {
    const qs = new URLSearchParams();
    if (fromParam) qs.set('from', fromParam);
    if (toParam)   qs.set('to',   toParam);
    return `/api/admin/consumo/global.csv${qs.toString() ? `?${qs.toString()}` : ''}`;
  })();

  // LFPDPPP audit log
  const hdrs = await headers();
  await logAdminAccess(supabase, {
    adminEmail:  'admin',
    endpoint:    '/admin/consumo',
    method:      'GET',
    queryType:   'view',
    rowsReturned: rows.length,
    filters:     { from: fromParam, to: toParam, sort: sortParam },
    ipAddress:   hdrs.get('x-forwarded-for') ?? hdrs.get('x-real-ip'),
    userAgent:   hdrs.get('user-agent'),
  });

  return (
    <div className="min-h-screen p-6" style={{ background: '#FAFBFF', color: '#1A0A3B' }}>
      <div className="mb-4">
        <Link href="/admin/clientes" className="text-[12px] opacity-70 hover:opacity-100">← Lista de clientes</Link>
        <h1 className="text-2xl font-bold mt-2">Consumo — todos los clientes</h1>
        <p className="text-[13px] opacity-70">
          {rows.length} clientes registrados · {totals.active_orgs} con empleados activos · {totals.ledger_rows} movimientos en el rango
        </p>
      </div>
      <ConsumoGlobalClient
        rows={rows}
        totals={totals}
        fromDate={fromParam}
        toDate={toParam}
        sortKey={sortParam}
        csvHref={csvHref}
      />
    </div>
  );
}
