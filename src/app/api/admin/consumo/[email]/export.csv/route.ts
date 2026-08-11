import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/admin/auth';
import { logAdminAccess } from '@/lib/admin/access-log';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ email: string }> }

// Fix N1 audit 2026-08-10: export admin del consumo completo de un cliente,
// filtrable por rango de fechas y kind. Incluye rows archivadas (retention 7
// años). Merged de minutes_ledger + ops_ledger + *_archive con columna
// `recurso` para diferenciar.
export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { email: rawEmail } = await params;
  const portalEmail = decodeURIComponent(rawEmail);

  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam   = req.nextUrl.searchParams.get('to');
  const kindFilter = req.nextUrl.searchParams.get('kind');
  const fromIso = fromParam ? `${fromParam}T00:00:00-06:00` : null;
  const toIso   = toParam   ? `${toParam}T23:59:59-06:00`   : null;

  const supabase = createAdminClient();

  const buildQuery = (table: string, archived: boolean) => {
    let q = supabase
      .from(table)
      .select(archived
        ? 'created_at, amount, kind, source, reference_id, description, original_agent_id'
        : 'created_at, amount, kind, source, reference_id, description, agent_id')
      .eq('portal_email', portalEmail)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })   // Fix B2 audit: stable tie-breaker
      .limit(50000);
    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso)   q = q.lte('created_at', toIso);
    if (kindFilter) q = q.eq('kind', kindFilter);
    return q;
  };

  const [minRes, opsRes, minArchRes, opsArchRes] = await Promise.all([
    buildQuery('minutes_ledger',         false),
    buildQuery('ops_ledger',             false),
    buildQuery('minutes_ledger_archive', true),
    buildQuery('ops_ledger_archive',     true),
  ]);

  interface Row {
    created_at:   string;
    recurso:      'minutos' | 'tareas';
    amount:       number;
    kind:         string;
    source:       string;
    reference_id: string;
    agent_id:     string;
    archivado:    'si' | 'no';
    descripcion:  string;
  }

  const rows: Row[] = [
    ...((minRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      created_at: r.created_at as string,
      recurso: 'minutos' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? '',
      source: (r.source as string | null) ?? '',
      reference_id: (r.reference_id as string | null) ?? '',
      agent_id: (r.agent_id as string | null) ?? '',
      archivado: 'no' as const,
      descripcion: (r.description as string | null) ?? '',
    })),
    ...((opsRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      created_at: r.created_at as string,
      recurso: 'tareas' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? '',
      source: (r.source as string | null) ?? '',
      reference_id: (r.reference_id as string | null) ?? '',
      agent_id: (r.agent_id as string | null) ?? '',
      archivado: 'no' as const,
      descripcion: (r.description as string | null) ?? '',
    })),
    ...((minArchRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      created_at: r.created_at as string,
      recurso: 'minutos' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? '',
      source: (r.source as string | null) ?? '',
      reference_id: (r.reference_id as string | null) ?? '',
      agent_id: (r.original_agent_id as string | null) ?? '',
      archivado: 'si' as const,
      descripcion: (r.description as string | null) ?? '',
    })),
    ...((opsArchRes.data ?? []) as Array<Record<string, unknown>>).map(r => ({
      created_at: r.created_at as string,
      recurso: 'tareas' as const,
      amount: (r.amount as number) ?? 0,
      kind: (r.kind as string) ?? '',
      source: (r.source as string | null) ?? '',
      reference_id: (r.reference_id as string | null) ?? '',
      agent_id: (r.original_agent_id as string | null) ?? '',
      archivado: 'si' as const,
      descripcion: (r.description as string | null) ?? '',
    })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Running balance por recurso
  let bMin = 0, bOps = 0;
  const withBalance = rows.map(r => {
    if (r.recurso === 'minutos') { bMin += r.amount; return { ...r, balance: bMin }; }
    bOps += r.amount; return { ...r, balance: bOps };
  });

  // Header metadata para auditor
  const now = new Date().toISOString();
  const rangeLabel = fromParam || toParam ? `${fromParam ?? 'inicio'}_a_${toParam ?? 'hoy'}` : 'completo';
  const meta = [
    `# Centinelia — Reporte de consumo`,
    `# Cliente: ${portalEmail}`,
    `# Rango: ${rangeLabel}`,
    `# Kind filter: ${kindFilter ?? 'todos'}`,
    `# Generado: ${now} (UTC)`,
    `# Total minutos (neto): ${bMin}`,
    `# Total tareas (neto): ${bOps}`,
    `# Rows: ${withBalance.length}`,
    `# Timezone rango filtro: America/Mexico_City`,
    `#`,
  ].join('\n');

  const header = 'fecha_utc,recurso,kind,monto,saldo,fuente,referencia,agent_id,archivado,descripcion\n';
  // Fix B1 audit 2026-08-10: CSV injection guard en TODAS las celdas string.
  // Prevent =/+/-/@ prefix formulas que Excel ejecuta al abrir.
  const csvSafe = (v: string) => v.replace(/^([=+\-@\t\r])/, "'$1");
  const body = withBalance.map(r => {
    const desc = csvSafe((r.descripcion ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' '));
    const src  = csvSafe(String(r.source ?? ''));
    const ref  = csvSafe(String(r.reference_id ?? ''));
    const kind = csvSafe(String(r.kind ?? ''));
    return `${r.created_at},${r.recurso},${kind},${r.amount},${r.balance},${src},${ref},${r.agent_id},${r.archivado},"${desc}"`;
  }).join('\n');

  const csv = meta + '\n' + header + body + '\n';
  const filename = `consumo-${portalEmail.replace(/[^a-z0-9]/gi, '_')}-${rangeLabel}-${new Date().toISOString().slice(0, 10)}.csv`;

  // Fix T12 audit: log LFPDPPP art. 30.
  await logAdminAccess(supabase, {
    adminEmail:           'admin',
    endpoint:             `/api/admin/consumo/${portalEmail}/export.csv`,
    method:               'GET',
    affectedPortalEmail:  portalEmail,
    queryType:            'export_csv',
    rowsReturned:         withBalance.length,
    filters:              { from: fromParam, to: toParam, kind: kindFilter },
    ipAddress:            req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
    userAgent:            req.headers.get('user-agent'),
  });

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
