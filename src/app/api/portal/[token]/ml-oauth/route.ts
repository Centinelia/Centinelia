export const dynamic = 'force-dynamic';

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

  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!agent?.portal_email) return NextResponse.json({ connected: false });

  const { data } = await supabase
    .from('integration_accounts')
    .select('account_label, status, metadata')
    .eq('portal_email', agent.portal_email)
    .eq('provider', 'mercadolibre')
    .maybeSingle();

  return NextResponse.json({
    connected: !!data && data.status === 'active',
    nickname:  data?.account_label ?? null,
    status:    data?.status ?? null,
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
  const auth   = await verifySession(cookie);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents').select('portal_email').eq('portal_token', token).single();
  if (!agent?.portal_email) return NextResponse.json({ ok: false }, { status: 404 });

  await supabase.from('integration_accounts')
    .delete()
    .eq('portal_email', agent.portal_email)
    .eq('provider', 'mercadolibre');

  return NextResponse.json({ ok: true });
}
