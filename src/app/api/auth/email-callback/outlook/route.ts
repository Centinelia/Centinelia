export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient }         from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken }  from '@/lib/portal/org-token';
import { outlookExchangeCode }       from '@/lib/email/outlook';
import { encrypt }                   from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const code     = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state') ?? '';

  // State format (A-D3 nonce): `${baseToken}.${nonce}` — donde baseToken puede
  // incluir el sufijo __agent si el flow inició con scope=agent. Antes del
  // nonce esto era solo `${baseToken}` y el callback hacía endsWith('__agent')
  // sobre rawState, lo cual dejó de funcionar al agregar `.${nonce}` (el string
  // ya no termina en __agent, termina en el nonce). Corrección: partir por el
  // primer '.' PRIMERO, luego evaluar el marker sobre la parte del token.
  const dotIdx      = rawState.indexOf('.');
  const tokenPart   = dotIdx >= 0 ? rawState.slice(0, dotIdx) : rawState;
  const isAgentScope = tokenPart.endsWith('__agent');
  const state        = isAgentScope ? tokenPart.replace(/__agent$/, '') : tokenPart;

  const errorUrl = state
    ? `${appUrl}/portal/${state}?tab=organizacion&email=error#integraciones`
    : `${appUrl}/portal/login`;

  if (!code || !state) return NextResponse.redirect(errorUrl);

  try {
    const tokens  = await outlookExchangeCode(code);
    const supabase = createAdminClient();

    const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
      state, 'id, portal_email', supabase,
    );

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
      : `${appUrl}/portal/${state}?tab=organizacion&email=connected&provider=outlook#integraciones`;

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error('[outlook-callback] error:', err);
    return NextResponse.redirect(errorUrl);
  }
}
