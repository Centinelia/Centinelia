import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();

  if (!agent?.portal_email) return NextResponse.json({ connected: false });

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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('portal_email')
    .eq('portal_token', token)
    .single();

  if (!agent?.portal_email) return NextResponse.json({ ok: true });

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
