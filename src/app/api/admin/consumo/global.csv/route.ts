import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { logAdminAccess } from '@/lib/admin/access-log';

export const dynamic = 'force-dynamic';

// Vista global — export agregado de consumo por cliente en el rango pedido.
// Complementa /api/admin/consumo/[email]/export.csv (drill-down per-client).

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam   = req.nextUrl.searchParams.get('to');
  const fromIso = fromParam ? `${fromParam}T00:00:00-06:00` : null;
  const toIso   = toParam   ? `${toParam}T23:59:59-06:00`   : null;

  const supabase = createAdminClient();
  const csvSafe = (v: string) => v.replace(/^([=+\-@\t\r])/, "'$1");

  const { data: orgsData } = await supabase
    .from('organizations')
    .select('portal_email, name, billing_model')
    .order('portal_email', { ascending: true });
  const orgs = (orgsData ?? []) as Array<{ portal_email: string; name: string | null; billing_model: string | null }>;
  const emails = orgs.map(o => o.portal_email);

  const [minRes, opsRes, agentsRes] = await Promise.all([
    emails.length ? supabase
      .from('minutes_ledger')
      .select('portal_email, amount, kind, created_at')
      .in('portal_email', emails)
      .gte('created_at', fromIso ?? '2000-01-01')
      .lte('created_at', toIso ?? '2099-12-31')
      .limit(100000)
    : { data: [] as Array<{ portal_email: string; amount: number; kind: string; created_at: string }> },
    emails.length ? supabase
      .from('ops_ledger')
      .select('portal_email, amount, kind, created_at')
      .in('portal_email', emails)
      .gte('created_at', fromIso ?? '2000-01-01')
      .lte('created_at', toIso ?? '2099-12-31')
      .limit(100000)
    : { data: [] as Array<{ portal_email: string; amount: number; kind: string; created_at: string }> },
    emails.length ? supabase
      .from('voice_agents')
      .select('portal_email, active')
      .in('portal_email', emails)
    : { data: [] as Array<{ portal_email: string; active: boolean | null }> },
  ]);

  interface Aggr {
    portal_email:      string;
    name:              string;
    billing_model:     string;
    minutes_consumed:  number;
    minutes_credited:  number;
    ops_consumed:      number;
    ops_credited:      number;
    ledger_rows:       number;
    last_activity:     string;
    agents_active:     number;
  }

  const agg = new Map<string, Aggr>();
  for (const o of orgs) {
    agg.set(o.portal_email, {
      portal_email:  o.portal_email,
      name:          o.name ?? o.portal_email,
      billing_model: o.billing_model ?? 'stripe',
      minutes_consumed: 0, minutes_credited: 0,
      ops_consumed: 0,     ops_credited: 0,
      ledger_rows: 0, last_activity: '', agents_active: 0,
    });
  }
  for (const r of ((minRes.data ?? []) as Array<{ portal_email: string; amount: number; created_at: string }>)) {
    const c = agg.get(r.portal_email); if (!c) continue;
    if (r.amount < 0) c.minutes_consumed += Math.abs(r.amount);
    else c.minutes_credited += r.amount;
    c.ledger_rows++;
    if (r.created_at > c.last_activity) c.last_activity = r.created_at;
  }
  for (const r of ((opsRes.data ?? []) as Array<{ portal_email: string; amount: number; created_at: string }>)) {
    const c = agg.get(r.portal_email); if (!c) continue;
    if (r.amount < 0) c.ops_consumed += Math.abs(r.amount);
    else c.ops_credited += r.amount;
    c.ledger_rows++;
    if (r.created_at > c.last_activity) c.last_activity = r.created_at;
  }
  for (const a of ((agentsRes.data ?? []) as Array<{ portal_email: string; active: boolean | null }>)) {
    const c = agg.get(a.portal_email); if (c && a.active) c.agents_active++;
  }

  const rows = Array.from(agg.values()).sort((a, b) => b.minutes_consumed - a.minutes_consumed);

  // Totales
  const t = rows.reduce((acc, r) => ({
    min_used: acc.min_used + r.minutes_consumed,
    min_cred: acc.min_cred + r.minutes_credited,
    ops_used: acc.ops_used + r.ops_consumed,
    ops_cred: acc.ops_cred + r.ops_credited,
    rows_l:   acc.rows_l   + r.ledger_rows,
  }), { min_used: 0, min_cred: 0, ops_used: 0, ops_cred: 0, rows_l: 0 });

  const now = new Date().toISOString();
  const rangeLabel = fromParam || toParam ? `${fromParam ?? 'inicio'}_a_${toParam ?? 'hoy'}` : 'completo';
  const meta = [
    `# Centinelia — Reporte de consumo global (todas las organizaciones)`,
    `# Rango: ${rangeLabel}`,
    `# Generado: ${now} (UTC)`,
    `# Organizaciones: ${rows.length}`,
    `# Total minutos consumidos: ${t.min_used}`,
    `# Total minutos acreditados: ${t.min_cred}`,
    `# Total tareas consumidas: ${t.ops_used}`,
    `# Total tareas acreditadas: ${t.ops_cred}`,
    `# Total rows de ledger en rango: ${t.rows_l}`,
    `# Timezone filtro: America/Mexico_City`,
    `#`,
  ].join('\n');

  const header = 'portal_email,nombre,modelo,minutos_consumidos,minutos_acreditados,tareas_consumidas,tareas_acreditadas,empleados_activos,ledger_rows,ultima_actividad_utc\n';
  const body = rows.map(r => {
    const nm  = csvSafe(r.name.replace(/"/g, '""'));
    const em  = csvSafe(r.portal_email);
    const mod = csvSafe(r.billing_model);
    return `${em},"${nm}",${mod},${r.minutes_consumed},${r.minutes_credited},${r.ops_consumed},${r.ops_credited},${r.agents_active},${r.ledger_rows},${r.last_activity}`;
  }).join('\n');

  const csv = meta + '\n' + header + body + '\n';
  const filename = `consumo-global-${rangeLabel}-${new Date().toISOString().slice(0, 10)}.csv`;

  await logAdminAccess(supabase, {
    adminEmail:   'admin',
    endpoint:     '/api/admin/consumo/global.csv',
    method:       'GET',
    queryType:    'export_csv',
    rowsReturned: rows.length,
    filters:      { from: fromParam, to: toParam, kind: 'all' },
    ipAddress:    req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
    userAgent:    req.headers.get('user-agent'),
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
