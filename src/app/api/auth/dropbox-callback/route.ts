export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPrimaryAgentFromToken } from '@/lib/portal/org-token';
import { dropboxExchangeCode } from '@/lib/dropbox/oauth';
import { encrypt } from '@/lib/crypto';
import { verifySession, PORTAL_COOKIE } from '@/lib/portal/auth';
import { verifyOAuthState, clearOAuthState } from '@/lib/oauth/state';

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.centinelia.mx';
  const code = req.nextUrl.searchParams.get('code');
  const rawState = req.nextUrl.searchParams.get('state') ?? '';
  const error = req.nextUrl.searchParams.get('error');

  // Pre-verify redirects: /portal/login SIEMPRE (nunca usar rawState.token
  // porque es untrusted URL param). Solo después de verifyOAuthState podemos
  // confiar en el token que trae el state — antes de eso, un atacante puede
  // meter cualquier token y hacer que el usuario aterrice en un portal ajeno
  // o que se logueen tokens ajenos.
  const loginRedirect = (params: string) => `${appUrl}/portal/login?${params}`;

  if (error || !code || !rawState) {
    console.warn('[dropbox-callback] missing params', { hasCode: !!code, hasState: !!rawState, error });
    return NextResponse.redirect(loginRedirect('dropbox=error'));
  }

  const stateCheck = verifyOAuthState(req, 'dropbox', rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[dropbox-callback] OAuth state nonce mismatch:', {
      reason:    stateCheck.reason,
      hasCookie: !!req.cookies.get('oauth_state')?.value,
    });
    return NextResponse.redirect(loginRedirect('dropbox=csrf_nonce'));
  }
  const state = stateCheck.portalToken;

  try {
    const tokens = await dropboxExchangeCode(code);
    const supabase = createAdminClient();

    const agent = await getPrimaryAgentFromToken<{ id: string; portal_email: string | null }>(
      state, 'id, portal_email', supabase,
    );
    if (!agent || !agent.portal_email) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&dropbox=error#integraciones`);
    }

    // CSRF gate — sesión del portal matches state.portalEmail
    const cookie = req.cookies.get(PORTAL_COOKIE)?.value ?? '';
    const session = await verifySession(cookie);
    if (!session || session.portalEmail !== agent.portal_email) {
      return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&dropbox=csrf#integraciones`);
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    const { data: existing } = await supabase
      .from('integration_accounts')
      .select('metadata')
      .eq('portal_email', agent.portal_email)
      .eq('provider', 'dropbox')
      .maybeSingle();
    const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};

    await supabase.from('integration_accounts').upsert({
      portal_email:  agent.portal_email,
      provider:      'dropbox',
      capability:    'files',
      account_label: tokens.email,
      access_token:  tokens.access_token,
      refresh_token: encryptedRefresh,
      expires_at:    expiresAt,
      status:        'active',
      metadata:      { ...existingMeta },
    }, { onConflict: 'portal_email,provider' });

    const successRes = NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&dropbox=connected#integraciones`);
    clearOAuthState(successRes);
    return successRes;
  } catch (err) {
    // Sanitizar: NO loggear el objeto completo (puede contener tokens de la
    // respuesta de Dropbox). Solo mensaje y code.
    const msg  = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    console.error('[dropbox-callback] error:', { message: msg, code });
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&dropbox=error#integraciones`);
  }
}
