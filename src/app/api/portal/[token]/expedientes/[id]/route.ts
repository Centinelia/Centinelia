import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const session = await verifySession(cookie);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { token, id } = await ctx.params;
  const resolved      = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (session.portalEmail && resolved.portalEmail && session.portalEmail !== resolved.portalEmail)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const supabase = createAdminClient();

  const [expedienteRes, eventosRes] = await Promise.all([
    supabase.from('expedientes_compras')
      .select('*')
      .eq('id', id)
      .eq('portal_email', resolved.portalEmail)
      .single(),
    supabase.from('expediente_eventos')
      .select('id, tipo, from_status, to_status, actor, detalle, created_at')
      .eq('expediente_id', id)
      .eq('portal_email', resolved.portalEmail)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (expedienteRes.error || !expedienteRes.data) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    expediente: expedienteRes.data,
    eventos:    eventosRes.data ?? [],
  });
}
