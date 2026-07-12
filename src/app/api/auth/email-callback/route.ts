export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gmailExchangeCode }   from '@/lib/email/gmail';
import { outlookExchangeCode } from '@/lib/email/outlook';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const provider = req.nextUrl.searchParams.get('provider') as 'gmail' | 'outlook' | null;
  const code     = req.nextUrl.searchParams.get('code');
  const state    = req.nextUrl.searchParams.get('state'); // portal_token

  if (!provider || !code || !state) {
    return NextResponse.redirect(`${appUrl}/portal/${state ?? ''}?tab=integraciones&email=error`);
  }

  try {
    const tokens = provider === 'gmail'
      ? await gmailExchangeCode(code)
      : await outlookExchangeCode(code);

    const supabase = createAdminClient();

    // Resolve agent_id from portal token
    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id')
      .eq('portal_token', state)
      .single();

    if (!agent) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&email=error`);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('email_integrations').upsert({
      agent_id:        agent.id,
      provider,
      email:           tokens.email,
      access_token:    tokens.access_token,
      refresh_token:   tokens.refresh_token,
      token_expires_at: expiresAt,
      last_sync_at:    null,
    }, { onConflict: 'agent_id,provider' });

    return NextResponse.redirect(
      `${appUrl}/portal/${state}?tab=integraciones&email=connected&provider=${provider}`,
    );
  } catch (err) {
    console.error('[email-callback] error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&email=error`);
  }
}
