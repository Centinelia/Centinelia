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
  let query = supabase
    .from('ops_ledger')
    .select('id, created_at, amount, kind, source, reference_id, description')
    .eq('portal_email', session.portalEmail)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });   // Fix B2 audit: stable tie-breaker
  if (fromIso) query = query.gte('created_at', fromIso);
  if (toIso)   query = query.lte('created_at', toIso);
  const { data: rows } = await query;

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
