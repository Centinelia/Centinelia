export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { gmailExchangeCode }   from '@/lib/email/gmail';
import { outlookExchangeCode } from '@/lib/email/outlook';
import { encrypt }             from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const provider  = req.nextUrl.searchParams.get('provider') as 'gmail' | 'outlook' | null;
  const code      = req.nextUrl.searchParams.get('code');
  const rawState  = req.nextUrl.searchParams.get('state') ?? '';

  // __agent suffix means per-agent connect from configurar page
  const isAgentScope = rawState.endsWith('__agent');
  const state        = isAgentScope ? rawState.replace(/__agent$/, '') : rawState;

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

    // ── 2. For account-level connects (IntegrationsHub), also write to integration_accounts ──
    if (!isAgentScope && agent.portal_email) {
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

    // Per-agent connect → redirect back to configurar; account-level → integraciones tab
    const successUrl = isAgentScope
      ? `${appUrl}/portal/${state}/configurar?email=connected&provider=${provider}`
      : `${appUrl}/portal/${state}?tab=integraciones&email=connected&provider=${provider}`;

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('[email-callback] error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=integraciones&email=error`);
  }
}
