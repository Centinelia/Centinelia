import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

export const dynamic = 'force-dynamic';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params: _params }: Params) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session?.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Fix M-e audit: sub-users solo bajan CSV si tienen módulo 'cuenta'.
  if (session.isSubUser && !(session.modules ?? []).includes('cuenta')) {
    return NextResponse.json({ error: 'Módulo cuenta requerido' }, { status: 403 });
  }

  // Fix N3 audit 2026-08-10: filtros ?from & ?to (YYYY-MM-DD tz México).
  const fromParam = req.nextUrl.searchParams.get('from');
  const toParam   = req.nextUrl.searchParams.get('to');
  const fromIso = fromParam ? `${fromParam}T00:00:00-06:00` : null;
  const toIso   = toParam   ? `${toParam}T23:59:59-06:00`   : null;

  const supabase = createAdminClient();
  // Union live + archive: cliente accede a retention 7 años (misma paridad
  // que el admin). Ver [[feedback-audit-read-path-fidelity]].
  const buildQuery = (table: string) => {
    let q = supabase
      .from(table)
      .select('id, created_at, amount, kind, source, reference_id, description')
      .eq('portal_email', session.portalEmail)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (fromIso) q = q.gte('created_at', fromIso);
    if (toIso)   q = q.lte('created_at', toIso);
    return q;
  };
  const [liveRes, archiveRes] = await Promise.all([
    buildQuery('ops_ledger'),
    buildQuery('ops_ledger_archive'),
  ]);
  const rows = [...(liveRes.data ?? []), ...(archiveRes.data ?? [])]
    .sort((a, b) => {
      const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return t !== 0 ? t : String(a.id).localeCompare(String(b.id));
    });

  const header = 'fecha,cantidad,tipo,fuente,referencia,descripcion\n';
  // Fix B1 audit 2026-08-10: CSV injection guard.
  const csvSafe = (v: string) => v.replace(/^([=+\-@\t\r])/, "'$1");
  const body = (rows ?? []).map(r => {
    const desc = csvSafe((r.description ?? '').replace(/"/g, '""'));
    return `${r.created_at},${r.amount},${r.kind},${r.source ?? ''},${r.reference_id ?? ''},"${desc}"`;
  }).join('\n');

  const rangeLabel = fromIso || toIso ? `-${fromParam ?? 'inicio'}_a_${toParam ?? 'hoy'}` : '-completo';
  const csv = header + body + '\n';
  const filename = `ops-ledger-${new Date().toISOString().slice(0, 10)}${rangeLabel}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
