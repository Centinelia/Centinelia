import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string; id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token, id } = await params;
  const supabase = createAdminClient();

  const { data: acct } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!acct?.portal_email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { error } = await supabase
    .from('heartbeat_runs')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('portal_email', acct.portal_email)  // IDOR guard: no puede marcar otro portal
    .is('read_at', null);                     // idempotente: no re-marca

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
