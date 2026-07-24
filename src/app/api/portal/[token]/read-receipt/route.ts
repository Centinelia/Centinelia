import { NextRequest, NextResponse }    from 'next/server';
import { createAdminClient }            from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';

interface Params { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token }                      = await params;
  const { item_type, item_id } = await req.json() as { item_type: string; item_id: string };

  if (!item_type || !item_id)
    return NextResponse.json({ error: 'item_type e item_id requeridos' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!agent?.portal_email) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  if (auth.portalEmail && agent.portal_email !== auth.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await supabase.from('portal_read_receipts').upsert({
    portal_email: agent.portal_email,
    item_type,
    item_id,
    seen_at: new Date().toISOString(),
  }, { onConflict: 'portal_email,item_type,item_id' });

  return NextResponse.json({ ok: true });
}
