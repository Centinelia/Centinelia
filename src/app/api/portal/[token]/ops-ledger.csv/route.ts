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

  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from('ops_ledger')
    .select('created_at, amount, kind, source, reference_id, description')
    .eq('portal_email', session.portalEmail)
    .order('created_at', { ascending: true });

  const header = 'fecha,cantidad,tipo,fuente,referencia,descripcion\n';
  const body = (rows ?? []).map(r => {
    const desc = (r.description ?? '').replace(/"/g, '""');
    return `${r.created_at},${r.amount},${r.kind},${r.source ?? ''},${r.reference_id ?? ''},"${desc}"`;
  }).join('\n');

  const csv = header + body + '\n';
  const filename = `ops-ledger-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
