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

  // Extrae token del rawState antes de verificar, para no redirigir a /portal/ (404).
  const tokenFromRaw = rawState.includes('.') ? rawState.split('.')[0] : rawState;
  const backToPortal = (params: string) =>
    tokenFromRaw
      ? `${appUrl}/portal/${tokenFromRaw}?${params}#integraciones`
      : `${appUrl}/portal/login?${params}`;

  if (error || !code || !rawState) {
    console.warn('[dropbox-callback] missing params', { hasCode: !!code, hasState: !!rawState, error });
    return NextResponse.redirect(backToPortal('tab=organizacion&dropbox=error'));
  }

  const stateCheck = verifyOAuthState(req, 'dropbox', rawState);
  if (!stateCheck.ok || !stateCheck.portalToken) {
    console.warn('[dropbox-callback] OAuth state nonce mismatch:', {
      reason:    stateCheck.reason,
      hasCookie: !!req.cookies.get('oauth_state')?.value,
    });
    return NextResponse.redirect(backToPortal('tab=organizacion&dropbox=csrf_nonce'));
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
    console.error('[dropbox-callback] error:', err);
    return NextResponse.redirect(`${appUrl}/portal/${state}?tab=organizacion&dropbox=error#integraciones`);
  }
}
