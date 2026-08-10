import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);

  if (!agent?.portal_email) return NextResponse.json({ connected: false });
  if (session.portalEmail && agent.portal_email !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: qb } = await supabase
    .from('qb_integrations')
    .select('realm_id, company_name, connected_at')
    .eq('portal_email', agent.portal_email)
    .single();

  if (!qb) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected:    true,
    realm_id:     qb.realm_id,
    company_name: qb.company_name,
    connected_at: qb.connected_at,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const session = await verifySession(req.cookies.get(PORTAL_COOKIE)?.value ?? '');
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token } = await params;
  const supabase  = createAdminClient();

  const agent = await getPrimaryAgentFromToken<{ portal_email: string | null }>(token, 'portal_email', supabase);

  if (!agent?.portal_email) return NextResponse.json({ ok: true });
  if (session.portalEmail && agent.portal_email !== session.portalEmail)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { data: qb } = await supabase
    .from('qb_integrations')
    .select('refresh_token')
    .eq('portal_email', agent.portal_email)
    .single();

  if (qb?.refresh_token) {
    try {
      const creds = Buffer.from(
        `${process.env.INTUIT_CLIENT_ID}:${process.env.INTUIT_CLIENT_SECRET}`
      ).toString('base64');
      await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
        method:  'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token: qb.refresh_token }),
      });
    } catch { /* ignore revocation errors */ }
  }

  await supabase
    .from('qb_integrations')
    .delete()
    .eq('portal_email', agent.portal_email);

  return NextResponse.json({ ok: true });
}
