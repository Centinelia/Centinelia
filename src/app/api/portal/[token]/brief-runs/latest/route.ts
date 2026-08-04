import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  // IDOR guard: verify this portal token belongs to the authenticated session
  const { data: acct } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();
  if (!acct?.portal_email) return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  if (auth.portalEmail !== acct.portal_email)
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data, error } = await supabase
    .from('brief_runs')
    .select('id, brief_md, buckets_json, ran_at, trigger')
    .eq('portal_email', acct.portal_email)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'not_found' }, { status: 404 });

  return NextResponse.json(data);
}
