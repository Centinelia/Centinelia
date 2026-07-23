import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const supabase  = createAdminClient();

    const { data: agent, error: agentError } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_token', token)
      .single();

    if (agentError) console.error('QB connect: agent lookup error', agentError);
    if (!agent) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const clientId = process.env.INTUIT_CLIENT_ID;
    if (!clientId) {
      console.error('QB connect: INTUIT_CLIENT_ID not set');
      return NextResponse.json({ error: 'QB not configured' }, { status: 500 });
    }

    const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
    const redirectUri = `${appUrl}/api/qb-oauth/callback`;

    const authParams = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  redirectUri,
      response_type: 'code',
      scope:         'com.intuit.quickbooks.accounting',
      state:         token,
    });

    return NextResponse.redirect(
      `https://appcenter.intuit.com/connect/oauth2?${authParams.toString()}`
    );
  } catch (err) {
    console.error('QB connect: unexpected error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
