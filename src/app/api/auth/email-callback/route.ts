export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { gmailExchangeCode }   from '@/lib/email/gmail';
import { outlookExchangeCode } from '@/lib/email/outlook';
import { encrypt }             from '@/lib/crypto';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { verifyOAuthState, clearOAuthState } from '@/lib/oauth/state';

export async function GET(req: NextRequest) {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const provider  = req.nextUrl.searchParams.get('provider') as 'gmail' | 'outlook' | null;
  const code      = req.nextUrl.searchParams.get('code');
  const rawState  = req.nextUrl.searchParams.get('state') ?? '';

  if (!provider || !code || !rawState) {
    return NextResponse.redirect(`${appUrl}/portal/?tab=organizacion&email=error#integraciones`);
  }

  // A-D3: verify nonce cookie. verifyOAuthState devuelve portalToken (con
  // sufijo __agent si aplica). Legacy state (sin .nonce) se acepta con warning.
  const stateCheck = verifyOAuthState(req, provider, rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[email-callback] OAuth state nonce mismatch:', stateCheck.reason);
    return NextResponse.redirect(`${appUrl}/portal/?tab=organizacion&email=csrf_nonce#integraciones`);
  }
  if (stateCheck.legacy) {
    console.warn('[email-callback] OAuth state legacy format (rollout in progress)');
  }
  const portalTokenFromState = stateCheck.portalToken;
  const isAgentScope         = portalTokenFromState.endsWith('__agent');
  const state                = isAgentScope ? portalTokenFromState.replace(/__agent$/, '') : portalTokenFromState;

  try {
    const tokens = provider === 'gmail'
      ? await gmailExchangeCode(code)
      : await outlookExchangeCode(code);

    const supabase = createAdminClient();

    const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
      state, 'id, portal_email', supabase,
    );

    if (!agent) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&email=error#integraciones`);
    }

    // CSRF gate — sesión del portal matchea state.portalEmail. Ver Scope C3 MEDIUM.
    const cookie  = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = await verifySession(cookie);
    if (!session || (agent.portal_email && session.portalEmail !== agent.portal_email)) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&email=csrf#integraciones`);
    }

    const expiresAt       = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    // ── 1. Per-agent (scope=agent) → email_integrations. Org-level NO escribe aquí. ──
    // Antes escribíamos en ambos, lo que causaba que la conexión org apareciera como
    // "correo del empleado" en la config del agente que casualmente inició el OAuth.
    if (isAgentScope) {
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
    }

    // ── 2. Org-level (IntegrationsHub) → integration_accounts. ──
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

    const successUrl = isAgentScope
      ? `${appUrl}/portal/${state}/configurar?email=connected&provider=${provider}`
      : `${appUrl}/portal/${state}?tab=organizacion&email=connected&provider=${provider}#integraciones`;

    const successRes = NextResponse.redirect(successUrl);
    clearOAuthState(successRes);
    return successRes;
  } catch (err) {
    console.error('[email-callback] error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&email=error#integraciones`);
  }
}
