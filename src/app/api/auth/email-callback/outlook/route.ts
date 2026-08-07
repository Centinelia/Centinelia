export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient }         from '@/lib/supabase/admin';
import { outlookExchangeCode }       from '@/lib/email/outlook';
import { encrypt }                   from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const code     = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state') ?? '';

  const isAgentScope = rawState.endsWith('__agent');
  const state        = isAgentScope ? rawState.replace(/__agent$/, '') : rawState;

  const errorUrl = state
    ? `${appUrl}/portal/${state}?tab=negocio&email=error#integraciones`
    : `${appUrl}/portal/login`;

  if (!code || !state) return NextResponse.redirect(errorUrl);

  try {
    const tokens  = await outlookExchangeCode(code);
    const supabase = createAdminClient();

    const { data: agent } = await supabase
      .from('voice_agents')
      .select('id, portal_email')
      .eq('portal_token', state)
      .single();

    if (!agent) return NextResponse.redirect(errorUrl);

    const expiresAt        = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    await supabase.from('email_integrations').upsert({
      agent_id:           agent.id,
      provider:           'outlook',
      email:              tokens.email,
      access_token:       tokens.access_token,
      refresh_token:      encryptedRefresh,
      token_expires_at:   expiresAt,
      last_sync_at:       null,
      needs_reauth:       false,
      reauth_notified_at: null,
    }, { onConflict: 'agent_id,provider' });

    if (!isAgentScope && agent.portal_email) {
      const { data: existing } = await supabase
        .from('integration_accounts')
        .select('metadata')
        .eq('portal_email', agent.portal_email)
        .eq('provider', 'outlook')
        .maybeSingle();

      const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};

      await supabase.from('integration_accounts').upsert({
        portal_email:  agent.portal_email,
        provider:      'outlook',
        capability:    'email',
        account_label: tokens.email,
        access_token:  tokens.access_token,
        refresh_token: encryptedRefresh,
        expires_at:    expiresAt,
        status:        'active',
        metadata:      { auto_reply: false, last_sync_at: null, ...existingMeta },
      }, { onConflict: 'portal_email,provider' });
    }

    const successUrl = isAgentScope
      ? `${appUrl}/portal/${state}/configurar?email=connected&provider=outlook`
      : `${appUrl}/portal/${state}?tab=negocio&email=connected&provider=outlook#integraciones`;

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('[outlook-callback] error:', err);
    return NextResponse.redirect(errorUrl);
  }
}
