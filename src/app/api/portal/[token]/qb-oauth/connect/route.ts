import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase  = createAdminClient();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('id')
    .eq('portal_token', token)
    .single();

  if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const redirectUri = `${appUrl}/api/portal/${token}/qb-oauth/callback`;

  const authParams = new URLSearchParams({
    client_id:     process.env.INTUIT_CLIENT_ID!,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'com.intuit.quickbooks.accounting',
    state:         token,
  });

  return NextResponse.redirect(
    `https://appcenter.intuit.com/connect/oauth2?${authParams.toString()}`
  );
}
