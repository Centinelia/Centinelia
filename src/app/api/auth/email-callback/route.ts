export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gmailExchangeCode }   from '@/lib/email/gmail';
import { outlookExchangeCode } from '@/lib/email/outlook';
import { encrypt }             from '@/lib/crypto';

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

    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id, portal_email')
      .eq('portal_token', state)
      .single();

    if (!agent) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&email=error`);
    }

    const expiresAt       = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    // ── 1. Keep writing to email_integrations (connectors still use this for token refresh) ──
    await supabase.from('email_integrations').upsert({
      agent_id:           agent.id,
      provider,
      email:              tokens.email,
      access_token:       tokens.access_token,
      refresh_token:      encryptedRefresh,
      token_expires_at:   expiresAt,
      last_sync_at:       null,
      needs_reauth:       false,
      reauth_notified_at: null,
    }, { onConflict: 'agent_id,provider' });

    // ── 2. Also write to integration_accounts (org-level, portal UI source of truth) ──
    if (agent.portal_email) {
      // Preserve existing metadata (e.g. auto_reply preference)
      const { data: existing } = await supabase
        .from('integration_accounts')
        .select('metadata')
        .eq('portal_email', agent.portal_email)
        .eq('provider', provider)
        .maybeSingle();

      const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};

      await supabase.from('integration_accounts').upsert({
        portal_email:  agent.portal_email,
        provider,
        capability:    'email',
        account_label: tokens.email,
        access_token:  tokens.access_token,
        refresh_token: encryptedRefresh,
        expires_at:    expiresAt,
        status:        'active',
        metadata:      { auto_reply: false, last_sync_at: null, ...existingMeta },
      }, { onConflict: 'portal_email,provider' });
    }

    return NextResponse.redirect(
      `${appUrl}/portal/${state}?tab=integraciones&email=connected&provider=${provider}`,
    );
  } catch (err) {
    console.error('[email-callback] error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&email=error`);
  }
}
