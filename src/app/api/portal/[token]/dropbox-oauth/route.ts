export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { resolveOrgFromToken } from '@/lib/portal/org-token';

interface Params { params: Promise<{ token: string }> }

// GET — estado actual de la conexión Dropbox de la org
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('integration_accounts')
    .select('account_label, status, expires_at')
    .eq('portal_email', resolved.portalEmail)
    .eq('provider', 'dropbox')
    .maybeSingle();

  if (!data || data.status === 'disconnected') {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({
    connected:    true,
    email:        data.account_label,
    needs_reauth: data.status === 'needs_reauth',
  });
}

// DELETE — desconectar Dropbox
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const resolved = await resolveOrgFromToken(token);
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.portalEmail !== resolved.portalEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createAdminClient();
  await supabase.from('integration_accounts')
    .update({ status: 'disconnected', access_token: '', refresh_token: null })
    .eq('portal_email', resolved.portalEmail)
    .eq('provider', 'dropbox');

  return NextResponse.json({ ok: true });
}
